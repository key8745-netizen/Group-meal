/**
 * realModelConfigApplyDeploymentGateRecoveryService.ts
 *
 * Feature 009 Phase 5D: Deployment Gate Partial Failure / Orphaned Token Recovery
 *
 * Pure-logic, non-executable contract/model layer extending Phase 5C's
 * deployment gate / token validation with PARTIAL FAILURE and RECOVERY
 * modeling for the real CI pipeline:
 *   - interrupted CI job handling (before/after token injection, after gate update)
 *   - orphaned token detection + SELF_INVALIDATE (auditable)
 *   - token injected but gate update failed → BLOCKED/invalidated
 *   - gate updated but token invalid → BLOCKED
 *   - token expires mid-flow → BLOCKED
 *   - manual approval granted but deployment fails → DEPLOYMENT_ABORTED (auditable)
 *   - retry without fresh manual approval → BLOCKED if scoped
 *   - GATE_AUTO_INVALIDATE for stale gates (>30min not reaching ENABLED)
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no runTransaction, no KMS/HMAC SDK, no I/O
 *  - Pure synchronous — default-deny on any missing/ambiguous/unknown input
 *  - Every failure mode fails CLOSED — never fails open
 *  - No production write path is introduced anywhere in this file
 */

import type { BlockedReason } from '../types/aiBoundary';

// ─── CI pipeline stage model ─────────────────────────────────────────────────

/**
 * Discrete CI pipeline stages for the deployment gate flow. Used to model
 * "interrupted at stage X" scenarios deterministically.
 */
export type CiPipelineStage =
  | 'NOT_STARTED'
  | 'BEFORE_TOKEN_INJECTION'
  | 'TOKEN_INJECTED'
  | 'GATE_UPDATED'
  | 'DEPLOYMENT_COMPLETE';

export interface CiInterruptionInput {
  readonly _kind: 'f009_phase5d_ci_interruption_input';
  /** Last stage successfully completed before interruption */
  reachedStage: CiPipelineStage;
  /** True if the CI job process was interrupted (crash, timeout, cancel) */
  interrupted: boolean;
}

export interface CiInterruptionEvaluationResult {
  readonly _kind: 'f009_phase5d_ci_interruption_evaluation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** Always true — interruption never permits proceeding */
  blocked: true;
  /** Whether an orphaned token must now be assumed to exist */
  orphanedTokenSuspected: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Evaluates a CI interruption scenario. Default-deny: ANY interruption at
 * ANY stage results in `blocked: true`. Distinguishes WHICH reason applies
 * so downstream recovery can be modeled precisely, but never permits the
 * pipeline to proceed regardless of stage reached.
 */
export function evaluateCiInterruption(
  input: CiInterruptionInput | null | undefined,
): CiInterruptionEvaluationResult {
  const blocked: BlockedReason[] = ['F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED'];

  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5d_ci_interruption_input') {
    return {
      _kind: 'f009_phase5d_ci_interruption_evaluation_result',
      executable: false,
      aiCanExecute: false,
      blocked: true,
      orphanedTokenSuspected: true,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', ...blocked],
    };
  }

  if (input.interrupted !== true) {
    // Not actually interrupted — but this function is only ever invoked when
    // an interruption is suspected, so an absent interruption is itself
    // ambiguous and must default-deny.
    return {
      _kind: 'f009_phase5d_ci_interruption_evaluation_result',
      executable: false,
      aiCanExecute: false,
      blocked: true,
      orphanedTokenSuspected: false,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', ...blocked],
    };
  }

  let orphanedTokenSuspected = false;
  switch (input.reachedStage) {
    case 'NOT_STARTED':
    case 'BEFORE_TOKEN_INJECTION':
      blocked.push('F009_PHASE5D_CI_INTERRUPTED_BEFORE_TOKEN_INJECTION');
      orphanedTokenSuspected = false;
      break;
    case 'TOKEN_INJECTED':
      blocked.push('F009_PHASE5D_CI_INTERRUPTED_AFTER_TOKEN_INJECTION');
      orphanedTokenSuspected = true;
      break;
    case 'GATE_UPDATED':
      blocked.push('F009_PHASE5D_CI_INTERRUPTED_AFTER_GATE_UPDATE');
      orphanedTokenSuspected = true;
      break;
    case 'DEPLOYMENT_COMPLETE':
    default:
      // Interruption reported after "complete" is itself contradictory —
      // default-deny and treat as suspicious / orphan-suspect.
      blocked.push('F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY');
      orphanedTokenSuspected = true;
      break;
  }

