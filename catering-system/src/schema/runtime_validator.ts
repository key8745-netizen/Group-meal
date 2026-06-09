/**
 * runtime_validator.ts
 *
 * Feature 009 Phase 5F: Production Readiness Next-Step Planning
 *
 * Pure-logic, non-executable contract/model layer for readiness-only runtime
 * schema validation of tokens and feature flags. This module:
 *   - validates token/flag schema shape (well-formed / malformed / missing /
 *     stale / version-mismatch)
 *   - defaults to DENY for ANY malformed, missing, stale, or version-mismatched
 *     input — never fails open
 *   - emits SOC/audit payloads (with all SSOT-required fields) on rejection
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no real schema-registry/SDK calls, no I/O
 *  - MUST NOT import from `src/core/`, `src/database/`, `src/production/`
 *  - Pure synchronous — default-deny on any missing/malformed/stale/mismatched input
 *  - Isolated under `src/schema/`
 */

import type { BlockedReason } from '../types/aiBoundary';

export const IS_PRODUCTION_READINESS_ONLY = true as const;

/** Current contract schema version — used for version-mismatch detection */
export const SCHEMA_VERSION = 1;

/** Token/flag staleness window — anything older is modeled as STALE */
export const STALE_AFTER_SECONDS = 24 * 60 * 60;

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

// ─── SOC / Audit payload (all SSOT-required fields) ──────────────────────────

export type SchemaValidationDecision = 'ALLOW' | 'DENY';

export interface SocAuditPayload {
  readonly _kind: 'f009_phase5f_soc_audit_payload';
  readonly executable: false;
  eventType: string;
  tenantId: string;
  operatorId: string;
  decision: SchemaValidationDecision;
  blockedReason: BlockedReason;
  source: string;
  occurredAt: string;
  traceId: string;
  version: number;
  expectedState: string;
  observedState: string;
  /** Always false — SOC/audit payloads never authorize a production write */
  authorizesProductionWrite: false;
}

export interface SocAuditPayloadInput {
  eventType: string;
  tenantId: string;
  operatorId: string;
  decision: SchemaValidationDecision;
  blockedReason: BlockedReason;
  source: string;
  occurredAt: string;
  traceId: string;
  version: number;
  expectedState: string;
  observedState: string;
}

export interface SocAuditPayloadBuildResult {
  readonly _kind: 'f009_phase5f_soc_audit_payload_build_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  ok: boolean;
  payload: SocAuditPayload | null;
  blockedReasons: BlockedReason[];
}

const REQUIRED_SOC_FIELDS = [
  'eventType', 'tenantId', 'operatorId', 'decision', 'blockedReason',
  'source', 'occurredAt', 'traceId', 'version', 'expectedState', 'observedState',
] as const;

/**
 * Builds a SOC/audit payload carrying ALL required fields per SSOT
 * (`eventType, tenantId, operatorId, decision, blockedReason, source,
 * occurredAt, traceId, version, expectedState, observedState`).
 * Default-deny: any missing/malformed required field → `ok: false`, no payload.
 */
export function buildSocAuditPayload(
  input: Partial<SocAuditPayloadInput> | null | undefined,
): SocAuditPayloadBuildResult {
  if (!input || typeof input !== 'object') {
    return {
      _kind: 'f009_phase5f_soc_audit_payload_build_result',
      executable: false, aiCanExecute: false,
      ok: false, payload: null,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'],
    };
  }

  for (const field of REQUIRED_SOC_FIELDS) {
    const v = (input as Record<string, unknown>)[field];
    if (field === 'version') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return {
          _kind: 'f009_phase5f_soc_audit_payload_build_result',
          executable: false, aiCanExecute: false,
          ok: false, payload: null,
          blockedReasons: ['F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'],
        };
      }
      continue;
    }
    if (field === 'decision') {
      if (v !== 'ALLOW' && v !== 'DENY') {
        return {
          _kind: 'f009_phase5f_soc_audit_payload_build_result',
          executable: false, aiCanExecute: false,
          ok: false, payload: null,
          blockedReasons: ['F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'],
        };
      }
      continue;
    }
    if (!isNonEmpty(v as unknown)) {
      return {
        _kind: 'f009_phase5f_soc_audit_payload_build_result',
        executable: false, aiCanExecute: false,
        ok: false, payload: null,
        blockedReasons: ['F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'],
      };
    }
  }

  const i = input as SocAuditPayloadInput;
  const payload: SocAuditPayload = {
    _kind: 'f009_phase5f_soc_audit_payload',
    executable: false,
    eventType: i.eventType,
    tenantId: i.tenantId,
    operatorId: i.operatorId,
    decision: i.decision,
    blockedReason: i.blockedReason,
    source: i.source,
    occurredAt: i.occurredAt,
    traceId: i.traceId,
    version: i.version,
    expectedState: i.expectedState,
    observedState: i.observedState,
    authorizesProductionWrite: false,
  };

  return {
    _kind: 'f009_phase5f_soc_audit_payload_build_result',
    executable: false, aiCanExecute: false,
    ok: true,
    payload,
    blockedReasons: ['F009_PHASE5F_SOC_AUDIT_EMITTED'],
  };
}

