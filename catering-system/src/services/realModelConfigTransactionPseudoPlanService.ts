/**
 * realModelConfigTransactionPseudoPlanService.ts
 *
 * Feature 007 Phase 1 + Phase 2: Transaction Pseudo-plan Builder
 *
 * Builds a descriptive, non-executable pseudo-plan for the real model config
 * apply transaction. Phase 2 adds canonical hash consistency validation:
 *  - canonical(currentConfig) hash must equal configBeforeHash
 *  - configBeforeHash / configAfterHash / diffHash must all be present
 *  - hash fields must be consistent across pseudo-plan and audit event
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - executable: false, aiCanExecute: false, dryRunOnly: true
 */

import type { TenantId, AuditTrailId, BlockedReason } from '../types/aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId } from '../types/modelConfigApply';
import type {
  RealModelConfigApplyPseudoPlan,
  RealModelConfigApplyGuardResult,
  PseudoPlanStep,
} from '../types/realModelConfigApplyExecution';
import { validateCanonicalModelConfigHashInput } from './realModelConfigCanonicalizationService';

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
  /**
   * Phase 2: caller-supplied current config object for canonical hash verification.
   * If supplied, its canonical hash must equal configBeforeHash.
   * If not supplied, hash consistency check is skipped (deferred to Phase 3 real transaction).
   */
  currentConfigObject?: unknown;
  now?: Date;
}

export interface BuildPseudoPlanResult {
  plan: RealModelConfigApplyPseudoPlan | null;
  blocked: boolean;
  blockedReasons: BlockedReason[];
}

function step(n: number, name: string, description: string): PseudoPlanStep {
  return { step: n, name, description, executable: false };
}

/**
 * Validates hash field continuity: all three hash fields must be present
 * and the currentConfigObject (if supplied) must canonicalize to configBeforeHash.
 */
function validateHashContinuity(input: BuildPseudoPlanInput): BlockedReason[] {
  const blocked: BlockedReason[] = [];

  if (!input.configBeforeHash || (input.configBeforeHash as string).trim() === '') {
    blocked.push('REAL_EXEC_CONFIG_BEFORE_HASH_MISSING');
  }
  if (!input.configAfterHash || (input.configAfterHash as string).trim() === '') {
    blocked.push('REAL_EXEC_CONFIG_AFTER_HASH_MISSING');
  }
  if (!input.diffHash || (input.diffHash as string).trim() === '') {
    blocked.push('REAL_EXEC_DIFF_HASH_MISSING');
  }

  // If currentConfigObject supplied, canonical hash must equal configBeforeHash
  if (input.currentConfigObject !== undefined && blocked.length === 0) {
    const canonical = validateCanonicalModelConfigHashInput(input.currentConfigObject);
    if (!canonical.valid || !canonical.canonicalized) {
      blocked.push(...canonical.blockedReasons);
    } else if ((canonical.canonicalized.inputHash as string) !== (input.configBeforeHash as string)) {
      blocked.push('REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH');
    }
  }

  return blocked;
}

/**
 * Builds a non-executable pseudo-plan for a real model config apply transaction.
 *
 * Phase 2 additions:
 *  - Hash continuity validation (configBeforeHash / configAfterHash / diffHash)
 *  - currentConfigObject canonical hash === configBeforeHash check
 *  - Returns blocked result when hash mismatch detected
 *
 * Returns BuildPseudoPlanResult — either a valid plan or a list of blockedReasons.
 */