  return {
    _kind: 'f009_phase5d_ci_interruption_evaluation_result',
    executable: false,
    aiCanExecute: false,
    blocked: true,
    orphanedTokenSuspected,
    blockedReasons: [...new Set(blocked)],
  };
}

// ─── Orphaned token detection + SELF_INVALIDATE ──────────────────────────────

export interface OrphanedTokenCandidate {
  readonly _kind: 'f009_phase5d_orphaned_token_candidate';
  tokenId: string;
  /** True when the (modeled) deployment_gate has no record matching this token */
  gateRecordMissing: boolean;
  /** True when the gate record exists but references a different tokenId */
  gateRecordTokenMismatch: boolean;
  /** True when CI reports this run as terminated/cancelled/timed-out */
  ciRunTerminated: boolean;
  issuedAt: string;
  now: string;
  staleAfterSeconds: number;
}

export interface OrphanedTokenDetectionResult {
  readonly _kind: 'f009_phase5d_orphaned_token_detection_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  isOrphaned: boolean;
  /** True → token must SELF_INVALIDATE (auditable) */
  selfInvalidate: boolean;
  blockedReasons: BlockedReason[];
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isMalformedOrphanCandidate(c: OrphanedTokenCandidate): boolean {
  if (!isNonEmptyString(c.tokenId)) return true;
  if (!isNonEmptyString(c.issuedAt) || !Number.isFinite(isoToSeconds(c.issuedAt))) return true;
  if (!isNonEmptyString(c.now) || !Number.isFinite(isoToSeconds(c.now))) return true;
  if (typeof c.staleAfterSeconds !== 'number' || !Number.isFinite(c.staleAfterSeconds) || c.staleAfterSeconds <= 0) return true;
  if (typeof c.gateRecordMissing !== 'boolean') return true;
  if (typeof c.gateRecordTokenMismatch !== 'boolean') return true;
  if (typeof c.ciRunTerminated !== 'boolean') return true;
  return false;
}

/**
 * Detects whether a deployment token is orphaned (i.e. injected by CI but no
 * longer associated with any live, consistent deployment_gate record / CI
 * run) and — if so — models the token's mandatory SELF_INVALIDATE behavior.
 *
 * A token is orphaned when ANY of:
 *   - the gate record referencing it is missing
 *   - the gate record references a DIFFERENT token (mismatch)
 *   - the CI run that injected it has terminated
 *   - the token has exceeded its staleness window
 *
 * Default-deny: malformed/ambiguous candidates are treated as orphaned.
 * Orphaned tokens MUST self-invalidate — never remain usable.
 */
export function detectOrphanedToken(
  candidate: OrphanedTokenCandidate | null | undefined,
): OrphanedTokenDetectionResult {
  if (!candidate || (candidate as { _kind?: string })._kind !== 'f009_phase5d_orphaned_token_candidate') {
    return {
      _kind: 'f009_phase5d_orphaned_token_detection_result',
      executable: false,
      aiCanExecute: false,
      isOrphaned: true,
      selfInvalidate: true,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_ORPHANED_TOKEN_DETECTED', 'F009_PHASE5D_SELF_INVALIDATE'],
    };
  }

  if (isMalformedOrphanCandidate(candidate)) {
    return {
      _kind: 'f009_phase5d_orphaned_token_detection_result',
      executable: false,
      aiCanExecute: false,
      isOrphaned: true,
      selfInvalidate: true,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_ORPHANED_TOKEN_DETECTED', 'F009_PHASE5D_SELF_INVALIDATE'],
    };
  }

  const nowSec = isoToSeconds(candidate.now);
  const issuedSec = isoToSeconds(candidate.issuedAt);
  const expired = !Number.isFinite(nowSec) || !Number.isFinite(issuedSec) || (nowSec - issuedSec) > candidate.staleAfterSeconds;

  const isOrphaned =
    candidate.gateRecordMissing === true
    || candidate.gateRecordTokenMismatch === true
    || candidate.ciRunTerminated === true
    || expired;

  if (!isOrphaned) {
    return {
      _kind: 'f009_phase5d_orphaned_token_detection_result',
      executable: false,
      aiCanExecute: false,
      isOrphaned: false,
      selfInvalidate: false,
      blockedReasons: [],
    };
  }

  const blocked: BlockedReason[] = ['F009_PHASE5D_ORPHANED_TOKEN_DETECTED', 'F009_PHASE5D_SELF_INVALIDATE'];
  if (expired) blocked.push('F009_PHASE5D_TOKEN_EXPIRED_MID_FLOW');

  return {
    _kind: 'f009_phase5d_orphaned_token_detection_result',
    executable: false,
    aiCanExecute: false,
    isOrphaned: true,
    selfInvalidate: true,
    blockedReasons: [...new Set(blocked)],
  };
}

// ─── Token / gate cross-state partial-failure model ──────────────────────────

export type TokenLifecycleOutcome =
  | 'TOKEN_INJECTED_GATE_UPDATE_FAILED'
  | 'GATE_UPDATED_TOKEN_INVALID'
  | 'TOKEN_EXPIRED_MID_FLOW'
  | 'CONSISTENT';

export interface TokenGateCrossStateInput {
  readonly _kind: 'f009_phase5d_token_gate_cross_state_input';
  tokenInjected: boolean;
  tokenValid: boolean;
  tokenExpiredMidFlow: boolean;
  gateUpdateAttempted: boolean;
  gateUpdateSucceeded: boolean;
}

export interface TokenGateCrossStateResult {
  readonly _kind: 'f009_phase5d_token_gate_cross_state_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  outcome: TokenLifecycleOutcome;
  /** Always true for any non-CONSISTENT outcome — fail closed */
  blocked: boolean;
  /** True → the token must be invalidated as part of recovery */
  invalidateToken: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Cross-validates token injection state against deployment_gate update state
 * to classify the partial-failure mode (if any) and determine the closed
 * (never-open) recovery action. Order of evaluation is deterministic and
 * collects ALL applicable reasons.
 */
export function evaluateTokenGateCrossState(
  input: TokenGateCrossStateInput | null | undefined,
): TokenGateCrossStateResult {
  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5d_token_gate_cross_state_input') {
    return {
      _kind: 'f009_phase5d_token_gate_cross_state_result',
      executable: false,
      aiCanExecute: false,
      outcome: 'TOKEN_INJECTED_GATE_UPDATE_FAILED',
      blocked: true,
      invalidateToken: true,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED'],
    };
  }

