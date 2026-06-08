/**
 * realModelConfigApplyObservationModeService.ts
 *
 * Feature 009 Phase 5C: Post-Reset Observation Mode
 *
 * Pure-logic, non-executable contract/model layer for the post-kill-switch-
 * reset "observation mode" — a monitoring-only window with an EXPLICIT
 * 10-minute expiry that must NEVER become a write-bypass channel, must NEVER
 * itself enable production writes, and must NEVER override emergency disable.
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no runTransaction, no I/O
 *  - Pure synchronous — default-deny on any missing/malformed/unknown state
 *  - canEnableProductionWrites is ALWAYS false (structural invariant)
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { EmergencyDisableContract } from './realModelConfigApplyProductionGateService';

// ─── Explicit expiry constant ────────────────────────────────────────────────

/** Observation mode lasts EXACTLY 10 minutes (explicit, not implied). */
export const OBSERVATION_MODE_DURATION_SECONDS = 10 * 60;

// ─── Observation mode state contract ─────────────────────────────────────────

export type ObservationModeStatus = 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED';

/**
 * Pure data model of a post-reset observation mode window. Its mere presence
 * is NOT sufficient to grant anything — it is monitoring-only and is itself
 * subordinate to the emergency-disable contract.
 */
export interface ObservationModeState {
  readonly _kind: 'f009_phase5c_observation_mode_state';
  readonly executable: false;
  present: boolean;
  status: ObservationModeStatus;
  /** auditTrailId of the kill switch reset that triggered this window */
  triggeringResetAuditTrailId: string;
  startedAt: string;
  /** Always startedAt + OBSERVATION_MODE_DURATION_SECONDS — explicit, never implicit */
  expiresAt: string;
  /** Structural invariant — observation mode NEVER itself enables production writes */
  readonly canEnableProductionWrites: false;
  /** Monotonic version used to detect concurrent mutation */
  version: number;
}

export interface ObservationModeEvaluationInput {
  state: ObservationModeState | null | undefined;
  now: string;
  emergencyDisable: EmergencyDisableContract | null | undefined;
  /** True when the caller is asking observation mode to authorize a write — must always be rejected */
  requestedToAuthorizeWrite?: boolean;
}

