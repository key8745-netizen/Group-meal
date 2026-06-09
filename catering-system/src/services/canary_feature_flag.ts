/**
 * canary_feature_flag.ts
 *
 * Feature 009 Phase 5E: Canary Feature Flag Isolation Gate
 *
 * Pure-logic, non-executable contract/model layer providing structural
 * isolation ("canary_feature_flag_gate") between canary/dry-run logic and
 * core business logic. The flag is default-OFF and — by construction — can
 * NEVER itself enable a production write or a canary rollout. Enabling the
 * flag only ever permits STAGING-ONLY DRY-RUN simulation to be modeled; it
 * is structurally incapable of granting any write authority.
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no runTransaction, no KMS/HMAC SDK, no I/O
 *  - Pure synchronous — default-deny on any missing/malformed/unknown input
 *  - canEnableProductionWrite / canEnableCanaryRollout are ALWAYS false
 */

import type { BlockedReason } from '../types/aiBoundary';

// ─── Feature flag contract ───────────────────────────────────────────────────

export type CanaryFeatureFlagState = 'OFF' | 'ON' | 'MISSING' | 'MALFORMED' | 'EXPIRED' | 'STALE';

export interface CanaryFeatureFlag {
  readonly _kind: 'f009_phase5e_canary_feature_flag';
  readonly executable: false;
  /** Default-off. Only ever toggled in modeled staging contexts — never production. */
  enabled: boolean;
  environment: 'staging' | 'production' | string;
  setBy: string;
  setAt: string;
  expiresAt: string;
  /** Structural invariant — the flag itself can never authorize a production write */
  readonly canEnableProductionWrite: false;
  /** Structural invariant — the flag itself can never authorize canary rollout */
  readonly canEnableCanaryRollout: false;
}

export interface CanaryFeatureFlagGateInput {
  readonly _kind: 'f009_phase5e_canary_feature_flag_gate_input';
  flag: CanaryFeatureFlag | null | undefined;
  now: string;
}