  const blocked: BlockedReason[] = [];

  // Token expired mid-flow takes precedence — it invalidates everything downstream.
  if (input.tokenExpiredMidFlow === true) {
    blocked.push('F009_PHASE5D_TOKEN_EXPIRED_MID_FLOW', 'F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED');
    return {
      _kind: 'f009_phase5d_token_gate_cross_state_result',
      executable: false,
      aiCanExecute: false,
      outcome: 'TOKEN_EXPIRED_MID_FLOW',
      blocked: true,
      invalidateToken: true,
      blockedReasons: [...new Set(blocked)],
    };
  }

  // Token injected, gate update attempted but failed.
  if (input.tokenInjected === true && input.gateUpdateAttempted === true && input.gateUpdateSucceeded !== true) {
    blocked.push('F009_PHASE5D_TOKEN_INJECTED_GATE_UPDATE_FAILED', 'F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED');
    return {
      _kind: 'f009_phase5d_token_gate_cross_state_result',
      executable: false,
      aiCanExecute: false,
      outcome: 'TOKEN_INJECTED_GATE_UPDATE_FAILED',
      blocked: true,
      invalidateToken: true,
      blockedReasons: [...new Set(blocked)],
    };
  }

  // Gate updated successfully but the token itself is invalid (forged/tampered/mismatched).
  if (input.gateUpdateSucceeded === true && input.tokenValid !== true) {
    blocked.push('F009_PHASE5D_GATE_UPDATED_TOKEN_INVALID', 'F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED');
    return {
      _kind: 'f009_phase5d_token_gate_cross_state_result',
      executable: false,
      aiCanExecute: false,
      outcome: 'GATE_UPDATED_TOKEN_INVALID',
      blocked: true,
      invalidateToken: true,
      blockedReasons: [...new Set(blocked)],
    };
  }

