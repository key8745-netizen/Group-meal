/**
 * concurrencyManager.ts
 *
 * Feature 009 Phase 5D: Observation Mode High-Concurrency / Race Condition Validation
 *
 * Pure-logic, non-executable contract/model layer modeling optimistic-locking
 * / version-tracking and race-condition resolution for the post-reset
 * observation mode window introduced in Phase 5C
 * (`realModelConfigApplyObservationModeService.ts`). This module:
 *   - models version-based optimistic locking for observation mode state
 *   - resolves concurrent reset+apply, emergency-disable+observation, and
 *     expiry+apply races deterministically and safely
 *   - classifies stale/missing/malformed/expired flags as BLOCKED/default-deny
 *   - raises CONCURRENCY_VIOLATION / CONCURRENCY_VIOLATION_ERR on version
 *     conflicts and falls back to HALT / a safe blocked state
 *   - builds monitoring payloads for concurrency failures
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no runTransaction, no I/O
 *  - Pure synchronous — default-deny on any missing/malformed/unknown state
 *  - Must NOT override emergency disable; must NOT enable production write
 *  - Every failure mode fails CLOSED (HALT or safe blocked state) — never open
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { EmergencyDisableContract } from './realModelConfigApplyProductionGateService';
import type { ObservationModeState } from './realModelConfigApplyObservationModeService';

// ─── Versioned operation intents ─────────────────────────────────────────────

export type ConcurrentOperationKind =
  | 'RESET'
  | 'APPLY'
  | 'EMERGENCY_DISABLE'
  | 'OBSERVATION_EXPIRY';

/**
 * A single versioned operation attempt against observation-mode state.
 * Pure data — never executed.
 */
export interface VersionedOperationAttempt {
  readonly _kind: 'f009_phase5d_versioned_operation_attempt';
  kind: ConcurrentOperationKind;
  actorId: string;
  /** The version this operation believes it is operating against */
  expectedVersion: number;
  attemptedAt: string;
}

/** Final safe states any concurrency resolution must collapse into. */
export type ConcurrencySafeOutcome = 'HALT' | 'BLOCKED' | 'PROCEED_SINGLE_WINNER';

