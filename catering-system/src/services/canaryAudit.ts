/**
 * canaryAudit.ts
 *
 * Feature 009 Phase 5E: Dry-run Audit Difference Logging
 *
 * Pure-logic, non-executable contract/model layer building "Expected vs
 * Actual" difference payloads for dry-run canary simulations, modeling
 * tenant-block-on-difference behavior, and providing complete audit-payload
 * builders for HALT / recovery / dry-run events (mirrors securityAudit.ts's
 * `SecurityAlertPayload` builder pattern).
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no real alerting/SDK calls, no I/O
 *  - Pure synchronous — default-deny on any missing/malformed input
 *  - Difference > 0 always models a tenant block — never a silent pass
 */

import type { BlockedReason } from '../types/aiBoundary';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// ─── Expected vs Actual diff payload ─────────────────────────────────────────

export interface ExpectedVsActualDiffInput {
  readonly _kind: 'f009_phase5e_expected_vs_actual_diff_input';
  tenantId: string;
  dryRunId: string;
  auditTrailId: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  occurredAt: string;
}

export interface DiffEntry {
  field: string;
  expectedValue: unknown;
  actualValue: unknown;
}

export interface ExpectedVsActualDiffPayload {
  readonly _kind: 'f009_phase5e_expected_vs_actual_diff_payload';
  readonly executable: false;
  tenantId: string;
  dryRunId: string;
  auditTrailId: string;
  occurredAt: string;
  differenceCount: number;
  differences: DiffEntry[];
  /** true when differenceCount > 0 — modeled as a tenant-block trigger */
  blocksTenant: boolean;
}

export interface ExpectedVsActualDiffBuildResult {
  readonly _kind: 'f009_phase5e_expected_vs_actual_diff_build_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  ok: boolean;
  payload: ExpectedVsActualDiffPayload | null;
  blockedReasons: BlockedReason[];
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Builds an "Expected vs Actual" difference payload for a dry-run canary
 * simulation. Default-deny: missing required fields → ok:false / null
 * payload. ANY field-level difference (count > 0) models `blocksTenant:
 * true` — never silently allowed through.
 */
export function buildExpectedVsActualDiffPayload(
  input: ExpectedVsActualDiffInput | null | undefined,
): ExpectedVsActualDiffBuildResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_expected_vs_actual_diff_input'
    || !isNonEmptyString(input.tenantId)
    || !isNonEmptyString(input.dryRunId)
    || !isNonEmptyString(input.auditTrailId)
    || !isNonEmptyString(input.occurredAt)
    || !input.expected || typeof input.expected !== 'object'
    || !input.actual || typeof input.actual !== 'object'
  ) {
    return {
      _kind: 'f009_phase5e_expected_vs_actual_diff_build_result',
      executable: false,
      aiCanExecute: false,
      ok: false,
      payload: null,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_AUDIT_PAYLOAD_INCOMPLETE'],
    };
  }

  const keys = [...new Set([...Object.keys(input.expected), ...Object.keys(input.actual)])].sort();
  const differences: DiffEntry[] = [];
  for (const field of keys) {
    const expectedValue = input.expected[field];
    const actualValue = input.actual[field];
    if (stableStringify(expectedValue) !== stableStringify(actualValue)) {
      differences.push({ field, expectedValue, actualValue });
    }
  }

  const differenceCount = differences.length;
  const blocksTenant = differenceCount > 0;

  const payload: ExpectedVsActualDiffPayload = {
    _kind: 'f009_phase5e_expected_vs_actual_diff_payload',
    executable: false,
    tenantId: input.tenantId,
    dryRunId: input.dryRunId,
    auditTrailId: input.auditTrailId,
    occurredAt: input.occurredAt,
    differenceCount,
    differences,
    blocksTenant,
  };

  return {
    _kind: 'f009_phase5e_expected_vs_actual_diff_build_result',
    executable: false,
    aiCanExecute: false,
    ok: true,
    payload,
    blockedReasons: blocksTenant
      ? ['F009_PHASE5E_AUDIT_DIFFERENCE_DETECTED', 'F009_PHASE5E_TENANT_BLOCKED_ON_DIFFERENCE']
      : [],
  };
}

