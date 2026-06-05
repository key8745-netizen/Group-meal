/**
 * realModelConfigTransactionPseudoPlanService.ts
 *
 * Feature 007 Phase 1: Transaction Pseudo-plan Builder
 *
 * Builds a descriptive, non-executable pseudo-plan for the real model config
 * apply transaction. The plan describes each transaction step but cannot be
 * executed — it contains no Firestore references, no callbacks, no write
 * functions, and no runTransaction calls.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - executable: false, aiCanExecute: false, dryRunOnly: true
 *  - No function / callback / write / commit / Firestore path object
 */

import type { TenantId } from '../types/aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId } from '../types/modelConfigApply';
import type {
  RealModelConfigApplyPseudoPlan,
  RealModelConfigApplyGuardResult,
  PseudoPlanStep,
} from '../types/realModelConfigApplyExecution';
import type { AuditTrailId } from '../types/aiBoundary';

export interface BuildPseudoPlanInput {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  applyToken: ApplyToken;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  guardResult: RealModelConfigApplyGuardResult;
  now?: Date;
}

function step(n: number, name: string, description: string): PseudoPlanStep {
  return { step: n, name, description, executable: false };
}

/**
 * Builds a non-executable pseudo-plan for a real model config apply transaction.
 *
 * The plan describes all transaction steps in order:
 *  1. Guard validation
 *  2. Approval validation
 *  3. Settings current version read
 *  4. Idempotency lock check and write
 *  5. settingsHistory new version write
 *  6. settings currentVersion update
 *  7. Audit event write
 *
 * All steps are descriptive only. No Firestore object, no write function,
 * no callback, no runTransaction.
 */
export function buildRealModelConfigApplyTransactionPseudoPlan(
  input: BuildPseudoPlanInput,
): RealModelConfigApplyPseudoPlan {
  const now = input.now ?? new Date();

  return {
    _kind: 'real_model_config_apply_pseudo_plan',
    executable: false,
    aiCanExecute: false,
    dryRunOnly: true,
    containsRunTransaction: false,
    containsWriteFunction: false,
    containsDeleteFunction: false,
    containsFirestoreReference: false,
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    auditTrailId: input.auditTrailId,
    expectedCurrentVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    applyToken: input.applyToken,

    guardPlan: step(1, 'SERVICE_GUARD_VALIDATION',
      `Validate caller is HUMAN, tenantId matches, approvalId and auditTrailId are present. ` +
      `AI callers are hard-blocked. Service Account / Admin SDK do not bypass this guard. ` +
      `Tenant: ${input.tenantId}. Guard allowed: ${input.guardResult.allowed}.`
    ),

    approvalValidationPlan: step(2, 'APPROVAL_VALIDATION',
      `Read persisted approval record for approvalId=${input.approvalId} inside transaction. ` +
      `Validate: status=APPROVED, tenantId matches, sourceRecommendationId matches, approval not expired. ` +
      `Block if any mismatch. This step requires Firestore read inside runTransaction (Phase 2+).`
    ),

    settingsReadPlan: step(3, 'SETTINGS_CURRENT_VERSION_READ',
      `Read settings/${input.tenantId} document inside transaction. ` +
      `Validate currentVersion === expectedCurrentVersion (${input.expectedCurrentVersion}). ` +
      `Validate configHash matches configBeforeHash (${input.configBeforeHash}). ` +
      `Block if version or hash mismatch (race condition / tampered state guard). ` +
      `This step requires Firestore read inside runTransaction (Phase 2+).`
    ),

    idempotencyLockPlan: step(4, 'IDEMPOTENCY_LOCK_CHECK_AND_WRITE',
      `Check modelConfigIdempotencyLocks/${input.tenantId}:${input.applyToken} inside transaction. ` +
      `If lock exists with same payload → idempotent replay allowed. ` +
      `If lock exists with different payload → BLOCKED (duplicate token). ` +
      `If approvalId already used with different token → BLOCKED (approval reuse). ` +
      `If no conflict → write new lock with status=PENDING, TTL=300s, cleanupEligibleAt=+360s. ` +
      `AI cannot own this lock.`
    ),

    settingsHistoryWritePlan: step(5, 'SETTINGS_HISTORY_WRITE',
      `Write settingsHistory/${input.tenantId}/versions/${input.newVersion} inside transaction. ` +
      `Document must be: immutable=true, deleted=undefined, overwritten=undefined. ` +
      `Fields: version=${input.newVersion}, previousVersion=${input.expectedCurrentVersion}, ` +
      `configHash=${input.configAfterHash}, configBeforeHash=${input.configBeforeHash}, ` +
      `configAfterHash=${input.configAfterHash}, diffHash=${input.diffHash}, ` +
      `approvalId=${input.approvalId}, auditTrailId=${input.auditTrailId}. ` +
      `Append-only — no delete, no overwrite.`
    ),

    settingsUpdatePlan: step(6, 'SETTINGS_CURRENT_VERSION_UPDATE',
      `Update settings/${input.tenantId} inside same transaction. ` +
      `Set currentVersion=${input.newVersion} and apply new config values. ` +
      `Must occur in same transaction as settingsHistory write (atomic). ` +
      `If transaction fails → both writes are rolled back by Firestore.`
    ),

    auditEventPlan: step(7, 'AUDIT_EVENT_WRITE',
      `Write MODEL_CONFIG_APPLIED audit event inside transaction or via committed audit trail append. ` +
      `Payload: tenantId=${input.tenantId}, approvalId=${input.approvalId}, ` +
      `auditTrailId=${input.auditTrailId}, applyToken=${input.applyToken}, ` +
      `newVersion=${input.newVersion}. Must log callerUserId, callerType, generatedAt. ` +
      `AI cannot write audit events. Event is pure payload (Phase 1) — not written to Firestore until Phase 2+.`
    ),

    generatedAt: now,
  };
}