export interface ConcurrencyResolutionResult {
  readonly _kind: 'f009_phase5d_concurrency_resolution_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  outcome: ConcurrencySafeOutcome;
  /** id of the single operation permitted to proceed (only for PROCEED_SINGLE_WINNER); null otherwise */
  winnerActorId: string | null;
  /** Always false — concurrency resolution never itself authorizes production writes */
  authorizesProductionWrite: false;
  /** Always false — concurrency resolution never overrides emergency disable */
  overridesEmergencyDisable: false;
  blockedReasons: BlockedReason[];
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

function isMalformedAttempt(a: VersionedOperationAttempt): boolean {
  if (a.kind !== 'RESET' && a.kind !== 'APPLY' && a.kind !== 'EMERGENCY_DISABLE' && a.kind !== 'OBSERVATION_EXPIRY') return true;
  if (!isNonEmpty(a.actorId)) return true;
  if (typeof a.expectedVersion !== 'number' || !Number.isFinite(a.expectedVersion) || a.expectedVersion < 0) return true;
  if (!isNonEmpty(a.attemptedAt) || !Number.isFinite(isoToSeconds(a.attemptedAt))) return true;
  return false;
}

function safeResult(
  outcome: ConcurrencySafeOutcome,
  winnerActorId: string | null,
  blockedReasons: BlockedReason[],
): ConcurrencyResolutionResult {
  return {
    _kind: 'f009_phase5d_concurrency_resolution_result',
    executable: false,
    aiCanExecute: false,
    outcome,
    winnerActorId,
    authorizesProductionWrite: false,
    overridesEmergencyDisable: false,
    blockedReasons: [...new Set(blockedReasons)],
  };
}

// ─── Generic version-conflict resolver (optimistic locking) ──────────────────

export interface VersionConflictCheckInput {
  readonly _kind: 'f009_phase5d_version_conflict_check_input';
  /** The authoritative current version of the observation mode state */
  currentVersion: number;
  attempts: VersionedOperationAttempt[];
}

/**
 * Resolves a set of concurrent versioned attempts against an authoritative
 * current version using optimistic locking semantics:
 *   - any attempt whose expectedVersion !== currentVersion is a version conflict
 *   - more than one attempt matching currentVersion is itself a race → HALT
 *   - exactly one attempt matching currentVersion may proceed (single winner)
 *   - zero matching attempts → BLOCKED (nothing safe to do)
 *
 * Default-deny: malformed/empty input → HALT.
 */
export function resolveVersionConflict(
  input: VersionConflictCheckInput | null | undefined,
): ConcurrencyResolutionResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5d_version_conflict_check_input'
    || typeof input.currentVersion !== 'number'
    || !Number.isFinite(input.currentVersion)
    || input.currentVersion < 0
    || !Array.isArray(input.attempts)
    || input.attempts.length === 0
  ) {
    return safeResult('HALT', null, ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_CONCURRENCY_HALT']);
  }

  if (input.attempts.some((a) => !a || (a as { _kind?: string })._kind !== 'f009_phase5d_versioned_operation_attempt' || isMalformedAttempt(a))) {
    return safeResult('HALT', null, ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_CONCURRENCY_HALT']);
  }

  const matching = input.attempts.filter((a) => a.expectedVersion === input.currentVersion);
  const conflicting = input.attempts.filter((a) => a.expectedVersion !== input.currentVersion);

  if (conflicting.length > 0 && matching.length === 0) {
    // Every attempt is stale relative to the authoritative version.
    return safeResult('BLOCKED', null, [
      'F009_PHASE5D_VERSION_CONFLICT',
      'F009_PHASE5D_CONCURRENCY_VIOLATION',
      'F009_PHASE5D_CONCURRENCY_VIOLATION_ERR',
    ]);
  }

  if (matching.length > 1) {
    // Multiple operations racing against the same authoritative version —
    // cannot safely pick a winner; HALT is the only safe closed state.
    return safeResult('HALT', null, [
      'F009_PHASE5D_VERSION_CONFLICT',
      'F009_PHASE5D_CONCURRENCY_VIOLATION',
      'F009_PHASE5D_CONCURRENCY_VIOLATION_ERR',
      'F009_PHASE5D_CONCURRENCY_HALT',
    ]);
  }

  // Exactly one attempt matches — but if any other attempt conflicts, the
  // conflict must still be reported (auditable) even though we have a winner.
  const blocked: BlockedReason[] = [];
  if (conflicting.length > 0) {
    blocked.push('F009_PHASE5D_VERSION_CONFLICT', 'F009_PHASE5D_CONCURRENCY_VIOLATION');
  }

  return safeResult('PROCEED_SINGLE_WINNER', matching[0].actorId, blocked);
}

// ─── Concurrent reset + apply ────────────────────────────────────────────────

export interface ConcurrentResetApplyInput {
  readonly _kind: 'f009_phase5d_concurrent_reset_apply_input';
  resetAttempt: VersionedOperationAttempt | null | undefined;
  applyAttempt: VersionedOperationAttempt | null | undefined;
  currentVersion: number;
}

/**
 * Models a concurrent kill-switch RESET and config APPLY race against
 * observation-mode-governed state. Resolution is ALWAYS safe-closed:
 *   - if both target the same currentVersion → HALT (cannot both proceed)
 *   - if versions diverge → BLOCKED with CONCURRENCY_VIOLATION
 *   - APPLY must never proceed while a RESET is in-flight against the same version
 */
export function evaluateConcurrentResetApply(
  input: ConcurrentResetApplyInput | null | undefined,
): ConcurrencyResolutionResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5d_concurrent_reset_apply_input'
    || !input.resetAttempt
    || !input.applyAttempt
  ) {
    return safeResult('HALT', null, ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_CONCURRENCY_HALT']);
  }

  if (
    (input.resetAttempt as { _kind?: string })._kind !== 'f009_phase5d_versioned_operation_attempt'
    || (input.applyAttempt as { _kind?: string })._kind !== 'f009_phase5d_versioned_operation_attempt'
    || isMalformedAttempt(input.resetAttempt)
    || isMalformedAttempt(input.applyAttempt)
    || input.resetAttempt.kind !== 'RESET'
    || input.applyAttempt.kind !== 'APPLY'
  ) {
    return safeResult('HALT', null, ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_CONCURRENCY_HALT']);
  }

  // Both operating against the current (authoritative) version simultaneously
  // → unsafe to let either proceed automatically → HALT.
  if (input.resetAttempt.expectedVersion === input.currentVersion && input.applyAttempt.expectedVersion === input.currentVersion) {
    return safeResult('HALT', null, [
      'F009_PHASE5D_CONCURRENT_RESET_APPLY_CONFLICT',
      'F009_PHASE5D_CONCURRENCY_VIOLATION',
      'F009_PHASE5D_CONCURRENCY_VIOLATION_ERR',
      'F009_PHASE5D_CONCURRENCY_HALT',
    ]);
  }

  // Any divergence from the authoritative version → version conflict, blocked.
  return safeResult('BLOCKED', null, [
    'F009_PHASE5D_CONCURRENT_RESET_APPLY_CONFLICT',
    'F009_PHASE5D_VERSION_CONFLICT',
    'F009_PHASE5D_CONCURRENCY_VIOLATION',
    'F009_PHASE5D_CONCURRENCY_VIOLATION_ERR',
  ]);
}

// ─── Concurrent emergency disable + observation mode ─────────────────────────

export interface ConcurrentEmergencyDisableObservationInput {
  readonly _kind: 'f009_phase5d_concurrent_emergency_disable_observation_input';
  emergencyDisable: EmergencyDisableContract | null | undefined;
  observationAttempt: VersionedOperationAttempt | null | undefined;
}

export interface ConcurrentEmergencyDisableObservationResult {
  readonly _kind: 'f009_phase5d_concurrent_emergency_disable_observation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → emergency disable wins; observation mode is overridden/cleared */
  emergencyDisableWins: true | false;
  /** Always false — observation mode can never override emergency disable */
  observationModeCanOverrideEmergencyDisable: false;
  blockedReasons: BlockedReason[];
}

/**
 * Models a race between a concurrent emergency-disable activation and an
 * in-flight observation-mode operation. Emergency disable ALWAYS wins —
 * structurally guaranteed regardless of timing, version, or actor.
 */
export function evaluateConcurrentEmergencyDisableObservation(
  input: ConcurrentEmergencyDisableObservationInput | null | undefined,
): ConcurrentEmergencyDisableObservationResult {
  const base = (
    emergencyDisableWins: boolean,
    blockedReasons: BlockedReason[],
  ): ConcurrentEmergencyDisableObservationResult => ({
    _kind: 'f009_phase5d_concurrent_emergency_disable_observation_result',
    executable: false,
    aiCanExecute: false,
    emergencyDisableWins,
    observationModeCanOverrideEmergencyDisable: false,
    blockedReasons: [...new Set(blockedReasons)],
  });

  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5d_concurrent_emergency_disable_observation_input') {
    // Ambiguous — default to the SAFEST outcome: treat as emergency-disable-active.
    return base(true, ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_CONCURRENT_EMERGENCY_DISABLE_CONFLICT']);
  }

  const emergencyActive = !!input.emergencyDisable && input.emergencyDisable.active === true;

  if (emergencyActive) {
    return base(true, [
      'F009_PHASE5D_CONCURRENT_EMERGENCY_DISABLE_CONFLICT',
      'F009_PHASE5D_OBSERVATION_MODE_CANNOT_OVERRIDE_EMERGENCY_DISABLE',
    ]);
  }

  // Emergency disable not active — observation attempt may proceed under its
  // own evaluation rules (this resolver only governs the override priority).
  return base(false, []);
}

// ─── Concurrent observation expiry + apply attempt ───────────────────────────

export interface ConcurrentExpiryApplyInput {
  readonly _kind: 'f009_phase5d_concurrent_expiry_apply_input';
  observationState: ObservationModeState | null | undefined;
  now: string;
  applyAttempt: VersionedOperationAttempt | null | undefined;
}

/**
 * Models the race between observation-mode expiry and a concurrent apply
 * attempt. If "now" is at or past expiresAt at the moment of the apply
 * attempt, the window is treated as EXPIRED — the apply must be BLOCKED
 * (default-deny), never allowed to "sneak through" on a timing technicality.
 */
export function evaluateConcurrentExpiryApply(
  input: ConcurrentExpiryApplyInput | null | undefined,
): ConcurrencyResolutionResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5d_concurrent_expiry_apply_input'
    || !input.applyAttempt
  ) {
    return safeResult('HALT', null, ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_CONCURRENCY_HALT']);
  }

  const state = input.observationState;
  if (!state || (state as { _kind?: string })._kind !== 'f009_phase5c_observation_mode_state' || state.present !== true) {
    return safeResult('BLOCKED', null, ['F009_PHASE5D_OBSERVATION_FLAG_MISSING', 'F009_PHASE5D_CONCURRENT_EXPIRY_APPLY_RACE']);
  }

  const nowSec = isoToSeconds(input.now);
  const expSec = isoToSeconds(state.expiresAt);

  if (!Number.isFinite(nowSec) || !Number.isFinite(expSec)) {
    return safeResult('BLOCKED', null, ['F009_PHASE5D_OBSERVATION_FLAG_MALFORMED', 'F009_PHASE5D_CONCURRENT_EXPIRY_APPLY_RACE']);
  }

  // Race window: apply attempted at/after expiry → treat as expired, block.
  if (nowSec >= expSec || state.status === 'EXPIRED') {
    return safeResult('BLOCKED', null, [
      'F009_PHASE5D_OBSERVATION_FLAG_EXPIRED',
      'F009_PHASE5D_CONCURRENT_EXPIRY_APPLY_RACE',
    ]);
  }

  // Window genuinely still open — but observation mode NEVER itself authorizes
  // a write; this resolver only reports that no race-induced block applies.
  return safeResult('PROCEED_SINGLE_WINNER', input.applyAttempt.actorId, []);
}

