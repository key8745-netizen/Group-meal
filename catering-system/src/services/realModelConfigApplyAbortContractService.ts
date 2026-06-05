/**
 * realModelConfigApplyAbortContractService.ts
 *
 * Feature 009 Phase 1: Abort / Failure Handler Contract Builder
 *
 * Builds a non-executable abort contract for a failed apply attempt.
 * Models the lock transition to ABANDONED and failure audit payload.
 * Phase 1: pure contract generation — no real writes.
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
} from '../types/realModelConfigApplyTransaction';
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
