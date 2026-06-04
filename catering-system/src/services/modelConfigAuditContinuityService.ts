import type { BlockedReason } from '../types/aiBoundary';
import { hashCanonicalObject } from './modelConfigCanonicalHashService';
import type {
  ModelConfigRecommendationId,
  ModelConfigApprovalId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  RollbackToken,
} from '../types/modelConfigApply';
import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type { ModelConfigRecommendation } from '../types/predictionEngine';
import type { PersistedHumanModelConfigApproval, ModelConfigApplyTransactionPlan } from '../types/modelConfigApplyExecution';

export interface ApplyAuditMetadata {
  tenantId: TenantId;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
}

export interface RollbackAuditMetadata {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  rollbackReason: string;
  rollbackReasonHash: string;
  rollbackToken: RollbackToken;
}

export interface AuditContinuityResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

export function validateApplyAuditMetadataContinuity(
  plan: ApplyAuditMetadata,
  auditEvent: ApplyAuditMetadata,
): AuditContinuityResult {
  const blocked: BlockedReason[] = [];
  if (plan.tenantId !== auditEvent.tenantId) blocked.push('AUDIT_CONTINUITY_TENANT_MISMATCH');
  if ((plan.approvalId as string) !== (auditEvent.approvalId as string)) blocked.push('AUDIT_CONTINUITY_APPROVAL_ID_MISMATCH');
  if ((plan.auditTrailId as string) !== (auditEvent.auditTrailId as string)) blocked.push('AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH');
  if ((plan.sourceRecommendationId as string) !== (auditEvent.sourceRecommendationId as string)) blocked.push('AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH');
  if ((plan.expectedCurrentVersion as string) !== (auditEvent.expectedCurrentVersion as string)) blocked.push('AUDIT_CONTINUITY_VERSION_MISMATCH');
  if ((plan.newVersion as string) !== (auditEvent.newVersion as string)) blocked.push('AUDIT_CONTINUITY_VERSION_MISMATCH');
  if ((plan.diffHash as string) !== (auditEvent.diffHash as string)) blocked.push('AUDIT_CONTINUITY_DIFF_HASH_MISMATCH');
  if ((plan.configBeforeHash as string) !== (auditEvent.configBeforeHash as string)) blocked.push('AUDIT_CONTINUITY_CONFIG_BEFORE_HASH_MISMATCH');
  if ((plan.configAfterHash as string) !== (auditEvent.configAfterHash as string)) blocked.push('AUDIT_CONTINUITY_CONFIG_AFTER_HASH_MISMATCH');
  if ((plan.applyToken as string) !== (auditEvent.applyToken as string)) blocked.push('AUDIT_CONTINUITY_ROLLBACK_TOKEN_MISMATCH');
  return { valid: blocked.length === 0, blockedReasons: blocked };
}

export function validateRollbackAuditMetadataContinuity(
  plan: RollbackAuditMetadata,
  auditEvent: RollbackAuditMetadata,
): AuditContinuityResult {
  const blocked: BlockedReason[] = [];
  if (plan.tenantId !== auditEvent.tenantId) blocked.push('AUDIT_CONTINUITY_TENANT_MISMATCH');
  if ((plan.approvalId as string) !== (auditEvent.approvalId as string)) blocked.push('AUDIT_CONTINUITY_APPROVAL_ID_MISMATCH');
  if ((plan.auditTrailId as string) !== (auditEvent.auditTrailId as string)) blocked.push('AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH');
  if ((plan.rollbackTargetVersion as string) !== (auditEvent.rollbackTargetVersion as string)) blocked.push('AUDIT_CONTINUITY_ROLLBACK_TARGET_VERSION_MISMATCH');
  if ((plan.expectedCurrentVersion as string) !== (auditEvent.expectedCurrentVersion as string)) blocked.push('AUDIT_CONTINUITY_VERSION_MISMATCH');
  if ((plan.newVersion as string) !== (auditEvent.newVersion as string)) blocked.push('AUDIT_CONTINUITY_VERSION_MISMATCH');
  if (plan.rollbackReason !== auditEvent.rollbackReason) blocked.push('AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH');
  if (plan.rollbackReasonHash !== auditEvent.rollbackReasonHash) blocked.push('AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH');
  if ((plan.rollbackToken as string) !== (auditEvent.rollbackToken as string)) blocked.push('AUDIT_CONTINUITY_ROLLBACK_TOKEN_MISMATCH');
  return { valid: blocked.length === 0, blockedReasons: blocked };
}

export function computeRollbackReasonHash(rollbackReason: string): string {
  const result = hashCanonicalObject({ rollbackReason });
  if (!result.ok) throw new Error(`Cannot hash rollbackReason: ${result.reason}`);
  return result.hash;
}

export interface RecommendationContinuityResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

export function validateRecommendationToTransactionPlanContinuity(
  recommendation: ModelConfigRecommendation,
  approval: PersistedHumanModelConfigApproval,
  plan: ModelConfigApplyTransactionPlan,
): RecommendationContinuityResult {
  const blocked: BlockedReason[] = [];
  // tenantId chain
  if (recommendation.tenantId !== approval.tenantId) blocked.push('AUDIT_CONTINUITY_TENANT_MISMATCH');
  if ((approval.tenantId as string) !== (plan.tenantId as string)) blocked.push('AUDIT_CONTINUITY_TENANT_MISMATCH');
  // auditTrailId chain
  if ((recommendation.auditTrailId as string) !== (approval.auditTrailId as string)) blocked.push('AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH');
  if ((approval.auditTrailId as string) !== (plan.idempotencyLockPlan.auditTrailId as string)) blocked.push('AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH');
  // recommendationId → sourceRecommendationId chain
  if ((recommendation.recommendationId as string) !== (approval.sourceRecommendationId as string)) blocked.push('AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH');
  if ((approval.sourceRecommendationId as string) !== (plan.sourceRecommendationId as string)) blocked.push('AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH');
  return { valid: blocked.length === 0, blockedReasons: blocked };
}