export interface ObservationModeEvaluationResult {
  readonly _kind: 'f009_phase5c_observation_mode_evaluation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → observation mode is currently active and valid */
  active: boolean;
  /** ALWAYS false — observation mode can never itself authorize a production write */
  authorizesProductionWrite: false;
  /** true → emergency disable supersedes/clears observation mode */
  overriddenByEmergencyDisable: boolean;
  blockedReasons: BlockedReason[];
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isMalformed(state: ObservationModeState): boolean {
  if (!isNonEmpty(state.triggeringResetAuditTrailId)) return true;
  if (!isNonEmpty(state.startedAt) || !Number.isFinite(isoToSeconds(state.startedAt))) return true;
  if (!isNonEmpty(state.expiresAt) || !Number.isFinite(isoToSeconds(state.expiresAt))) return true;
  if (state.status !== 'ACTIVE' && state.status !== 'EXPIRED' && state.status !== 'NOT_STARTED') return true;
  if (state.canEnableProductionWrites !== false) return true;
  if (typeof state.version !== 'number' || !Number.isFinite(state.version) || state.version < 0) return true;
  // Expiry must be EXACTLY startedAt + 10 minutes — explicit, not arbitrary.
  const startSec = isoToSeconds(state.startedAt);
  const expSec = isoToSeconds(state.expiresAt);
  if (Number.isFinite(startSec) && Number.isFinite(expSec) && (expSec - startSec) !== OBSERVATION_MODE_DURATION_SECONDS) {
    return true;
  }
  return false;
}

/**
 * Evaluates an observation-mode window. Default-deny on missing/malformed
 * state. Emergency disable ALWAYS overrides/clears observation mode — when
 * active, observation mode is reported as overridden and inactive regardless
 * of its own expiry. Observation mode NEVER authorizes production writes,
 * structurally (the result field is a literal `false`).
 */
export function evaluateObservationMode(
  input: ObservationModeEvaluationInput,
): ObservationModeEvaluationResult {
  const blocked: BlockedReason[] = [];

  // ── Emergency disable always wins — checked first, independent of state ────
  const emergencyActive = !!input.emergencyDisable && input.emergencyDisable.active === true;
  if (emergencyActive) {
    blocked.push('F009_PHASE5C_OBSERVATION_MODE_OVERRIDDEN_BY_EMERGENCY_DISABLE');
    blocked.push('F009_PHASE5C_EMERGENCY_DISABLE_OVERRIDES_OBSERVATION_MODE');
    return {
      _kind: 'f009_phase5c_observation_mode_evaluation_result',
      executable: false,
      aiCanExecute: false,
      active: false,
      authorizesProductionWrite: false,
      overriddenByEmergencyDisable: true,
      blockedReasons: blocked,
    };
  }

  // ── Missing state ───────────────────────────────────────────────────────────
  const state = input.state;
  if (!state || (state as { _kind?: string })._kind !== 'f009_phase5c_observation_mode_state' || state.present !== true) {
    return {
      _kind: 'f009_phase5c_observation_mode_evaluation_result',
      executable: false,
      aiCanExecute: false,
      active: false,
      authorizesProductionWrite: false,
      overriddenByEmergencyDisable: false,
      blockedReasons: ['F009_PHASE5C_OBSERVATION_MODE_MISSING_STATE'],
    };
  }

  // ── Malformed state — default-deny ──────────────────────────────────────────
  if (isMalformed(state)) {
    return {
      _kind: 'f009_phase5c_observation_mode_evaluation_result',
      executable: false,
      aiCanExecute: false,
      active: false,
      authorizesProductionWrite: false,
      overriddenByEmergencyDisable: false,
      blockedReasons: ['F009_PHASE5C_OBSERVATION_MODE_MALFORMED_STATE'],
    };
  }

  // ── Explicit expiry check ────────────────────────────────────────────────────
  const nowSec = isoToSeconds(input.now);
  const expSec = isoToSeconds(state.expiresAt);
  let active = state.status === 'ACTIVE';
  if (!Number.isFinite(nowSec) || nowSec >= expSec || state.status === 'EXPIRED') {
    active = false;
    blocked.push('F009_PHASE5C_OBSERVATION_MODE_EXPIRED');
  }

  // ── Bypass-channel guard: any attempt to use observation mode to authorize
  //    a write is hard-blocked, structurally and explicitly. ───────────────────
  if (input.requestedToAuthorizeWrite === true) {
    blocked.push('F009_PHASE5C_OBSERVATION_MODE_CANNOT_ENABLE_PRODUCTION_WRITE');
  }

  return {
    _kind: 'f009_phase5c_observation_mode_evaluation_result',
    executable: false,
    aiCanExecute: false,
    active,
    authorizesProductionWrite: false,
    overriddenByEmergencyDisable: false,
    blockedReasons: [...new Set(blocked)],
  };
}

/** Builds an observation mode window with an explicit 10-minute expiry. */
export function buildObservationModeState(input: {
  triggeringResetAuditTrailId: string;
  startedAt: string;
  version?: number;
}): ObservationModeState {
  const startSec = isoToSeconds(input.startedAt);
  const expiresAtIso = Number.isFinite(startSec)
    ? new Date((startSec + OBSERVATION_MODE_DURATION_SECONDS) * 1000).toISOString()
    : input.startedAt;
  return {
    _kind: 'f009_phase5c_observation_mode_state',
    executable: false,
    present: true,
    status: 'ACTIVE',
    triggeringResetAuditTrailId: input.triggeringResetAuditTrailId,
    startedAt: input.startedAt,
    expiresAt: expiresAtIso,
    canEnableProductionWrites: false,
    version: input.version ?? 0,
  };
}

// ─── High-concurrency edge case modeling ─────────────────────────────────────

/**
 * Pure data model of two concurrent observation-mode mutation attempts.
 *
 * Concurrency model (documented, not executed):
 *   - Observation mode state carries a monotonic `version`.
 *   - Any mutation attempt must supply the version it read.
 *   - If two attempts race, only the one whose `expectedVersion` matches the
 *     CURRENT version may "win"; the other is reported as a conflict and
 *     blocked — mirroring optimistic-concurrency semantics a real
 *     `runTransaction` would enforce, WITHOUT any real transaction running.
 *   - Default-deny: if both attempts present the same `expectedVersion`
 *     (a true race), BOTH are blocked — neither is silently allowed to win,
 *     because that would be ambiguous and ambiguity must default-deny.
 */
export interface ObservationModeConcurrentMutationAttempt {
  readonly _kind: 'f009_phase5c_observation_mode_concurrent_mutation_attempt';
  attemptId: string;
  expectedVersion: number;
  actorId: string;
}

export interface ObservationModeConcurrencyEvaluationResult {
  readonly _kind: 'f009_phase5c_observation_mode_concurrency_evaluation_result';
  readonly executable: false;
  /** attemptId of the winner, or null when no attempt may proceed (ambiguous race) */
  winningAttemptId: string | null;
  blockedAttemptIds: string[];
  blockedReasons: BlockedReason[];
}

export function evaluateObservationModeConcurrency(input: {
  currentVersion: number;
  attempts: ObservationModeConcurrentMutationAttempt[];
}): ObservationModeConcurrencyEvaluationResult {
  if (!Array.isArray(input.attempts) || input.attempts.length === 0) {
    return {
      _kind: 'f009_phase5c_observation_mode_concurrency_evaluation_result',
      executable: false,
      winningAttemptId: null,
      blockedAttemptIds: [],
      blockedReasons: [],
    };
  }

  const matchingCurrent = input.attempts.filter((a) => a.expectedVersion === input.currentVersion);
  const stale = input.attempts.filter((a) => a.expectedVersion !== input.currentVersion);

  const blocked: BlockedReason[] = [];
  const blockedIds: string[] = [...stale.map((a) => a.attemptId)];

  let winningAttemptId: string | null = null;
  if (matchingCurrent.length === 1) {
    winningAttemptId = matchingCurrent[0].attemptId;
  } else if (matchingCurrent.length > 1) {
    // True race on the same expected version — ambiguous → default-deny ALL.
    blockedIds.push(...matchingCurrent.map((a) => a.attemptId));
    blocked.push('F009_PHASE5C_OBSERVATION_MODE_CONCURRENCY_CONFLICT');
  }

  if (stale.length > 0) {
    blocked.push('F009_PHASE5C_OBSERVATION_MODE_CONCURRENCY_CONFLICT');
  }

  return {
    _kind: 'f009_phase5c_observation_mode_concurrency_evaluation_result',
    executable: false,
    winningAttemptId,
    blockedAttemptIds: [...new Set(blockedIds)],
    blockedReasons: [...new Set(blocked)],
  };
}

// ─── Monitoring payload builder ──────────────────────────────────────────────

export interface ObservationModeMonitoringPayload {
  readonly _kind: 'f009_phase5c_observation_mode_monitoring_payload';
  readonly executable: false;
  readonly aiCanExecute: false;
  triggeringResetAuditTrailId: string | null;
  status: ObservationModeStatus | 'UNKNOWN';
  startedAt: string | null;
  expiresAt: string | null;
  durationSeconds: number;
  active: boolean;
  authorizesProductionWrite: false;
  overriddenByEmergencyDisable: boolean;
  blockedReasons: BlockedReason[];
  observedAt: string;
}

export function buildObservationModeMonitoringPayload(input: {
  state: ObservationModeState | null | undefined;
  evaluation: ObservationModeEvaluationResult;
  observedAt: string;
}): ObservationModeMonitoringPayload {
  return {
    _kind: 'f009_phase5c_observation_mode_monitoring_payload',
    executable: false,
    aiCanExecute: false,
    triggeringResetAuditTrailId: input.state?.triggeringResetAuditTrailId ?? null,
    status: input.state?.status ?? 'UNKNOWN',
    startedAt: input.state?.startedAt ?? null,
    expiresAt: input.state?.expiresAt ?? null,
    durationSeconds: OBSERVATION_MODE_DURATION_SECONDS,
    active: input.evaluation.active,
    authorizesProductionWrite: false,
    overriddenByEmergencyDisable: input.evaluation.overriddenByEmergencyDisable,
    blockedReasons: [...input.evaluation.blockedReasons],
    observedAt: input.observedAt,
  };
}