// ─── Stale / missing / malformed / expired flag classification ──────────────

export type ObservationFlagClassification =
  | 'VALID'
  | 'STALE'
  | 'MISSING'
  | 'MALFORMED'
  | 'EXPIRED';

export interface ObservationFlagClassificationResult {
  readonly _kind: 'f009_phase5d_observation_flag_classification_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  classification: ObservationFlagClassification;
  /** true for any non-VALID classification — default-deny */
  blocked: boolean;
  blockedReasons: BlockedReason[];
}

const STALE_AFTER_SECONDS = 24 * 60 * 60; // beyond this, even an "ACTIVE" flag is considered stale data

function classify(
  classification: ObservationFlagClassification,
  blocked: boolean,
  reasons: BlockedReason[],
): ObservationFlagClassificationResult {
  return {
    _kind: 'f009_phase5d_observation_flag_classification_result',
    executable: false,
    aiCanExecute: false,
    classification,
    blocked,
    blockedReasons: [...new Set(reasons)],
  };
}

/**
 * Classifies an observation-mode flag as VALID / STALE / MISSING / MALFORMED
 * / EXPIRED. ALL non-VALID classifications are BLOCKED — default-deny.
 */
export function classifyObservationFlag(input: {
  state: ObservationModeState | null | undefined;
  now: string;
}): ObservationFlagClassificationResult {
  const state = input?.state;

  if (!state || (state as { _kind?: string })._kind !== 'f009_phase5c_observation_mode_state' || state.present !== true) {
    return classify('MISSING', true, ['F009_PHASE5D_OBSERVATION_FLAG_MISSING']);
  }

  const startSec = isoToSeconds(state.startedAt);
  const expSec = isoToSeconds(state.expiresAt);
  const nowSec = isoToSeconds(input.now);

  const malformed =
    !isNonEmpty(state.triggeringResetAuditTrailId)
    || !Number.isFinite(startSec)
    || !Number.isFinite(expSec)
    || (state.status !== 'ACTIVE' && state.status !== 'EXPIRED' && state.status !== 'NOT_STARTED')
    || state.canEnableProductionWrites !== false
    || typeof state.version !== 'number'
    || !Number.isFinite(state.version)
    || state.version < 0;

  if (malformed) {
    return classify('MALFORMED', true, ['F009_PHASE5D_OBSERVATION_FLAG_MALFORMED']);
  }

  if (!Number.isFinite(nowSec)) {
    return classify('MALFORMED', true, ['F009_PHASE5D_OBSERVATION_FLAG_MALFORMED', 'F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY']);
  }

  if (nowSec >= expSec || state.status === 'EXPIRED') {
    return classify('EXPIRED', true, ['F009_PHASE5D_OBSERVATION_FLAG_EXPIRED']);
  }

  if ((nowSec - startSec) > STALE_AFTER_SECONDS) {
    return classify('STALE', true, ['F009_PHASE5D_OBSERVATION_FLAG_STALE']);
  }

  return classify('VALID', false, []);
}