// ─── Token schema validation (default-deny) ──────────────────────────────────

export type RuntimeTokenState = 'VALID' | 'MALFORMED' | 'MISSING' | 'STALE' | 'VERSION_MISMATCH';

export interface RuntimeToken {
  readonly _kind: 'f009_phase5f_runtime_token';
  tokenId: string;
  tenantId: string;
  operatorId: string;
  issuedAt: string;
  version: number;
  context: 'staging' | 'readiness' | 'production' | string;
}

export interface TokenValidationInput {
  readonly _kind: 'f009_phase5f_token_validation_input';
  token: RuntimeToken | null | undefined;
  now: string;
  expectedVersion: number;
  traceId: string;
}

export interface TokenValidationResult {
  readonly _kind: 'f009_phase5f_token_validation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  decision: SchemaValidationDecision;
  state: RuntimeTokenState;
  /** SOC/audit payload — ALWAYS emitted on DENY, carrying all required fields */
  socAudit: SocAuditPayload | null;
  blockedReasons: BlockedReason[];
}

function isMalformedToken(t: RuntimeToken): boolean {
  if ((t as { _kind?: string })._kind !== 'f009_phase5f_runtime_token') return true;
  if (!isNonEmpty(t.tokenId)) return true;
  if (!isNonEmpty(t.tenantId)) return true;
  if (!isNonEmpty(t.operatorId)) return true;
  if (!isNonEmpty(t.issuedAt) || !Number.isFinite(isoToSeconds(t.issuedAt))) return true;
  if (typeof t.version !== 'number' || !Number.isFinite(t.version) || t.version < 0) return true;
  if (!isNonEmpty(t.context)) return true;
  return false;
}

function denyReasonFor(state: RuntimeTokenState): BlockedReason {
  switch (state) {
    case 'MALFORMED': return 'F009_PHASE5F_TOKEN_MALFORMED';
    case 'MISSING': return 'F009_PHASE5F_TOKEN_MISSING';
    case 'STALE': return 'F009_PHASE5F_TOKEN_STALE';
    case 'VERSION_MISMATCH': return 'F009_PHASE5F_VERSION_MISMATCH';
    default: return 'F009_PHASE5F_SCHEMA_VALIDATION_FAILED';
  }
}

function buildDenySocAudit(params: {
  eventType: string;
  tenantId: string;
  operatorId: string;
  blockedReason: BlockedReason;
  source: string;
  occurredAt: string;
  traceId: string;
  version: number;
  expectedState: string;
  observedState: string;
}): SocAuditPayload | null {
  const r = buildSocAuditPayload({ ...params, decision: 'DENY' });
  return r.ok ? r.payload : null;
}

/**
 * Validates a runtime token schema. ANY malformed/missing/stale/version-
 * mismatched token resolves to `decision: 'DENY'` with a complete SOC/audit
 * payload — fail-closed default-deny on every branch. Only a fully well-formed,
 * fresh, version-matched token in an allowed readiness context is `ALLOW`ed.
 */