export interface CanaryFeatureFlagGateResult {
  readonly _kind: 'f009_phase5e_canary_feature_flag_gate_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → the gate permits staging-only dry-run modeling to proceed */
  isolated: boolean;
  state: CanaryFeatureFlagState;
  /** ALWAYS false — the gate structurally cannot grant production write authority */
  authorizesProductionWrite: false;
  /** ALWAYS false — the gate structurally cannot grant canary rollout authority */
  authorizesCanaryRollout: false;
  blockedReasons: BlockedReason[];
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

function gateResult(
  isolated: boolean,
  state: CanaryFeatureFlagState,
  blockedReasons: BlockedReason[],
): CanaryFeatureFlagGateResult {
  return {
    _kind: 'f009_phase5e_canary_feature_flag_gate_result',
    executable: false,
    aiCanExecute: false,
    isolated,
    state,
    authorizesProductionWrite: false,
    authorizesCanaryRollout: false,
    blockedReasons: [...new Set(blockedReasons)],
  };
}

const FLAG_STALE_AFTER_SECONDS = 24 * 60 * 60;

function isMalformedFlag(flag: CanaryFeatureFlag): boolean {
  if (typeof flag.enabled !== 'boolean') return true;
  if (!isNonEmpty(flag.environment)) return true;
  if (!isNonEmpty(flag.setBy)) return true;
  if (!isNonEmpty(flag.setAt) || !Number.isFinite(isoToSeconds(flag.setAt))) return true;
  if (!isNonEmpty(flag.expiresAt) || !Number.isFinite(isoToSeconds(flag.expiresAt))) return true;
  if (flag.canEnableProductionWrite !== false) return true;
  if (flag.canEnableCanaryRollout !== false) return true;
  return false;
}

/**
 * Evaluates the `canary_feature_flag_gate`: structurally isolates canary/
 * dry-run logic from core business logic. Default-deny on any missing/
 * malformed/expired/stale/production-environment flag. Even when "isolated"
 * and "ON", this gate NEVER itself authorizes a production write or canary
 * rollout — those remain structurally impossible by construction.
 */
export function evaluateCanaryFeatureFlagGate(
  input: CanaryFeatureFlagGateInput | null | undefined,
): CanaryFeatureFlagGateResult {
  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5e_canary_feature_flag_gate_input') {
    return gateResult(false, 'MISSING', ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_FEATURE_FLAG_DISABLED']);
  }

  const flag = input.flag;
  if (!flag || (flag as { _kind?: string })._kind !== 'f009_phase5e_canary_feature_flag') {
    return gateResult(false, 'MISSING', ['F009_PHASE5E_FEATURE_FLAG_DISABLED']);
  }

  if (isMalformedFlag(flag)) {
    return gateResult(false, 'MALFORMED', ['F009_PHASE5E_FEATURE_FLAG_MALFORMED', 'F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY']);
  }

  // Production environment is NEVER eligible for canary flag isolation in this phase.
  if (flag.environment !== 'staging') {
    return gateResult(false, 'OFF', [
      'F009_PHASE5E_FEATURE_FLAG_DISABLED',
      'F009_PHASE5E_FEATURE_FLAG_CANNOT_ENABLE_PRODUCTION_WRITE',
      'F009_PHASE5E_FEATURE_FLAG_CANNOT_ENABLE_CANARY_ROLLOUT',
    ]);
  }

  const nowSec = isoToSeconds(input.now);
  const expSec = isoToSeconds(flag.expiresAt);
  const setSec = isoToSeconds(flag.setAt);

  if (!Number.isFinite(nowSec)) {
    return gateResult(false, 'MALFORMED', ['F009_PHASE5E_FEATURE_FLAG_MALFORMED', 'F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY']);
  }

  if (nowSec >= expSec) {
    return gateResult(false, 'EXPIRED', ['F009_PHASE5E_FEATURE_FLAG_DISABLED']);
  }

  if ((nowSec - setSec) > FLAG_STALE_AFTER_SECONDS) {
    return gateResult(false, 'STALE', ['F009_PHASE5E_FEATURE_FLAG_DISABLED']);
  }

  if (flag.enabled !== true) {
    return gateResult(false, 'OFF', ['F009_PHASE5E_FEATURE_FLAG_DISABLED']);
  }

  // Flag is ON, in staging, well-formed and current — gate is isolated and
  // permits staging-only dry-run modeling. STILL never authorizes write/rollout.
  return gateResult(true, 'ON', []);
}

/**
 * Builds a default-off `CanaryFeatureFlag`. Pure data construction — never
 * persists or mutates anything. Used by tests/contracts to model the
 * canonical "default-off" baseline state.
 */
export function buildDefaultOffCanaryFeatureFlag(input: {
  setBy: string;
  setAt: string;
  expiresAt: string;
  environment?: string;
}): CanaryFeatureFlag {
  return {
    _kind: 'f009_phase5e_canary_feature_flag',
    executable: false,
    enabled: false,
    environment: input.environment ?? 'staging',
    setBy: input.setBy,
    setAt: input.setAt,
    expiresAt: input.expiresAt,
    canEnableProductionWrite: false,
    canEnableCanaryRollout: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Feature 009 Phase 5F: Production Readiness Next-Step Planning
//
// ADDITIVE-ONLY extension — Phase 5F isolation guarantee evaluation.
// Verifies that a feature flag cannot leak into / override Feature 001-008
// core flow, and structurally cannot enable production write or canary
// write. Nothing below alters any Phase 5E export or behavior.
// ═══════════════════════════════════════════════════════════════════════════

export interface F009Phase5FFeatureFlagIsolationInput {
  readonly _kind: 'f009_phase5f_feature_flag_isolation_input';
  flag: CanaryFeatureFlag | null | undefined;
  targetPath: 'FEATURE_001_008_CORE' | 'PHASE5F_READINESS';
  now: string;
}

export interface F009Phase5FFeatureFlagIsolationResult {
  readonly _kind: 'f009_phase5f_feature_flag_isolation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → flag is structurally isolated from Feature 001-008 core flow */
  isolated: boolean;
  /** Always false — a feature flag can never override Feature 001-008 core behavior */
  canOverrideCoreFeatures: false;
  /** Always false — structurally cannot enable a production write */
  canEnableProductionWrite: false;
  /** Always false — structurally cannot enable a canary write */
  canEnableCanaryWrite: false;
  blockedReasons: BlockedReason[];
}

/**
 * Evaluates Phase 5F feature-flag isolation guarantees: a flag targeting
 * `FEATURE_001_008_CORE` is, by construction, ALWAYS rejected as a leakage
 * attempt — isolation is structural, not configurable. Even when targeting
 * the Phase 5F readiness path, the flag can never enable production write
 * or canary write (`canEnableProductionWrite` / `canEnableCanaryWrite` are
 * always `false`). Default-deny on malformed input.
 */
export function evaluateF009Phase5FFeatureFlagIsolation(
  input: F009Phase5FFeatureFlagIsolationInput | null | undefined,
): F009Phase5FFeatureFlagIsolationResult {
  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5f_feature_flag_isolation_input') {
    return {
      _kind: 'f009_phase5f_feature_flag_isolation_result',
      executable: false, aiCanExecute: false,
      isolated: false,
      canOverrideCoreFeatures: false,
      canEnableProductionWrite: false,
      canEnableCanaryWrite: false,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_FEATURE_FLAG_DISABLED'],
    };
  }

  // Any attempt to target Feature 001-008 core flow is, by construction, an
  // isolation violation — structurally rejected, never permitted.
  if (input.targetPath === 'FEATURE_001_008_CORE') {
    return {
      _kind: 'f009_phase5f_feature_flag_isolation_result',
      executable: false, aiCanExecute: false,
      isolated: false,
      canOverrideCoreFeatures: false,
      canEnableProductionWrite: false,
      canEnableCanaryWrite: false,
      blockedReasons: [
        'F009_PHASE5F_FEATURE_FLAG_ISOLATION_VIOLATION',
        'F009_PHASE5F_FEATURE_FLAG_CANNOT_ENABLE_PRODUCTION_WRITE',
        'F009_PHASE5F_FEATURE_FLAG_CANNOT_ENABLE_CANARY_WRITE',
      ],
    };
  }

  const gate = evaluateCanaryFeatureFlagGate({
    _kind: 'f009_phase5e_canary_feature_flag_gate_input',
    flag: input.flag,
    now: input.now,
  });

  return {
    _kind: 'f009_phase5f_feature_flag_isolation_result',
    executable: false, aiCanExecute: false,
    isolated: gate.isolated,
    canOverrideCoreFeatures: false,
    canEnableProductionWrite: false,
    canEnableCanaryWrite: false,
    blockedReasons: gate.isolated
      ? []
      : ['F009_PHASE5F_FEATURE_FLAG_DISABLED'],
  };
}