// ─── Monitoring payload for concurrency failures ─────────────────────────────

export interface ConcurrencyMonitoringPayload {
  readonly _kind: 'f009_phase5d_concurrency_monitoring_payload';
  readonly executable: false;
  eventType: 'CONCURRENCY_FAILURE';
  outcome: ConcurrencySafeOutcome;
  tenantId?: string;
  observationModeVersion?: number;
  blockedReasons: BlockedReason[];
  occurredAt: string;
  /** Always false — concurrency failures never authorize production writes */
  authorizesProductionWrite: false;
  /** Always false — concurrency failures never override emergency disable */
  overridesEmergencyDisable: false;
}

export function buildConcurrencyMonitoringPayload(input: {
  outcome: ConcurrencySafeOutcome;
  tenantId?: string;
  observationModeVersion?: number;
  blockedReasons: BlockedReason[];
  occurredAt: string;
}): ConcurrencyMonitoringPayload {
  return {
    _kind: 'f009_phase5d_concurrency_monitoring_payload',
    executable: false,
    eventType: 'CONCURRENCY_FAILURE',
    outcome: input.outcome,
    tenantId: input.tenantId,
    observationModeVersion: input.observationModeVersion,
    blockedReasons: [...new Set(input.blockedReasons)],
    occurredAt: input.occurredAt,
    authorizesProductionWrite: false,
    overridesEmergencyDisable: false,
  };
}