export function validateRuntimeToken(
  input: TokenValidationInput | null | undefined,
): TokenValidationResult {
  const traceId = isNonEmpty(input?.traceId) ? input!.traceId : 'unknown-trace';
  const now = isNonEmpty(input?.now) ? input!.now : new Date(0).toISOString();

  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5f_token_validation_input') {
    const reason = denyReasonFor('MISSING');
    return {
      _kind: 'f009_phase5f_token_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MISSING',
      socAudit: buildDenySocAudit({
        eventType: 'TOKEN_VALIDATION_REJECTED', tenantId: 'unknown', operatorId: 'unknown',
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'VALID_TOKEN', observedState: 'MISSING_INPUT',
      }),
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  const tenantId = isNonEmpty(input.token?.tenantId) ? input.token!.tenantId : 'unknown';
  const operatorId = isNonEmpty(input.token?.operatorId) ? input.token!.operatorId : 'unknown';

  if (!input.token) {
    const reason = denyReasonFor('MISSING');
    return {
      _kind: 'f009_phase5f_token_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MISSING',
      socAudit: buildDenySocAudit({
        eventType: 'TOKEN_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'VALID_TOKEN', observedState: 'MISSING_TOKEN',
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  if (isMalformedToken(input.token)) {
    const reason = denyReasonFor('MALFORMED');
    return {
      _kind: 'f009_phase5f_token_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MALFORMED',
      socAudit: buildDenySocAudit({
        eventType: 'TOKEN_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'WELL_FORMED_TOKEN', observedState: 'MALFORMED_TOKEN',
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  if (input.token.version !== input.expectedVersion) {
    const reason = denyReasonFor('VERSION_MISMATCH');
    return {
      _kind: 'f009_phase5f_token_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'VERSION_MISMATCH',
      socAudit: buildDenySocAudit({
        eventType: 'TOKEN_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: `VERSION_${input.expectedVersion}`, observedState: `VERSION_${input.token.version}`,
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  const nowSec = isoToSeconds(now);
  const issuedSec = isoToSeconds(input.token.issuedAt);
  if (!Number.isFinite(nowSec) || !Number.isFinite(issuedSec) || (nowSec - issuedSec) > STALE_AFTER_SECONDS) {
    const reason = denyReasonFor('STALE');
    return {
      _kind: 'f009_phase5f_token_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'STALE',
      socAudit: buildDenySocAudit({
        eventType: 'TOKEN_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'FRESH_TOKEN', observedState: 'STALE_TOKEN',
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  if (input.token.context !== 'staging' && input.token.context !== 'readiness') {
    const reason: BlockedReason = 'F009_PHASE5F_PRODUCTION_READINESS_ONLY';
    return {
      _kind: 'f009_phase5f_token_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MALFORMED',
      socAudit: buildDenySocAudit({
        eventType: 'TOKEN_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'READINESS_CONTEXT', observedState: `CONTEXT_${input.token.context}`,
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  return {
    _kind: 'f009_phase5f_token_validation_result',
    executable: false, aiCanExecute: false,
    decision: 'ALLOW', state: 'VALID',
    socAudit: null,
    blockedReasons: [],
  };
}

// ─── Flag schema validation (default-deny) ───────────────────────────────────

export type RuntimeFlagState = 'VALID' | 'MALFORMED' | 'MISSING' | 'STALE' | 'VERSION_MISMATCH';

export interface RuntimeFlag {
  readonly _kind: 'f009_phase5f_runtime_flag';
  flagId: string;
  tenantId: string;
  operatorId: string;
  setAt: string;
  version: number;
  context: 'staging' | 'readiness' | 'production' | string;
}

export interface FlagValidationInput {
  readonly _kind: 'f009_phase5f_flag_validation_input';
  flag: RuntimeFlag | null | undefined;
  now: string;
  expectedVersion: number;
  traceId: string;
}

export interface FlagValidationResult {
  readonly _kind: 'f009_phase5f_flag_validation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  decision: SchemaValidationDecision;
  state: RuntimeFlagState;
  socAudit: SocAuditPayload | null;
  blockedReasons: BlockedReason[];
}

function isMalformedFlag(f: RuntimeFlag): boolean {
  if ((f as { _kind?: string })._kind !== 'f009_phase5f_runtime_flag') return true;
  if (!isNonEmpty(f.flagId)) return true;
  if (!isNonEmpty(f.tenantId)) return true;
  if (!isNonEmpty(f.operatorId)) return true;
  if (!isNonEmpty(f.setAt) || !Number.isFinite(isoToSeconds(f.setAt))) return true;
  if (typeof f.version !== 'number' || !Number.isFinite(f.version) || f.version < 0) return true;
  if (!isNonEmpty(f.context)) return true;
  return false;
}

function flagDenyReason(state: RuntimeFlagState): BlockedReason {
  switch (state) {
    case 'MALFORMED': return 'F009_PHASE5F_FLAG_MALFORMED';
    case 'MISSING': return 'F009_PHASE5F_FLAG_MISSING';
    case 'STALE': return 'F009_PHASE5F_FLAG_STALE';
    case 'VERSION_MISMATCH': return 'F009_PHASE5F_VERSION_MISMATCH';
    default: return 'F009_PHASE5F_SCHEMA_VALIDATION_FAILED';
  }
}

/**
 * Validates a runtime feature-flag schema. ANY malformed/missing/stale/
 * version-mismatched flag resolves to `decision: 'DENY'` with a complete
 * SOC/audit payload — fail-closed default-deny on every branch.
 */
export function validateRuntimeFlag(
  input: FlagValidationInput | null | undefined,
): FlagValidationResult {
  const traceId = isNonEmpty(input?.traceId) ? input!.traceId : 'unknown-trace';
  const now = isNonEmpty(input?.now) ? input!.now : new Date(0).toISOString();

  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5f_flag_validation_input') {
    const reason = flagDenyReason('MISSING');
    return {
      _kind: 'f009_phase5f_flag_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MISSING',
      socAudit: buildDenySocAudit({
        eventType: 'FLAG_VALIDATION_REJECTED', tenantId: 'unknown', operatorId: 'unknown',
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'VALID_FLAG', observedState: 'MISSING_INPUT',
      }),
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  const tenantId = isNonEmpty(input.flag?.tenantId) ? input.flag!.tenantId : 'unknown';
  const operatorId = isNonEmpty(input.flag?.operatorId) ? input.flag!.operatorId : 'unknown';

  if (!input.flag) {
    const reason = flagDenyReason('MISSING');
    return {
      _kind: 'f009_phase5f_flag_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MISSING',
      socAudit: buildDenySocAudit({
        eventType: 'FLAG_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'VALID_FLAG', observedState: 'MISSING_FLAG',
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  if (isMalformedFlag(input.flag)) {
    const reason = flagDenyReason('MALFORMED');
    return {
      _kind: 'f009_phase5f_flag_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MALFORMED',
      socAudit: buildDenySocAudit({
        eventType: 'FLAG_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'WELL_FORMED_FLAG', observedState: 'MALFORMED_FLAG',
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  if (input.flag.version !== input.expectedVersion) {
    const reason = flagDenyReason('VERSION_MISMATCH');
    return {
      _kind: 'f009_phase5f_flag_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'VERSION_MISMATCH',
      socAudit: buildDenySocAudit({
        eventType: 'FLAG_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: `VERSION_${input.expectedVersion}`, observedState: `VERSION_${input.flag.version}`,
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  const nowSec = isoToSeconds(now);
  const setSec = isoToSeconds(input.flag.setAt);
  if (!Number.isFinite(nowSec) || !Number.isFinite(setSec) || (nowSec - setSec) > STALE_AFTER_SECONDS) {
    const reason = flagDenyReason('STALE');
    return {
      _kind: 'f009_phase5f_flag_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'STALE',
      socAudit: buildDenySocAudit({
        eventType: 'FLAG_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'FRESH_FLAG', observedState: 'STALE_FLAG',
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  if (input.flag.context !== 'staging' && input.flag.context !== 'readiness') {
    const reason: BlockedReason = 'F009_PHASE5F_PRODUCTION_READINESS_ONLY';
    return {
      _kind: 'f009_phase5f_flag_validation_result',
      executable: false, aiCanExecute: false,
      decision: 'DENY', state: 'MALFORMED',
      socAudit: buildDenySocAudit({
        eventType: 'FLAG_VALIDATION_REJECTED', tenantId, operatorId,
        blockedReason: reason, source: 'runtime_validator', occurredAt: now, traceId,
        version: SCHEMA_VERSION, expectedState: 'READINESS_CONTEXT', observedState: `CONTEXT_${input.flag.context}`,
      }),
      blockedReasons: [reason, 'F009_PHASE5F_SOC_AUDIT_EMITTED'],
    };
  }

  return {
    _kind: 'f009_phase5f_flag_validation_result',
    executable: false, aiCanExecute: false,
    decision: 'ALLOW', state: 'VALID',
    socAudit: null,
    blockedReasons: [],
  };
}