export function buildRealModelConfigApplyTransactionPseudoPlan(
  input: BuildPseudoPlanInput,
): BuildPseudoPlanResult {
  const now = input.now ?? new Date();

  // Phase 2: validate hash continuity before building plan
  const hashErrors = validateHashContinuity(input);
  if (hashErrors.length > 0) {
    return { plan: null, blocked: true, blockedReasons: hashErrors };
  }

  const plan: RealModelConfigApplyPseudoPlan = {
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
      `Validate caller is HUMAN, tenantId matches, all required fields present. ` +
      `AI callers are hard-blocked. Service Account / Admin SDK do not bypass this guard. ` +
      `Spoofed token claims are blocked. Malformed context is blocked. ` +
      `Tenant: ${input.tenantId}. Guard allowed: ${input.guardResult.allowed}.`
    ),

    approvalValidationPlan: step(2, 'APPROVAL_VALIDATION',
      `Read persisted approval record for approvalId=${input.approvalId} inside transaction. ` +
      `Validate: status=APPROVED, tenantId matches, sourceRecommendationId matches, approval not expired. ` +
      `Block if any mismatch. Requires Firestore read inside runTransaction (Phase 3+).`
    ),

    settingsReadPlan: step(3, 'SETTINGS_CURRENT_VERSION_READ',
      `Read settings/${input.tenantId} document inside transaction. ` +
      `Validate currentVersion === expectedCurrentVersion (${input.expectedCurrentVersion}). ` +
      `Validate canonical(currentConfig) hash === configBeforeHash (${input.configBeforeHash}). ` +
      `Block if version or hash mismatch — race condition / tampered state guard. ` +
      `Requires Firestore read inside runTransaction (Phase 3+).`
    ),

    idempotencyLockPlan: step(4, 'IDEMPOTENCY_LOCK_CHECK_AND_WRITE',
      `Check modelConfigIdempotencyLocks/${input.tenantId}:${input.applyToken} inside transaction. ` +
      `Same payload → idempotent replay allowed. Different payload → BLOCKED. ` +
      `Same approvalId + different token → BLOCKED (approval reuse). ` +
      `No conflict → write lock. TTL=300s, cleanupEligibleAt=+360s. AI cannot own this lock.`
    ),

    settingsHistoryWritePlan: step(5, 'SETTINGS_HISTORY_WRITE',
      `Write settingsHistory/${input.tenantId}/versions/${input.newVersion} inside transaction. ` +
      `immutable=true. configHash=${input.configAfterHash}. ` +
      `configBeforeHash=${input.configBeforeHash}. configAfterHash=${input.configAfterHash}. ` +
      `diffHash=${input.diffHash}. approvalId=${input.approvalId}. ` +
      `auditTrailId=${input.auditTrailId}. Append-only — no delete, no overwrite.`
    ),

    settingsUpdatePlan: step(6, 'SETTINGS_CURRENT_VERSION_UPDATE',
      `Update settings/${input.tenantId} inside same transaction. ` +
      `Set currentVersion=${input.newVersion} and apply new config. ` +
      `Atomic with settingsHistory write — if transaction fails, both roll back.`
    ),

    auditEventPlan: step(7, 'AUDIT_EVENT_WRITE',
      `Write MODEL_CONFIG_APPLIED audit event. ` +
      `Hash fields carried from plan: configBeforeHash=${input.configBeforeHash}, ` +
      `configAfterHash=${input.configAfterHash}, diffHash=${input.diffHash}. ` +
      `applyToken=${input.applyToken}. auditTrailId=${input.auditTrailId}. ` +
      `approvalId=${input.approvalId}. Hash fields must match plan — any mismatch is BLOCKED. ` +
      `AI cannot write audit events. Phase 1–2: pure payload only.`
    ),

    generatedAt: now,
  };

  return { plan, blocked: false, blockedReasons: [] };
}

/**
 * Validates that an audit event payload's hash fields are consistent with
 * the pseudo-plan's hash fields. Pure logic — no Firestore.
 */
export interface AuditHashContinuityInput {
  planConfigBeforeHash: DiffHash;
  planConfigAfterHash: DiffHash;
  planDiffHash: DiffHash;
  planApplyToken: ApplyToken;
  planAuditTrailId: AuditTrailId;
  planApprovalId: ModelConfigApprovalId;
  planSourceRecommendationId: ModelConfigRecommendationId;
  auditConfigBeforeHash: DiffHash;
  auditConfigAfterHash: DiffHash;
  auditDiffHash: DiffHash;
  auditApplyToken: ApplyToken;
  auditAuditTrailId: AuditTrailId;
  auditApprovalId: ModelConfigApprovalId;
  auditSourceRecommendationId: ModelConfigRecommendationId;
}

export interface AuditHashContinuityResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

export function validateAuditHashContinuity(
  input: AuditHashContinuityInput,
): AuditHashContinuityResult {
  const blocked: BlockedReason[] = [];

  if ((input.planConfigBeforeHash as string) !== (input.auditConfigBeforeHash as string)) {
    blocked.push('REAL_EXEC_HASH_CONTINUITY_BROKEN');
  }
  if ((input.planConfigAfterHash as string) !== (input.auditConfigAfterHash as string)) {
    blocked.push('REAL_EXEC_AUDIT_HASH_MISMATCH');
  }
  if ((input.planDiffHash as string) !== (input.auditDiffHash as string)) {
    blocked.push('REAL_EXEC_AUDIT_HASH_MISMATCH');
  }
  if ((input.planApplyToken as string) !== (input.auditApplyToken as string)) {
    blocked.push('REAL_EXEC_AUDIT_TOKEN_MISMATCH');
  }
  if ((input.planAuditTrailId as string) !== (input.auditAuditTrailId as string)) {
    blocked.push('REAL_EXEC_AUDIT_TRAIL_ID_MISMATCH');
  }
  if ((input.planApprovalId as string) !== (input.auditApprovalId as string)) {
    blocked.push('REAL_EXEC_AUDIT_APPROVAL_ID_MISMATCH');
  }
  if ((input.planSourceRecommendationId as string) !== (input.auditSourceRecommendationId as string)) {
    blocked.push('REAL_EXEC_AUDIT_SOURCE_REC_MISMATCH');
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}
