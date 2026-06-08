/**
 * canaryManager.ts
 *
 * Feature 009 Phase 5E: Limited Staging-only Canary / Dry-run Enabled
 *
 * Pure-logic, non-executable contract/model layer for:
 *   - Zero Real Write enforcement (`IS_PRODUCTION_READINESS_ONLY` hard guard;
 *     any write-attempt path → `FATAL_SAFETY_VIOLATION`)
 *   - Real CI E2E partial-failure modeling in staging/mock mode (token
 *     injection failure, deployment_gate update failure, network interruption
 *     after token injection / after gate update, orphaned token detection,
 *     SELF_INVALIDATE, DEPLOYMENT_ABORTED audit, manual approval revalidation
 *     with no auto-retry, CI_REVALIDATION_TOKEN concept)
 *   - Observation Mode extreme high-load concurrency (~500 req/s simulated
 *     load, concurrency threshold → HALT, HALT recovery requiring
 *     VersionAlignmentCheck before GATE_RESET, concurrent reset+apply /
 *     concurrent emergency-disable+observation / concurrent expiry+apply)
 *   - Emergency Disable as the highest-priority hook in apply/reset paths
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no runTransaction, no KMS/HMAC SDK, no I/O
 *  - Pure synchronous — default-deny on any missing/malformed/unknown input
 *  - IS_PRODUCTION_READINESS_ONLY is a hard, non-overridable guard
 *  - Every failure mode fails CLOSED — never fails open
 *  - No production write path is introduced anywhere in this file
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { EmergencyDisableContract } from './realModelConfigApplyProductionGateService';

// ─── Hard zero-write guard ───────────────────────────────────────────────────

/**
 * Structural, non-overridable guard: this entire module exists ONLY for
 * production-readiness contract modeling. It is never wired to any real
 * write path. Any code path that attempts to model a "real write" must
 * collapse into `FATAL_SAFETY_VIOLATION`.
 */
export const IS_PRODUCTION_READINESS_ONLY = true as const;

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

// ─── Write-attempt modeling → FATAL_SAFETY_VIOLATION ─────────────────────────

export type CanaryWriteTargetKind = 'PRODUCTION_WRITE' | 'PRODUCTION_CANARY_WRITE' | 'BROAD_ROLLOUT' | 'CANARY_WITHOUT_DRY_RUN';

export interface CanaryWriteAttemptInput {
  readonly _kind: 'f009_phase5e_canary_write_attempt_input';
  targetKind: CanaryWriteTargetKind;
  environment: 'staging' | 'production' | string;
  dryRun: boolean;
  actorId: string;
}

export interface CanaryWriteAttemptResult {
  readonly _kind: 'f009_phase5e_canary_write_attempt_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** Always true — every write-attempt path is modeled as blocked */
  blocked: true;
  /** Always true — write attempts are FATAL safety violations, not soft blocks */
  fatal: true;
  isProductionReadinessOnly: true;
  blockedReasons: BlockedReason[];
}

function fatalWriteResult(reasons: BlockedReason[]): CanaryWriteAttemptResult {
  return {
    _kind: 'f009_phase5e_canary_write_attempt_result',
    executable: false,
    aiCanExecute: false,
    blocked: true,
    fatal: true,
    isProductionReadinessOnly: IS_PRODUCTION_READINESS_ONLY,
    blockedReasons: [...new Set(reasons)],
  };
}

/**
 * Evaluates ANY modeled write-attempt path. By construction this function
 * NEVER permits a write to proceed — every branch returns `blocked: true,
 * fatal: true` with `FATAL_SAFETY_VIOLATION`. This is the structural
 * embodiment of `IS_PRODUCTION_READINESS_ONLY`.
 */
export function evaluateCanaryWriteAttempt(
  input: CanaryWriteAttemptInput | null | undefined,
): CanaryWriteAttemptResult {
  const base: BlockedReason[] = ['F009_PHASE5E_PRODUCTION_READINESS_ONLY', 'F009_PHASE5E_FATAL_SAFETY_VIOLATION'];

  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_canary_write_attempt_input'
    || !isNonEmpty(input.actorId)
  ) {
    return fatalWriteResult(['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', ...base, 'F009_PHASE5E_PRODUCTION_WRITE_ATTEMPT_BLOCKED']);
  }

  switch (input.targetKind) {
    case 'PRODUCTION_WRITE':
      return fatalWriteResult([...base, 'F009_PHASE5E_PRODUCTION_WRITE_ATTEMPT_BLOCKED']);
    case 'PRODUCTION_CANARY_WRITE':
      return fatalWriteResult([...base, 'F009_PHASE5E_PRODUCTION_CANARY_WRITE_BLOCKED']);
    case 'BROAD_ROLLOUT':
      return fatalWriteResult([...base, 'F009_PHASE5E_BROAD_ROLLOUT_BLOCKED']);
    case 'CANARY_WITHOUT_DRY_RUN':
      return fatalWriteResult([...base, 'F009_PHASE5E_CANARY_WITHOUT_DRY_RUN_BLOCKED']);
    default:
      return fatalWriteResult(['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', ...base, 'F009_PHASE5E_PRODUCTION_WRITE_ATTEMPT_BLOCKED']);
  }
}

