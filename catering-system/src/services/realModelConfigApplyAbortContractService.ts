/**
 * realModelConfigApplyAbortContractService.ts
 *
 * Feature 009 Phase 1 + Phase 2: Abort / Failure Handler Contract Builder
 *
 * Builds non-executable abort contracts for failed apply attempts.
 * Phase 2 adds: abort after PENDING lock, abort after version conflict,
 * and duplicate abort detection.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - All contracts: executable: false, aiCanExecute: false
 */

import type { BlockedReason } from '../types/aiBoundary';
import type {
  ModelConfigApplyAbortContract,
  ModelConfigApplyAuditEventPayload,
  AbortReason,
  ModelConfigApprovalId,
} from '../types/realModelConfigApplyTransaction';
import type { ApplyToken } from '../types/modelConfigApply';
import { buildAuditEventPayload } from './realModelConfigApplyAuditPayloadService';
import type { AuditPayloadInput } from './realModelConfigApplyAuditPayloadService';

export interface AbortContractInput extends AuditPayloadInput {
  abortReason: AbortReason;
  blockedReasons: BlockedReason[];
  /** Whether the lock was already acquired and needs ABANDONED transition */
  lockAcquired: boolean;
}

/**
 * Builds an abort contract when a real apply attempt fails.
 * The abort contract describes what must happen but does NOT execute it.
 * Phase 2+ must execute the lock ABANDONED transition inside a transaction.
 */
export function buildAbortContract(input: AbortContractInput): ModelConfigApplyAbortContract {
  const failurePayload: ModelConfigApplyAuditEventPayload = buildAuditEventPayload({
    ...input,
    eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
    blockedReasons: input.blockedReasons,
  });

  return {
    _kind: 'model_config_apply_abort_contract',
    executable: false,
    aiCanExecute: false,
    abortReason: input.abortReason,
    blockedReasons: input.blockedReasons,
    lockTransitionRequired: input.lockAcquired,
    lockTransitionTarget: input.lockAcquired ? 'ABANDONED' : null,
    failureAuditPayload: failurePayload,
    abortedAt: new Date(),
  };
}

// ─── Phase 2 additions ────────────────────────────────────────────────────────

/**
 * Builds an abort contract for the case where the lock was already acquired
 * as PENDING and must transition to ABANDONED.
 * The FAILED audit event is included in failureAuditPayload.
 */
export function buildAbortContractAfterPendingLock(
  input: AbortContractInput,
): ModelConfigApplyAbortContract {
  const reasons: BlockedReason[] = [...input.blockedReasons, 'F009_ABORT_AFTER_PENDING_LOCK'];
  const failurePayload: ModelConfigApplyAuditEventPayload = buildAuditEventPayload({
    ...input,
    eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
    blockedReasons: reasons,
  });

  return {
    _kind: 'model_config_apply_abort_contract',
    executable: false,
    aiCanExecute: false,
    abortReason: input.abortReason,
    blockedReasons: reasons,
    lockTransitionRequired: true,
    lockTransitionTarget: 'ABANDONED',
    failureAuditPayload: failurePayload,
    abortedAt: new Date(),
  };
}

/**
 * Builds an abort contract when the abort is triggered by a version conflict.
 * Lock is NOT yet acquired (pre-transaction abort).
 */
export function buildAbortContractAfterVersionConflict(
  input: Omit<AbortContractInput, 'abortReason' | 'lockAcquired'>,
): ModelConfigApplyAbortContract {
  const reasons: BlockedReason[] = [...(input.blockedReasons ?? []), 'F009_ABORT_VERSION_CONFLICT'];
  const failurePayload: ModelConfigApplyAuditEventPayload = buildAuditEventPayload({
    ...input,
    eventType: 'MODEL_CONFIG_VERSION_CONFLICT_BLOCKED',
    blockedReasons: reasons,
  });

  return {
    _kind: 'model_config_apply_abort_contract',
    executable: false,
    aiCanExecute: false,
    abortReason: 'VERSION_CONFLICT',
    blockedReasons: reasons,
    lockTransitionRequired: false,
    lockTransitionTarget: null,
    failureAuditPayload: failurePayload,
    abortedAt: new Date(),
  };
}

/**
 * Detects whether an incoming abort is a duplicate of an already-aborted request.
 * Two aborts with the same approvalId + applyToken are considered duplicates.
 */
export function detectDuplicateAbortRequest(
  existing: ModelConfigApplyAbortContract,
  incoming: { approvalId: ModelConfigApprovalId; applyToken: ApplyToken },
): boolean {
  const existingApprovalId = existing.failureAuditPayload.approvalId;
  const existingToken = existing.failureAuditPayload.applyToken;
  return existingApprovalId === incoming.approvalId && existingToken === incoming.applyToken;
}