// ─── Tenant-block-on-difference modeling ─────────────────────────────────────

export interface TenantBlockOnDifferenceResult {
  readonly _kind: 'f009_phase5e_tenant_block_on_difference_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  blocked: boolean;
  tenantId: string;
  differenceCount: number;
  blockedReasons: BlockedReason[];
}

/**
 * Models "tenant-block-on-difference > 0": ANY recorded difference (count > 0)
 * results in the tenant being modeled as BLOCKED for further dry-run/canary
 * progression. Default-deny: malformed/missing diff payload → blocked.
 */
export function evaluateTenantBlockOnDifference(
  diff: ExpectedVsActualDiffPayload | null | undefined,
): TenantBlockOnDifferenceResult {
  if (!diff || (diff as { _kind?: string })._kind !== 'f009_phase5e_expected_vs_actual_diff_payload') {
    return {
      _kind: 'f009_phase5e_tenant_block_on_difference_result',
      executable: false,
      aiCanExecute: false,
      blocked: true,
      tenantId: '',
      differenceCount: -1,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_TENANT_BLOCKED_ON_DIFFERENCE'],
    };
  }

  const blocked = diff.differenceCount > 0;
  return {
    _kind: 'f009_phase5e_tenant_block_on_difference_result',
    executable: false,
    aiCanExecute: false,
    blocked,
    tenantId: diff.tenantId,
    differenceCount: diff.differenceCount,
    blockedReasons: blocked ? ['F009_PHASE5E_AUDIT_DIFFERENCE_DETECTED', 'F009_PHASE5E_TENANT_BLOCKED_ON_DIFFERENCE'] : [],
  };
}

// ─── HALT / Recovery / Dry-run audit payload builders ────────────────────────

export interface HaltAuditPayload {
  readonly _kind: 'f009_phase5e_halt_audit_payload';
  readonly executable: false;
  eventType: 'HALT';
  tenantId: string;
  reason: string;
  observedLoad: number;
  threshold: number;
  auditTrailId: string;
  occurredAt: string;
  /** Always false — HALT is itself the closed/safe outcome */
  authorizesProductionWrite: false;
}

export interface HaltAuditPayloadInput {
  tenantId: string;
  reason: string;
  observedLoad: number;
  threshold: number;
  auditTrailId: string;
  occurredAt: string;
}

export interface RecoveryAuditPayload {
  readonly _kind: 'f009_phase5e_recovery_audit_payload';
  readonly executable: false;
  eventType: 'RECOVERY';
  tenantId: string;
  localVersion: number;
  remoteVersion: number;
  versionAligned: boolean;
  gateResetAllowed: boolean;
  auditTrailId: string;
  occurredAt: string;
  /** Always false — recovery audit never itself authorizes production write */
  authorizesProductionWrite: false;
}

export interface RecoveryAuditPayloadInput {
  tenantId: string;
  localVersion: number;
  remoteVersion: number;
  auditTrailId: string;
  occurredAt: string;
}

export interface DryRunAuditPayload {
  readonly _kind: 'f009_phase5e_dry_run_audit_payload';
  readonly executable: false;
  eventType: 'DRY_RUN';
  tenantId: string;
  dryRunId: string;
  differenceCount: number;
  blocksTenant: boolean;
  auditTrailId: string;
  occurredAt: string;
  /** Always false — dry-run never itself authorizes production write */
  authorizesProductionWrite: false;
  /** Always true — dry-run is, by construction, staging-only */
  stagingOnly: true;
}

export interface DryRunAuditPayloadInput {
  tenantId: string;
  dryRunId: string;
  differenceCount: number;
  blocksTenant: boolean;
  auditTrailId: string;
  occurredAt: string;
}

export interface AuditPayloadBuildResult<T> {
  readonly _kind: 'f009_phase5e_audit_payload_build_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  ok: boolean;
  payload: T | null;
  blockedReasons: BlockedReason[];
}

function missingFieldsResult<T>(): AuditPayloadBuildResult<T> {
  return {
    _kind: 'f009_phase5e_audit_payload_build_result',
    executable: false,
    aiCanExecute: false,
    ok: false,
    payload: null,
    blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_AUDIT_PAYLOAD_INCOMPLETE'],
  };
}