/**
 * Evaluates a staging-only dry-run request. This is the ONLY path this
 * module ever permits to "proceed" — and even then it is purely a contract
 * evaluation (`executable: false`) that never touches any real system.
 * Any non-staging environment, or any non-dry-run request, is BLOCKED.
 */
export interface StagingDryRunRequestInput {
  readonly _kind: 'f009_phase5e_staging_dry_run_request_input';
  environment: 'staging' | 'production' | string;
  dryRun: boolean;
  featureFlagIsolated: boolean;
  actorId: string;
}

export interface StagingDryRunEvaluationResult {
  readonly _kind: 'f009_phase5e_staging_dry_run_evaluation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  allowed: boolean;
  /** Always false — even an "allowed" dry-run never authorizes a production write */
  authorizesProductionWrite: false;
  blockedReasons: BlockedReason[];
}

export function evaluateStagingDryRunRequest(
  input: StagingDryRunRequestInput | null | undefined,
): StagingDryRunEvaluationResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_staging_dry_run_request_input'
    || !isNonEmpty(input.actorId)
  ) {
    return {
      _kind: 'f009_phase5e_staging_dry_run_evaluation_result',
      executable: false, aiCanExecute: false,
      allowed: false, authorizesProductionWrite: false,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_PRODUCTION_READINESS_ONLY'],
    };
  }

  const reasons: BlockedReason[] = [];
  if (input.environment !== 'staging') reasons.push('F009_PHASE5E_PRODUCTION_WRITE_ATTEMPT_BLOCKED', 'F009_PHASE5E_FATAL_SAFETY_VIOLATION');
  if (input.dryRun !== true) reasons.push('F009_PHASE5E_CANARY_WITHOUT_DRY_RUN_BLOCKED');
  if (input.featureFlagIsolated !== true) reasons.push('F009_PHASE5E_FEATURE_FLAG_DISABLED');

  if (reasons.length > 0) {
    return {
      _kind: 'f009_phase5e_staging_dry_run_evaluation_result',
      executable: false, aiCanExecute: false,
      allowed: false, authorizesProductionWrite: false,
      blockedReasons: [...new Set(reasons)],
    };
  }

  return {
    _kind: 'f009_phase5e_staging_dry_run_evaluation_result',
    executable: false, aiCanExecute: false,
    allowed: true, authorizesProductionWrite: false,
    blockedReasons: ['F009_PHASE5E_STAGING_ONLY_DRY_RUN_ALLOWED'],
  };
}

// ─── Real CI E2E partial-failure modeling (staging/mock mode) ────────────────

export type CanaryCiPipelineStage =
  | 'NOT_STARTED'
  | 'BEFORE_TOKEN_INJECTION'
  | 'TOKEN_INJECTED'
  | 'GATE_UPDATED'
  | 'DEPLOYMENT_COMPLETE';

export interface CiPartialFailureScenarioInput {
  readonly _kind: 'f009_phase5e_ci_partial_failure_scenario_input';
  scenario:
    | 'TOKEN_INJECTION_FAILURE'
    | 'GATE_UPDATE_FAILURE'
    | 'NETWORK_INTERRUPT_AFTER_TOKEN'
    | 'NETWORK_INTERRUPT_AFTER_GATE';
  reachedStage: CanaryCiPipelineStage;
  environment: 'staging' | 'production' | string;
}