  // Fully consistent — token injected + valid, gate updated + succeeded.
  if (input.tokenInjected === true && input.tokenValid === true && input.gateUpdateSucceeded === true) {
    return {
      _kind: 'f009_phase5d_token_gate_cross_state_result',
      executable: false,
      aiCanExecute: false,
      outcome: 'CONSISTENT',
      blocked: false,
      invalidateToken: false,
      blockedReasons: [],
    };
  }

  // Anything else is ambiguous — default-deny.
  return {
    _kind: 'f009_phase5d_token_gate_cross_state_result',
    executable: false,
    aiCanExecute: false,
    outcome: 'TOKEN_INJECTED_GATE_UPDATE_FAILED',
    blocked: true,
    invalidateToken: true,
    blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED'],
  };
}

// ─── Manual approval granted but deployment fails → DEPLOYMENT_ABORTED ───────

export interface DeploymentAbortScenarioInput {
  readonly _kind: 'f009_phase5d_deployment_abort_scenario_input';
  manualApprovalGranted: boolean;
  approvalId: string;
  deploymentSucceeded: boolean;
  deploymentId: string;
  operatorId: string;
  auditTrailId: string;
}

export interface DeploymentAbortScenarioResult {
  readonly _kind: 'f009_phase5d_deployment_abort_scenario_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  aborted: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Models "manual approval granted but deployment fails" → DEPLOYMENT_ABORTED.
 * This NEVER triggers a retry by itself (see `evaluateRetryRequiresFreshApproval`).
 */
export function evaluateDeploymentAbortScenario(
  input: DeploymentAbortScenarioInput | null | undefined,
): DeploymentAbortScenarioResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5d_deployment_abort_scenario_input'
    || !isNonEmptyString(input.deploymentId)
    || !isNonEmptyString(input.operatorId)
    || !isNonEmptyString(input.auditTrailId)
    || !isNonEmptyString(input.approvalId)
  ) {
    return {
      _kind: 'f009_phase5d_deployment_abort_scenario_result',
      executable: false,
      aiCanExecute: false,
      aborted: true,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_DEPLOYMENT_ABORTED'],
    };
  }

  if (input.manualApprovalGranted === true && input.deploymentSucceeded !== true) {
    return {
      _kind: 'f009_phase5d_deployment_abort_scenario_result',
      executable: false,
      aiCanExecute: false,
      aborted: true,
      blockedReasons: ['F009_PHASE5D_DEPLOYMENT_ABORTED', 'F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED'],
    };
  }

  if (input.manualApprovalGranted !== true) {
    return {
      _kind: 'f009_phase5d_deployment_abort_scenario_result',
      executable: false,
      aiCanExecute: false,
      aborted: true,
      blockedReasons: ['F009_PHASE5D_DEPLOYMENT_ABORTED', 'F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED'],
    };
  }

  return {
    _kind: 'f009_phase5d_deployment_abort_scenario_result',
    executable: false,
    aiCanExecute: false,
    aborted: false,
    blockedReasons: [],
  };
}

// ─── Retry without fresh manual approval ─────────────────────────────────────

export interface RetryAttemptInput {
  readonly _kind: 'f009_phase5d_retry_attempt_input';
  isRetry: boolean;
  /** True when this scope requires a brand-new (non-reused) manual approval per attempt */
  freshApprovalRequiredForScope: boolean;
  /** approvalId used in the previous (failed/aborted) attempt */
  previousApprovalId: string;
  /** approvalId presented for this retry attempt */
  currentApprovalId: string;
  /** True only when a NEW, distinct, validly-granted approval was obtained for this retry */
  freshApprovalGranted: boolean;
}