/** Builds a complete HALT audit payload. Default-deny on missing fields. */
export function buildHaltAuditPayload(input: HaltAuditPayloadInput | null | undefined): AuditPayloadBuildResult<HaltAuditPayload> {
  if (
    !input
    || !isNonEmptyString(input.tenantId)
    || !isNonEmptyString(input.reason)
    || !isNonEmptyString(input.auditTrailId)
    || !isNonEmptyString(input.occurredAt)
    || typeof input.observedLoad !== 'number' || !Number.isFinite(input.observedLoad)
    || typeof input.threshold !== 'number' || !Number.isFinite(input.threshold)
  ) {
    return missingFieldsResult<HaltAuditPayload>();
  }

  return {
    _kind: 'f009_phase5e_audit_payload_build_result',
    executable: false,
    aiCanExecute: false,
    ok: true,
    payload: {
      _kind: 'f009_phase5e_halt_audit_payload',
      executable: false,
      eventType: 'HALT',
      tenantId: input.tenantId,
      reason: input.reason,
      observedLoad: input.observedLoad,
      threshold: input.threshold,
      auditTrailId: input.auditTrailId,
      occurredAt: input.occurredAt,
      authorizesProductionWrite: false,
    },
    blockedReasons: [],
  };
}

/** Builds a complete RECOVERY audit payload. Default-deny on missing fields. */
export function buildRecoveryAuditPayload(input: RecoveryAuditPayloadInput | null | undefined): AuditPayloadBuildResult<RecoveryAuditPayload> {
  if (
    !input
    || !isNonEmptyString(input.tenantId)
    || !isNonEmptyString(input.auditTrailId)
    || !isNonEmptyString(input.occurredAt)
    || typeof input.localVersion !== 'number' || !Number.isFinite(input.localVersion)
    || typeof input.remoteVersion !== 'number' || !Number.isFinite(input.remoteVersion)
  ) {
    return missingFieldsResult<RecoveryAuditPayload>();
  }

  const versionAligned = input.localVersion === input.remoteVersion;

  return {
    _kind: 'f009_phase5e_audit_payload_build_result',
    executable: false,
    aiCanExecute: false,
    ok: true,
    payload: {
      _kind: 'f009_phase5e_recovery_audit_payload',
      executable: false,
      eventType: 'RECOVERY',
      tenantId: input.tenantId,
      localVersion: input.localVersion,
      remoteVersion: input.remoteVersion,
      versionAligned,
      gateResetAllowed: versionAligned,
      auditTrailId: input.auditTrailId,
      occurredAt: input.occurredAt,
      authorizesProductionWrite: false,
    },
    blockedReasons: versionAligned ? [] : ['F009_PHASE5E_VERSION_ALIGNMENT_MISMATCH', 'F009_PHASE5E_GATE_RESET_BLOCKED'],
  };
}

/** Builds a complete DRY_RUN audit payload. Default-deny on missing fields. */
export function buildDryRunAuditPayload(input: DryRunAuditPayloadInput | null | undefined): AuditPayloadBuildResult<DryRunAuditPayload> {
  if (
    !input
    || !isNonEmptyString(input.tenantId)
    || !isNonEmptyString(input.dryRunId)
    || !isNonEmptyString(input.auditTrailId)
    || !isNonEmptyString(input.occurredAt)
    || typeof input.differenceCount !== 'number' || !Number.isFinite(input.differenceCount) || input.differenceCount < 0
    || typeof input.blocksTenant !== 'boolean'
  ) {
    return missingFieldsResult<DryRunAuditPayload>();
  }

  return {
    _kind: 'f009_phase5e_audit_payload_build_result',
    executable: false,
    aiCanExecute: false,
    ok: true,
    payload: {
      _kind: 'f009_phase5e_dry_run_audit_payload',
      executable: false,
      eventType: 'DRY_RUN',
      tenantId: input.tenantId,
      dryRunId: input.dryRunId,
      differenceCount: input.differenceCount,
      blocksTenant: input.blocksTenant,
      auditTrailId: input.auditTrailId,
      occurredAt: input.occurredAt,
      authorizesProductionWrite: false,
      stagingOnly: true,
    },
    blockedReasons: input.blocksTenant ? ['F009_PHASE5E_AUDIT_DIFFERENCE_DETECTED', 'F009_PHASE5E_TENANT_BLOCKED_ON_DIFFERENCE'] : [],
  };
}