export interface CiPartialFailureScenarioResult {
  readonly _kind: 'f009_phase5e_ci_partial_failure_scenario_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** Always true — every partial-failure scenario is BLOCKED */
  blocked: true;
  orphanedTokenSuspected: boolean;
  requiresSelfInvalidate: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Models real-CI E2E partial-failure scenarios in staging/mock mode. ALL
 * scenarios resolve to `blocked: true` — never to a proceeding pipeline.
 * Default-deny on production environment or unknown scenario shapes.
 */
export function evaluateCiPartialFailureScenario(
  input: CiPartialFailureScenarioInput | null | undefined,
): CiPartialFailureScenarioResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_ci_partial_failure_scenario_input'
  ) {
    return {
      _kind: 'f009_phase5e_ci_partial_failure_scenario_result',
      executable: false, aiCanExecute: false,
      blocked: true, orphanedTokenSuspected: true, requiresSelfInvalidate: true,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_PARTIAL_FAILURE_FAIL_CLOSED'],
    };
  }

  const reasons: BlockedReason[] = ['F009_PHASE5E_PARTIAL_FAILURE_FAIL_CLOSED'];
  if (input.environment !== 'staging') {
    reasons.push('F009_PHASE5E_FATAL_SAFETY_VIOLATION', 'F009_PHASE5E_PRODUCTION_WRITE_ATTEMPT_BLOCKED');
  }

  let orphanedTokenSuspected = false;
  let requiresSelfInvalidate = false;

  switch (input.scenario) {
    case 'TOKEN_INJECTION_FAILURE':
      reasons.push('F009_PHASE5E_TOKEN_INJECTION_FAILED');
      orphanedTokenSuspected = false;
      break;
    case 'GATE_UPDATE_FAILURE':
      reasons.push('F009_PHASE5E_GATE_UPDATE_FAILED');
      orphanedTokenSuspected = input.reachedStage === 'TOKEN_INJECTED' || input.reachedStage === 'GATE_UPDATED';
      requiresSelfInvalidate = orphanedTokenSuspected;
      break;
    case 'NETWORK_INTERRUPT_AFTER_TOKEN':
      reasons.push('F009_PHASE5E_NETWORK_INTERRUPTED_AFTER_TOKEN_INJECTION');
      orphanedTokenSuspected = true;
      requiresSelfInvalidate = true;
      break;
    case 'NETWORK_INTERRUPT_AFTER_GATE':
      reasons.push('F009_PHASE5E_NETWORK_INTERRUPTED_AFTER_GATE_UPDATE');
      orphanedTokenSuspected = true;
      requiresSelfInvalidate = true;
      break;
    default:
      reasons.push('F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY');
      orphanedTokenSuspected = true;
      requiresSelfInvalidate = true;
      break;
  }

  if (requiresSelfInvalidate) reasons.push('F009_PHASE5E_ORPHANED_TOKEN_DETECTED', 'F009_PHASE5E_SELF_INVALIDATE');

  return {
    _kind: 'f009_phase5e_ci_partial_failure_scenario_result',
    executable: false, aiCanExecute: false,
    blocked: true,
    orphanedTokenSuspected,
    requiresSelfInvalidate,
    blockedReasons: [...new Set(reasons)],
  };
}

// ─── CI_REVALIDATION_TOKEN concept + manual approval revalidation ────────────

export interface CiRevalidationTokenContract {
  readonly _kind: 'f009_phase5e_ci_revalidation_token_contract';
  readonly executable: false;
  tokenId: string;
  /** A revalidation token is single-use, scoped to one manual-approval cycle */
  readonly singleUse: true;
  /** Always true — a revalidation token alone never authorizes a write */
  readonly authorizesWrite: false;
  issuedAt: string;
  expiresAt: string;
  scopedApprovalId: string;
}

export interface ManualApprovalRevalidationInput {
  readonly _kind: 'f009_phase5e_manual_approval_revalidation_input';
  isRetryAfterFailure: boolean;
  revalidationToken: CiRevalidationTokenContract | null | undefined;
  freshManualApprovalGranted: boolean;
  previousApprovalId: string;
  currentApprovalId: string;
}

export interface ManualApprovalRevalidationResult {
  readonly _kind: 'f009_phase5e_manual_approval_revalidation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  allowed: boolean;
  /** Always false — this module never auto-retries a failed CI path */
  autoRetryAllowed: false;
  blockedReasons: BlockedReason[];
}

/**
 * Models "no auto-retry after failed CI path; retry requires manual approval
 * revalidation backed by a fresh, single-use CI_REVALIDATION_TOKEN".
 * Default-deny: any reuse of the previous approval / token, or any missing
 * fresh approval, blocks the retry outright. `autoRetryAllowed` is
 * structurally always `false`.
 */