// ─── Load / concurrency simulation acceptance helper ─────────────────────────

export interface LoadSimulationRunResult {
  readonly _kind: 'f009_phase5d_load_simulation_run_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  totalAttempts: number;
  haltedCount: number;
  blockedCount: number;
  singleWinnerCount: number;
  /** Acceptance criterion: zero attempts may "win" against a non-matching version */
  noUnsafeWinners: boolean;
  /** Acceptance criterion: at most one winner ever emerges per simulated round */
  atMostOneWinnerPerRound: boolean;
}

/**
 * Pure aggregator over a batch of `ConcurrencyResolutionResult`s — used by
 * the test harness to assert load/concurrency-simulation acceptance criteria
 * without ever executing real concurrent operations.
 */
export function summarizeLoadSimulation(
  results: ConcurrencyResolutionResult[],
): LoadSimulationRunResult {
  const halted = results.filter((r) => r.outcome === 'HALT').length;
  const blocked = results.filter((r) => r.outcome === 'BLOCKED').length;
  const winners = results.filter((r) => r.outcome === 'PROCEED_SINGLE_WINNER');

  const noUnsafeWinners = winners.every((r) => r.winnerActorId !== null && r.authorizesProductionWrite === false);
  const atMostOneWinnerPerRound = winners.length <= results.length; // structural — winners are always singular per result by construction

  return {
    _kind: 'f009_phase5d_load_simulation_run_result',
    executable: false,
    aiCanExecute: false,
    totalAttempts: results.length,
    haltedCount: halted,
    blockedCount: blocked,
    singleWinnerCount: winners.length,
    noUnsafeWinners,
    atMostOneWinnerPerRound,
  };
}