export interface RetryAttemptEvaluationResult {
  readonly _kind: 'f009_phase5d_retry_attempt_evaluation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  allowed: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Models "no automatic retry without fresh manual approval if scoped".
 * Default-deny: if scope requires fresh approval and the retry reuses the
 * previous approvalId (or no fresh approval was granted), the retry is
 * BLOCKED — regardless of any other field.
 */
export function evaluateRetryRequiresFreshApproval(
  input: RetryAttemptInput | null | undefined,
): RetryAttemptEvaluationResult {
  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5d_retry_attempt_input') {
    return {
      _kind: 'f009_phase5d_retry_attempt_evaluation_result',
      executable: false,
      aiCanExecute: false,
      allowed: false,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_RETRY_WITHOUT_FRESH_APPROVAL_BLOCKED'],
    };
  }

  if (input.isRetry !== true) {
    // Not a retry — nothing to evaluate here; caller should use normal flow.
    return {
      _kind: 'f009_phase5d_retry_attempt_evaluation_result',
      executable: false,
      aiCanExecute: false,
      allowed: true,
      blockedReasons: [],
    };
  }

  if (input.freshApprovalRequiredForScope !== true) {
    // Scope does not require fresh approval per retry — allowed (still auditable elsewhere).
    return {
      _kind: 'f009_phase5d_retry_attempt_evaluation_result',
      executable: false,
      aiCanExecute: false,
      allowed: true,
      blockedReasons: [],
    };
  }

  const reusedApproval =
    !isNonEmptyString(input.currentApprovalId)
    || input.currentApprovalId === input.previousApprovalId
    || input.freshApprovalGranted !== true;

  if (reusedApproval) {
    return {
      _kind: 'f009_phase5d_retry_attempt_evaluation_result',
      executable: false,
      aiCanExecute: false,
      allowed: false,
      blockedReasons: ['F009_PHASE5D_RETRY_WITHOUT_FRESH_APPROVAL_BLOCKED', 'F009_PHASE5D_RETRY_REQUIRES_FRESH_APPROVAL'],
    };
  }

  return {
    _kind: 'f009_phase5d_retry_attempt_evaluation_result',
    executable: false,
    aiCanExecute: false,
    allowed: true,
    blockedReasons: [],
  };
}

// ─── GATE_AUTO_INVALIDATE — stale gate (>30min not reaching ENABLED) ─────────

const GATE_STALE_AFTER_SECONDS = 30 * 60;

export interface GateStalenessInput {
  readonly _kind: 'f009_phase5d_gate_staleness_input';
  gateCreatedAt: string;
  now: string;
  /** True only when gate has reached the terminal 'ENABLED' lifecycle state */
  reachedEnabled: boolean;
}