export function evaluateManualApprovalRevalidation(
  input: ManualApprovalRevalidationInput | null | undefined,
): ManualApprovalRevalidationResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_manual_approval_revalidation_input'
  ) {
    return {
      _kind: 'f009_phase5e_manual_approval_revalidation_result',
      executable: false, aiCanExecute: false,
      allowed: false, autoRetryAllowed: false,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_NO_AUTO_RETRY', 'F009_PHASE5E_MANUAL_APPROVAL_REVALIDATION_REQUIRED'],
    };
  }

  if (input.isRetryAfterFailure !== true) {
    return {
      _kind: 'f009_phase5e_manual_approval_revalidation_result',
      executable: false, aiCanExecute: false,
      allowed: true, autoRetryAllowed: false,
      blockedReasons: [],
    };
  }

  const reasons: BlockedReason[] = ['F009_PHASE5E_NO_AUTO_RETRY'];

  const token = input.revalidationToken;
  const tokenValid =
    !!token
    && (token as { _kind?: string })._kind === 'f009_phase5e_ci_revalidation_token_contract'
    && token.singleUse === true
    && token.authorizesWrite === false
    && isNonEmpty(token.tokenId)
    && token.scopedApprovalId === input.currentApprovalId;

  const freshApproval =
    input.freshManualApprovalGranted === true
    && isNonEmpty(input.currentApprovalId)
    && input.currentApprovalId !== input.previousApprovalId;

  if (!tokenValid) reasons.push('F009_PHASE5E_CI_REVALIDATION_TOKEN_REQUIRED');
  if (!freshApproval) reasons.push('F009_PHASE5E_MANUAL_APPROVAL_REVALIDATION_REQUIRED');

  if (!tokenValid || !freshApproval) {
    return {
      _kind: 'f009_phase5e_manual_approval_revalidation_result',
      executable: false, aiCanExecute: false,
      allowed: false, autoRetryAllowed: false,
      blockedReasons: [...new Set(reasons)],
    };
  }

  return {
    _kind: 'f009_phase5e_manual_approval_revalidation_result',
    executable: false, aiCanExecute: false,
    allowed: true, autoRetryAllowed: false,
    blockedReasons: [],
  };
}

// ─── DEPLOYMENT_ABORTED audit (staging/mock) ─────────────────────────────────

export interface CanaryDeploymentAbortedAuditPayload {
  readonly _kind: 'f009_phase5e_deployment_aborted_audit_payload';
  readonly executable: false;
  eventType: 'DEPLOYMENT_ABORTED';
  deploymentId: string;
  operatorId: string;
  auditTrailId: string;
  reason: string;
  occurredAt: string;
  /** Always true — this event must never permit an automatic retry */
  requiresFreshApprovalForRetry: true;
  /** Always false — this event never authorizes a production write */
  authorizesProductionWrite: false;
}

export function buildCanaryDeploymentAbortedAuditPayload(input: {
  deploymentId: string;
  operatorId: string;
  auditTrailId: string;
  reason: string;
  occurredAt: string;
}): CanaryDeploymentAbortedAuditPayload {
  return {
    _kind: 'f009_phase5e_deployment_aborted_audit_payload',
    executable: false,
    eventType: 'DEPLOYMENT_ABORTED',
    deploymentId: input.deploymentId,
    operatorId: input.operatorId,
    auditTrailId: input.auditTrailId,
    reason: input.reason,
    occurredAt: input.occurredAt,
    requiresFreshApprovalForRetry: true,
    authorizesProductionWrite: false,
  };
}

// ─── Observation Mode extreme high-load concurrency (~500 req/s) ─────────────

export const SIMULATED_HIGH_LOAD_REQ_PER_SEC = 500;
export const CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC = 200;
/** Contract-level acceptance target — `<50ms` HALT response, or documented fallback */
export const HALT_RESPONSE_TARGET_MS = 50;

export interface HighLoadSimulationInput {
  readonly _kind: 'f009_phase5e_high_load_simulation_input';
  observedReqPerSec: number;
  thresholdReqPerSec: number;
  tenantId: string;
  occurredAt: string;
}

export interface HighLoadSimulationResult {
  readonly _kind: 'f009_phase5e_high_load_simulation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → load exceeds threshold → must enter HALT */
  haltTriggered: boolean;
  observedReqPerSec: number;
  thresholdReqPerSec: number;
  /** Contract-level acceptance target carried through for monitoring/reporting */
  haltResponseTargetMs: number;
  blockedReasons: BlockedReason[];
}

/**
 * Models extreme high-load (~500 req/s) concurrency against the Observation
 * Mode concurrency threshold. ANY observed load at/above the threshold
 * triggers HALT — default-deny on malformed/negative inputs (treated as
 * exceeding threshold → HALT, the only safe closed state).
 */