// ─── Audit reconciliation completeness aggregator ────────────────────────────

export interface AuditReconciliationSummary {
  readonly _kind: 'f009_phase5e_audit_reconciliation_summary';
  readonly executable: false;
  readonly aiCanExecute: false;
  totalPayloads: number;
  completePayloads: number;
  /** Acceptance criterion: 100% audit reconciliation target */
  fullyReconciled: boolean;
}

/**
 * Pure aggregator over a batch of `{ ok: boolean }` audit-build-results,
 * used to assert the "100% Audit Reconciliation" acceptance criterion
 * without performing any I/O.
 */
export function summarizeAuditReconciliation(
  results: ReadonlyArray<{ ok: boolean }>,
): AuditReconciliationSummary {
  const complete = results.filter((r) => r.ok === true).length;
  return {
    _kind: 'f009_phase5e_audit_reconciliation_summary',
    executable: false,
    aiCanExecute: false,
    totalPayloads: results.length,
    completePayloads: complete,
    fullyReconciled: results.length > 0 && complete === results.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Feature 009 Phase 5F: Production Readiness Next-Step Planning
//
// ADDITIVE-ONLY extensions — dry-run audit difference threshold modeling
// (`Difference > 0 = Block`), mirroring the Phase 5E
// `buildExpectedVsActualDiffPayload` / `evaluateTenantBlockOnDifference`
// pattern under a Phase 5F-namespaced contract. Nothing below alters any
// Phase 5E export, type, or behavior.
// ═══════════════════════════════════════════════════════════════════════════

export interface F009Phase5FDryRunDifferenceInput {
  readonly _kind: 'f009_phase5f_dry_run_difference_input';
  tenantId: string;
  dryRunId: string;
  auditTrailId: string;
  differenceCount: number;
  occurredAt: string;
}

export interface F009Phase5FDryRunDifferenceResult {
  readonly _kind: 'f009_phase5f_dry_run_difference_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true when differenceCount > 0 — `Difference > 0 = Block` */
  blocked: boolean;
  differenceCount: number;
  /** Always false — threshold decision never itself mutates production state */
  authorizesProductionWrite: false;
  /** Always false — threshold configurability is absent in this phase */
  thresholdConfigurable: false;
  blockedReasons: BlockedReason[];
}

/**
 * Models the dry-run audit difference threshold: `Difference > 0 = Block`.
 * `differenceCount === 0` → allowed in dry-run readiness context;
 * `differenceCount > 0` → BLOCKED. Default-deny (blocked) on malformed
 * input or negative counts. Threshold is NOT configurable in this phase
 * (no GitOps + dual-sign modeling exists) — `thresholdConfigurable` is
 * structurally always `false`.
 */
export function evaluateF009Phase5FDryRunDifferenceThreshold(
  input: F009Phase5FDryRunDifferenceInput | null | undefined,
): F009Phase5FDryRunDifferenceResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5f_dry_run_difference_input'
    || !isNonEmptyString(input.tenantId)
    || !isNonEmptyString(input.dryRunId)
    || !isNonEmptyString(input.auditTrailId)
    || !isNonEmptyString(input.occurredAt)
    || typeof input.differenceCount !== 'number'
    || !Number.isFinite(input.differenceCount)
    || input.differenceCount < 0
  ) {
    return {
      _kind: 'f009_phase5f_dry_run_difference_result',
      executable: false, aiCanExecute: false,
      blocked: true,
      differenceCount: typeof input?.differenceCount === 'number' ? input.differenceCount : -1,
      authorizesProductionWrite: false,
      thresholdConfigurable: false,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_DRY_RUN_DIFFERENCE_BLOCK'],
    };
  }

  const blocked = input.differenceCount > 0;

  return {
    _kind: 'f009_phase5f_dry_run_difference_result',
    executable: false, aiCanExecute: false,
    blocked,
    differenceCount: input.differenceCount,
    authorizesProductionWrite: false,
    thresholdConfigurable: false,
    blockedReasons: blocked
      ? ['F009_PHASE5F_AUDIT_DIFFERENCE_DETECTED', 'F009_PHASE5F_DRY_RUN_DIFFERENCE_BLOCK']
      : [],
  };
}