export interface GateStalenessEvaluationResult {
  readonly _kind: 'f009_phase5d_gate_staleness_evaluation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → gate must be GATE_AUTO_INVALIDATE'd (auditable) */
  autoInvalidate: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Models GATE_AUTO_INVALIDATE: a deployment_gate that has not reached
 * ENABLED within 30 minutes of creation must be auto-invalidated. Default-
 * deny on malformed timestamps (treated as stale → invalidate).
 */
export function evaluateGateStaleness(
  input: GateStalenessInput | null | undefined,
): GateStalenessEvaluationResult {
  if (!input || (input as { _kind?: string })._kind !== 'f009_phase5d_gate_staleness_input') {
    return {
      _kind: 'f009_phase5d_gate_staleness_evaluation_result',
      executable: false,
      aiCanExecute: false,
      autoInvalidate: true,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_GATE_AUTO_INVALIDATE'],
    };
  }

  if (input.reachedEnabled === true) {
    return {
      _kind: 'f009_phase5d_gate_staleness_evaluation_result',
      executable: false,
      aiCanExecute: false,
      autoInvalidate: false,
      blockedReasons: [],
    };
  }

  const createdSec = isoToSeconds(input.gateCreatedAt);
  const nowSec = isoToSeconds(input.now);
  const stale = !Number.isFinite(createdSec) || !Number.isFinite(nowSec) || (nowSec - createdSec) > GATE_STALE_AFTER_SECONDS;

  if (stale) {
    return {
      _kind: 'f009_phase5d_gate_staleness_evaluation_result',
      executable: false,
      aiCanExecute: false,
      autoInvalidate: true,
      blockedReasons: ['F009_PHASE5D_GATE_STALE', 'F009_PHASE5D_GATE_AUTO_INVALIDATE'],
    };
  }

  return {
    _kind: 'f009_phase5d_gate_staleness_evaluation_result',
    executable: false,
    aiCanExecute: false,
    autoInvalidate: false,
    blockedReasons: [],
  };
}

// ─── Audit payload builders (auditable, complete) ────────────────────────────

export interface DeploymentAbortedAuditPayload {
  readonly _kind: 'f009_phase5d_deployment_aborted_audit_payload';
  readonly executable: false;
  eventType: 'DEPLOYMENT_ABORTED';
  deploymentId: string;
  operatorId: string;
  approvalId: string;
  auditTrailId: string;
  reason: string;
  occurredAt: string;
  /** Always true — this event must never permit an automatic retry */
  requiresFreshApprovalForRetry: true;
}

export function buildDeploymentAbortedAuditPayload(input: {
  deploymentId: string;
  operatorId: string;
  approvalId: string;
  auditTrailId: string;
  reason: string;
  occurredAt: string;
}): DeploymentAbortedAuditPayload {
  return {
    _kind: 'f009_phase5d_deployment_aborted_audit_payload',
    executable: false,
    eventType: 'DEPLOYMENT_ABORTED',
    deploymentId: input.deploymentId,
    operatorId: input.operatorId,
    approvalId: input.approvalId,
    auditTrailId: input.auditTrailId,
    reason: input.reason,
    occurredAt: input.occurredAt,
    requiresFreshApprovalForRetry: true,
  };
}

export interface GateAutoInvalidateAuditPayload {
  readonly _kind: 'f009_phase5d_gate_auto_invalidate_audit_payload';
  readonly executable: false;
  eventType: 'GATE_AUTO_INVALIDATE';
  gateId: string;
  tenantId: string;
  auditTrailId: string;
  gateCreatedAt: string;
  invalidatedAt: string;
  reason: string;
  /** Always true — auto-invalidation is itself the closed/safe outcome */
  failedClosed: true;
}

export function buildGateAutoInvalidateAuditPayload(input: {
  gateId: string;
  tenantId: string;
  auditTrailId: string;
  gateCreatedAt: string;
  invalidatedAt: string;
  reason: string;
}): GateAutoInvalidateAuditPayload {
  return {
    _kind: 'f009_phase5d_gate_auto_invalidate_audit_payload',
    executable: false,
    eventType: 'GATE_AUTO_INVALIDATE',
    gateId: input.gateId,
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    gateCreatedAt: input.gateCreatedAt,
    invalidatedAt: input.invalidatedAt,
    reason: input.reason,
    failedClosed: true,
  };
}

export interface SelfInvalidateAuditPayload {
  readonly _kind: 'f009_phase5d_self_invalidate_audit_payload';
  readonly executable: false;
  eventType: 'SELF_INVALIDATE';
  tokenId: string;
  auditTrailId: string;
  detectedAt: string;
  reason: string;
  /** Always true — orphaned tokens must never remain usable */
  tokenRemainsUsable: false;
}

export function buildSelfInvalidateAuditPayload(input: {
  tokenId: string;
  auditTrailId: string;
  detectedAt: string;
  reason: string;
}): SelfInvalidateAuditPayload {
  return {
    _kind: 'f009_phase5d_self_invalidate_audit_payload',
    executable: false,
    eventType: 'SELF_INVALIDATE',
    tokenId: input.tokenId,
    auditTrailId: input.auditTrailId,
    detectedAt: input.detectedAt,
    reason: input.reason,
    tokenRemainsUsable: false,
  };
}