export function evaluateHighLoadConcurrency(
  input: HighLoadSimulationInput | null | undefined,
): HighLoadSimulationResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_high_load_simulation_input'
    || typeof input.observedReqPerSec !== 'number' || !Number.isFinite(input.observedReqPerSec)
    || typeof input.thresholdReqPerSec !== 'number' || !Number.isFinite(input.thresholdReqPerSec)
    || input.thresholdReqPerSec <= 0
  ) {
    return {
      _kind: 'f009_phase5e_high_load_simulation_result',
      executable: false, aiCanExecute: false,
      haltTriggered: true,
      observedReqPerSec: typeof input?.observedReqPerSec === 'number' ? input.observedReqPerSec : -1,
      thresholdReqPerSec: typeof input?.thresholdReqPerSec === 'number' ? input.thresholdReqPerSec : CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC,
      haltResponseTargetMs: HALT_RESPONSE_TARGET_MS,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_HALT'],
    };
  }

  const haltTriggered = input.observedReqPerSec >= input.thresholdReqPerSec;
  const reasons: BlockedReason[] = haltTriggered
    ? ['F009_PHASE5E_HIGH_LOAD_THRESHOLD_EXCEEDED', 'F009_PHASE5E_HALT']
    : [];

  return {
    _kind: 'f009_phase5e_high_load_simulation_result',
    executable: false, aiCanExecute: false,
    haltTriggered,
    observedReqPerSec: input.observedReqPerSec,
    thresholdReqPerSec: input.thresholdReqPerSec,
    haltResponseTargetMs: HALT_RESPONSE_TARGET_MS,
    blockedReasons: reasons,
  };
}

// ─── HALT recovery → VersionAlignmentCheck → GATE_RESET ──────────────────────

export interface VersionAlignmentCheckInput {
  readonly _kind: 'f009_phase5e_version_alignment_check_input';
  localVersion: number;
  remoteVersion: number;
  tenantId: string;
}

export interface VersionAlignmentCheckResult {
  readonly _kind: 'f009_phase5e_version_alignment_check_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  aligned: boolean;
  /** true only when aligned — gate reset may be modeled as permitted to proceed */
  gateResetAllowed: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Models the mandatory `VersionAlignmentCheck` that MUST pass (local version
 * === remote version) before any `GATE_RESET` may be modeled as permitted
 * during HALT recovery. Default-deny on malformed input or any mismatch.
 */
export function evaluateVersionAlignmentCheck(
  input: VersionAlignmentCheckInput | null | undefined,
): VersionAlignmentCheckResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_version_alignment_check_input'
    || typeof input.localVersion !== 'number' || !Number.isFinite(input.localVersion) || input.localVersion < 0
    || typeof input.remoteVersion !== 'number' || !Number.isFinite(input.remoteVersion) || input.remoteVersion < 0
    || !isNonEmpty(input.tenantId)
  ) {
    return {
      _kind: 'f009_phase5e_version_alignment_check_result',
      executable: false, aiCanExecute: false,
      aligned: false, gateResetAllowed: false,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_VERSION_ALIGNMENT_MISMATCH', 'F009_PHASE5E_GATE_RESET_BLOCKED'],
    };
  }

  const aligned = input.localVersion === input.remoteVersion;
  if (!aligned) {
    return {
      _kind: 'f009_phase5e_version_alignment_check_result',
      executable: false, aiCanExecute: false,
      aligned: false, gateResetAllowed: false,
      blockedReasons: ['F009_PHASE5E_VERSION_ALIGNMENT_MISMATCH', 'F009_PHASE5E_GATE_RESET_BLOCKED', 'F009_PHASE5E_HALT_RECOVERY_REQUIRES_VERSION_ALIGNMENT'],
    };
  }

  return {
    _kind: 'f009_phase5e_version_alignment_check_result',
    executable: false, aiCanExecute: false,
    aligned: true, gateResetAllowed: true,
    blockedReasons: [],
  };
}

export interface HaltRecoveryInput {
  readonly _kind: 'f009_phase5e_halt_recovery_input';
  emergencyDisable: EmergencyDisableContract | null | undefined;
  versionAlignment: VersionAlignmentCheckInput | null | undefined;
}

export interface HaltRecoveryResult {
  readonly _kind: 'f009_phase5e_halt_recovery_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true only when emergency disable is inactive AND version alignment passes */
  gateResetAllowed: boolean;
  emergencyDisableWins: boolean;
  versionAligned: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Models the full HALT-recovery decision: Emergency Disable is checked
 * FIRST (highest-priority hook — mirrors `emergencyDisableWins` from
 * concurrencyManager.ts) and, only if inactive, `VersionAlignmentCheck`
 * gates `GATE_RESET`. Either failure mode is fail-closed.
 */
export function evaluateHaltRecovery(
  input: HaltRecoveryInput | null | undefined,
): HaltRecoveryResult {
  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5e_halt_recovery_input') {
    return {
      _kind: 'f009_phase5e_halt_recovery_result',
      executable: false, aiCanExecute: false,
      gateResetAllowed: false, emergencyDisableWins: true, versionAligned: false,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_GATE_RESET_BLOCKED', 'F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK'],
    };
  }