// ─── Phase 5F SOC/audit-style payload for dry-run difference decisions ───────

export interface F009Phase5FDryRunAuditPayload {
  readonly _kind: 'f009_phase5f_dry_run_audit_payload';
  readonly executable: false;
  eventType: 'DRY_RUN_DIFFERENCE_DECISION';
  tenantId: string;
  operatorId: string;
  decision: 'ALLOW' | 'BLOCK';
  blockedReason: BlockedReason;
  source: 'canaryAudit.dryRunDifference';
  occurredAt: string;
  traceId: string;
  version: number;
  expectedState: string;
  observedState: string;
  /** Always false — audit payload never authorizes production write */
  authorizesProductionWrite: false;
}

export interface F009Phase5FDryRunAuditPayloadInput {
  tenantId: string;
  operatorId: string;
  differenceCount: number;
  occurredAt: string;
  traceId: string;
}

export interface F009Phase5FDryRunAuditPayloadBuildResult {
  readonly _kind: 'f009_phase5f_dry_run_audit_payload_build_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  ok: boolean;
  payload: F009Phase5FDryRunAuditPayload | null;
  blockedReasons: BlockedReason[];
}

const F009_PHASE5F_DRY_RUN_AUDIT_VERSION = 1;

/**
 * Builds a complete SOC/audit-style payload for a dry-run difference
 * decision, carrying all SSOT-required fields. `decision: 'BLOCK'` whenever
 * `differenceCount > 0` — mirrors `Difference > 0 = Block`.
 */
export function buildF009Phase5FDryRunAuditPayload(
  input: F009Phase5FDryRunAuditPayloadInput | null | undefined,
): F009Phase5FDryRunAuditPayloadBuildResult {
  if (
    !input
    || !isNonEmptyString(input.tenantId)
    || !isNonEmptyString(input.operatorId)
    || !isNonEmptyString(input.occurredAt)
    || !isNonEmptyString(input.traceId)
    || typeof input.differenceCount !== 'number'
    || !Number.isFinite(input.differenceCount)
    || input.differenceCount < 0
  ) {
    return {
      _kind: 'f009_phase5f_dry_run_audit_payload_build_result',
      executable: false, aiCanExecute: false,
      ok: false, payload: null,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'],
    };
  }

  const blocked = input.differenceCount > 0;
  const decision: 'ALLOW' | 'BLOCK' = blocked ? 'BLOCK' : 'ALLOW';
  const blockedReason: BlockedReason = blocked
    ? 'F009_PHASE5F_DRY_RUN_DIFFERENCE_BLOCK'
    : 'F009_PHASE5F_SOC_AUDIT_EMITTED';

  const payload: F009Phase5FDryRunAuditPayload = {
    _kind: 'f009_phase5f_dry_run_audit_payload',
    executable: false,
    eventType: 'DRY_RUN_DIFFERENCE_DECISION',
    tenantId: input.tenantId,
    operatorId: input.operatorId,
    decision,
    blockedReason,
    source: 'canaryAudit.dryRunDifference',
    occurredAt: input.occurredAt,
    traceId: input.traceId,
    version: F009_PHASE5F_DRY_RUN_AUDIT_VERSION,
    expectedState: 'DIFFERENCE_COUNT_0',
    observedState: `DIFFERENCE_COUNT_${input.differenceCount}`,
    authorizesProductionWrite: false,
  };

  return {
    _kind: 'f009_phase5f_dry_run_audit_payload_build_result',
    executable: false, aiCanExecute: false,
    ok: true,
    payload,
    blockedReasons: blocked
      ? ['F009_PHASE5F_AUDIT_DIFFERENCE_DETECTED', 'F009_PHASE5F_DRY_RUN_DIFFERENCE_BLOCK', 'F009_PHASE5F_SOC_AUDIT_EMITTED']
      : ['F009_PHASE5F_SOC_AUDIT_EMITTED'],
  };
}