  // Emergency Disable is checked FIRST — highest-priority hook, always.
  const emergencyActive = !!input.emergencyDisable && input.emergencyDisable.active === true;
  if (emergencyActive || !input.emergencyDisable) {
    return {
      _kind: 'f009_phase5e_halt_recovery_result',
      executable: false, aiCanExecute: false,
      gateResetAllowed: false, emergencyDisableWins: true, versionAligned: false,
      blockedReasons: ['F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK', 'F009_PHASE5E_GATE_RESET_BLOCKED'],
    };
  }

  const alignment = evaluateVersionAlignmentCheck(input.versionAlignment);

  return {
    _kind: 'f009_phase5e_halt_recovery_result',
    executable: false, aiCanExecute: false,
    gateResetAllowed: alignment.gateResetAllowed,
    emergencyDisableWins: false,
    versionAligned: alignment.aligned,
    blockedReasons: alignment.gateResetAllowed
      ? []
      : [...new Set<BlockedReason>([...alignment.blockedReasons, 'F009_PHASE5E_HALT_RECOVERY_REQUIRES_VERSION_ALIGNMENT'])],
  };
}

// ─── Concurrency races (mirrors concurrencyManager.ts patterns) ──────────────

export type CanaryConcurrentOperationKind = 'RESET' | 'APPLY' | 'EMERGENCY_DISABLE' | 'OBSERVATION_EXPIRY';

export interface CanaryVersionedOperationAttempt {
  readonly _kind: 'f009_phase5e_versioned_operation_attempt';
  kind: CanaryConcurrentOperationKind;
  actorId: string;
  expectedVersion: number;
  attemptedAt: string;
}

export type CanarySafeOutcome = 'HALT' | 'BLOCKED' | 'PROCEED_SINGLE_WINNER';

export interface CanaryConcurrencyResolutionResult {
  readonly _kind: 'f009_phase5e_concurrency_resolution_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  outcome: CanarySafeOutcome;
  winnerActorId: string | null;
  authorizesProductionWrite: false;
  overridesEmergencyDisable: false;
  blockedReasons: BlockedReason[];
}

function isMalformedCanaryAttempt(a: CanaryVersionedOperationAttempt): boolean {
  if (a.kind !== 'RESET' && a.kind !== 'APPLY' && a.kind !== 'EMERGENCY_DISABLE' && a.kind !== 'OBSERVATION_EXPIRY') return true;
  if (!isNonEmpty(a.actorId)) return true;
  if (typeof a.expectedVersion !== 'number' || !Number.isFinite(a.expectedVersion) || a.expectedVersion < 0) return true;
  if (!isNonEmpty(a.attemptedAt) || !Number.isFinite(isoToSeconds(a.attemptedAt))) return true;
  return false;
}

function canarySafeResult(
  outcome: CanarySafeOutcome,
  winnerActorId: string | null,
  blockedReasons: BlockedReason[],
): CanaryConcurrencyResolutionResult {
  return {
    _kind: 'f009_phase5e_concurrency_resolution_result',
    executable: false, aiCanExecute: false,
    outcome, winnerActorId,
    authorizesProductionWrite: false,
    overridesEmergencyDisable: false,
    blockedReasons: [...new Set(blockedReasons)],
  };
}

export interface ConcurrentResetApplyInput {
  readonly _kind: 'f009_phase5e_concurrent_reset_apply_input';
  resetAttempt: CanaryVersionedOperationAttempt | null | undefined;
  applyAttempt: CanaryVersionedOperationAttempt | null | undefined;
  currentVersion: number;
  emergencyDisable: EmergencyDisableContract | null | undefined;
}

/**
 * Models concurrent RESET + APPLY against canary/observation state.
 * Emergency Disable is the FIRST hook checked — always wins.
 */
export function evaluateCanaryConcurrentResetApply(
  input: ConcurrentResetApplyInput | null | undefined,
): CanaryConcurrencyResolutionResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_concurrent_reset_apply_input'
    || !input.resetAttempt || !input.applyAttempt
  ) {
    return canarySafeResult('HALT', null, ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_HALT']);
  }

  // Emergency Disable checked FIRST — highest priority, mirrors emergencyDisableWins.
  if (!!input.emergencyDisable && input.emergencyDisable.active === true) {
    return canarySafeResult('BLOCKED', null, ['F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK', 'F009_PHASE5E_CONCURRENT_RESET_APPLY_CONFLICT']);
  }

  if (
    (input.resetAttempt as { _kind?: string })._kind !== 'f009_phase5e_versioned_operation_attempt'
    || (input.applyAttempt as { _kind?: string })._kind !== 'f009_phase5e_versioned_operation_attempt'
    || isMalformedCanaryAttempt(input.resetAttempt)
    || isMalformedCanaryAttempt(input.applyAttempt)
    || input.resetAttempt.kind !== 'RESET'
    || input.applyAttempt.kind !== 'APPLY'
  ) {
    return canarySafeResult('HALT', null, ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_HALT']);
  }

  if (input.resetAttempt.expectedVersion === input.currentVersion && input.applyAttempt.expectedVersion === input.currentVersion) {
    return canarySafeResult('HALT', null, [
      'F009_PHASE5E_CONCURRENT_RESET_APPLY_CONFLICT',
      'F009_PHASE5E_CONCURRENCY_VIOLATION',
      'F009_PHASE5E_CONCURRENCY_VIOLATION_ERR',
      'F009_PHASE5E_HALT',
    ]);
  }

  return canarySafeResult('BLOCKED', null, [
    'F009_PHASE5E_CONCURRENT_RESET_APPLY_CONFLICT',
    'F009_PHASE5E_CONCURRENCY_VIOLATION',
    'F009_PHASE5E_CONCURRENCY_VIOLATION_ERR',
  ]);
}

export interface ConcurrentEmergencyDisableObservationInput {
  readonly _kind: 'f009_phase5e_concurrent_emergency_disable_observation_input';
  emergencyDisable: EmergencyDisableContract | null | undefined;
  observationAttempt: CanaryVersionedOperationAttempt | null | undefined;
}

export interface ConcurrentEmergencyDisableObservationResult {
  readonly _kind: 'f009_phase5e_concurrent_emergency_disable_observation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  emergencyDisableWins: boolean;
  observationModeCanOverrideEmergencyDisable: false;
  blockedReasons: BlockedReason[];
}

/**
 * Models the race between emergency disable and observation mode in the
 * canary/dry-run context. Emergency Disable is the FIRST hook checked and
 * ALWAYS wins — structurally guaranteed.
 */
export function evaluateCanaryConcurrentEmergencyDisableObservation(
  input: ConcurrentEmergencyDisableObservationInput | null | undefined,
): ConcurrentEmergencyDisableObservationResult {
  const base = (wins: boolean, reasons: BlockedReason[]): ConcurrentEmergencyDisableObservationResult => ({
    _kind: 'f009_phase5e_concurrent_emergency_disable_observation_result',
    executable: false, aiCanExecute: false,
    emergencyDisableWins: wins,
    observationModeCanOverrideEmergencyDisable: false,
    blockedReasons: [...new Set(reasons)],
  });

  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5e_concurrent_emergency_disable_observation_input') {
    return base(true, ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK', 'F009_PHASE5E_CONCURRENT_EMERGENCY_DISABLE_CONFLICT']);
  }

  const emergencyActive = !!input.emergencyDisable && input.emergencyDisable.active === true;
  if (emergencyActive) {
    return base(true, ['F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK', 'F009_PHASE5E_CONCURRENT_EMERGENCY_DISABLE_CONFLICT']);
  }

  return base(false, []);
}

export interface ConcurrentExpiryApplyInput {
  readonly _kind: 'f009_phase5e_concurrent_expiry_apply_input';
  observationPresent: boolean;
  observationExpiresAtSec: number;
  nowSec: number;
  applyAttempt: CanaryVersionedOperationAttempt | null | undefined;
  emergencyDisable: EmergencyDisableContract | null | undefined;
}

/**
 * Models the race between observation-mode expiry and a concurrent canary
 * apply attempt. Emergency Disable checked first; otherwise expiry-at-or-
 * past-now → BLOCKED (default-deny, never "sneaks through").
 */
export function evaluateCanaryConcurrentExpiryApply(
  input: ConcurrentExpiryApplyInput | null | undefined,
): CanaryConcurrencyResolutionResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5e_concurrent_expiry_apply_input'
    || !input.applyAttempt
  ) {
    return canarySafeResult('HALT', null, ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_HALT']);
  }

  if (!!input.emergencyDisable && input.emergencyDisable.active === true) {
    return canarySafeResult('BLOCKED', null, ['F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK', 'F009_PHASE5E_CONCURRENT_EXPIRY_APPLY_RACE']);
  }

  if (input.observationPresent !== true) {
    return canarySafeResult('BLOCKED', null, ['F009_PHASE5E_CONCURRENT_EXPIRY_APPLY_RACE']);
  }

  if (
    typeof input.observationExpiresAtSec !== 'number' || !Number.isFinite(input.observationExpiresAtSec)
    || typeof input.nowSec !== 'number' || !Number.isFinite(input.nowSec)
  ) {
    return canarySafeResult('BLOCKED', null, ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_CONCURRENT_EXPIRY_APPLY_RACE']);
  }

  if (input.nowSec >= input.observationExpiresAtSec) {
    return canarySafeResult('BLOCKED', null, ['F009_PHASE5E_CONCURRENT_EXPIRY_APPLY_RACE']);
  }

  // Window genuinely open and emergency disable inactive — but this resolver
  // never itself authorizes a write; only reports no race-induced block.
  return canarySafeResult('PROCEED_SINGLE_WINNER', input.applyAttempt.actorId, []);
}

// ─── Emergency Disable priority hook (mirrors emergencyDisableWins) ──────────

export interface EmergencyDisablePriorityCheckInput {
  readonly _kind: 'f009_phase5e_emergency_disable_priority_check_input';
  emergencyDisable: EmergencyDisableContract | null | undefined;
  pathName: 'APPLY' | 'RESET' | 'OBSERVATION' | 'CANARY_DRY_RUN';
}

export interface EmergencyDisablePriorityCheckResult {
  readonly _kind: 'f009_phase5e_emergency_disable_priority_check_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → emergency disable hook fires first and blocks the path */
  emergencyDisableWins: boolean;
  pathBlocked: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * The single canonical "Emergency Disable is checked FIRST" hook for ALL
 * canary apply/reset/observation/dry-run paths — mirrors the
 * `emergencyDisableWins` pattern from concurrencyManager.ts. This MUST be
 * invoked before any other evaluation in those paths. Default-deny:
 * missing/malformed emergency-disable contract is treated as ACTIVE
 * (safest assumption) — the path is blocked.
 */
export function checkEmergencyDisablePriority(
  input: EmergencyDisablePriorityCheckInput | null | undefined,
): EmergencyDisablePriorityCheckResult {
  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5e_emergency_disable_priority_check_input') {
    return {
      _kind: 'f009_phase5e_emergency_disable_priority_check_result',
      executable: false, aiCanExecute: false,
      emergencyDisableWins: true, pathBlocked: true,
      blockedReasons: ['F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK'],
    };
  }

  const contract = input.emergencyDisable;
  const active = !contract || contract.active === true;

  if (active) {
    return {
      _kind: 'f009_phase5e_emergency_disable_priority_check_result',
      executable: false, aiCanExecute: false,
      emergencyDisableWins: true, pathBlocked: true,
      blockedReasons: ['F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK'],
    };
  }

  return {
    _kind: 'f009_phase5e_emergency_disable_priority_check_result',
    executable: false, aiCanExecute: false,
    emergencyDisableWins: false, pathBlocked: false,
    blockedReasons: [],
  };
}

// ─── Load simulation acceptance aggregator ───────────────────────────────────

export interface CanaryLoadSimulationRunResult {
  readonly _kind: 'f009_phase5e_load_simulation_run_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  totalAttempts: number;
  haltedCount: number;
  blockedCount: number;
  singleWinnerCount: number;
  noUnsafeWinners: boolean;
  atMostOneWinnerPerRound: boolean;
}

/**
 * Pure aggregator over a batch of `CanaryConcurrencyResolutionResult`s,
 * mirroring `summarizeLoadSimulation` from concurrencyManager.ts — used to
 * assert ~500 req/s simulation acceptance criteria without ever executing
 * real concurrent operations.
 */
export function summarizeCanaryLoadSimulation(
  results: CanaryConcurrencyResolutionResult[],
): CanaryLoadSimulationRunResult {
  const halted = results.filter((r) => r.outcome === 'HALT').length;
  const blocked = results.filter((r) => r.outcome === 'BLOCKED').length;
  const winners = results.filter((r) => r.outcome === 'PROCEED_SINGLE_WINNER');

  const noUnsafeWinners = winners.every((r) => r.winnerActorId !== null && r.authorizesProductionWrite === false);
  const atMostOneWinnerPerRound = winners.length <= results.length;

  return {
    _kind: 'f009_phase5e_load_simulation_run_result',
    executable: false, aiCanExecute: false,
    totalAttempts: results.length,
    haltedCount: halted,
    blockedCount: blocked,
    singleWinnerCount: winners.length,
    noUnsafeWinners,
    atMostOneWinnerPerRound,
  };
}
