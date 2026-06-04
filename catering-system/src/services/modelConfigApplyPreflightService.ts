import type { TenantId, AuditTrailId, BlockedReason, CallerType } from '../types/aiBoundary';
import type {
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  ModelWeights,
} from '../types/modelConfigApply';
import type { PersistedHumanModelConfigApproval, ModelConfigApplyPreflightResult } from '../types/modelConfigApplyExecution';

export interface ApplyPreflightInput {
  tenantId: TenantId;
  callerType: CallerType;
  callerUserId: string;
  approval: PersistedHumanModelConfigApproval;
  sourceRecommendationId: ModelConfigRecommendationId;
  expectedCurrentVersion: ConfigVersion;
  applyToken: ApplyToken;
  auditTrailId: AuditTrailId;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  proposedWeights: Partial<ModelWeights>;
}

export function validateModelConfigApplyPreflight(
  input: ApplyPreflightInput,
): ModelConfigApplyPreflightResult {
  const blocked: BlockedReason[] = [];

  // Tenant guard FIRST
  if (!input.tenantId) {
    blocked.push('EXEC_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked, warnings: [], tenantId: input.tenantId, callerType: input.callerType };
  }
  if (input.approval.tenantId !== input.tenantId) {
    blocked.push('EXEC_APPROVAL_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked, warnings: [], tenantId: input.tenantId, callerType: input.callerType };
  }

  // Caller guard
  if (input.callerType === 'ai') {
    blocked.push('EXEC_AI_CALLER_BLOCKED');
  }

  // Required fields
  if (!input.approval.approvalId) blocked.push('EXEC_MISSING_APPROVAL_ID');
  if (!input.auditTrailId) blocked.push('EXEC_MISSING_AUDIT_TRAIL_ID');
  if (!input.expectedCurrentVersion) blocked.push('EXEC_MISSING_EXPECTED_VERSION');
  if (!input.applyToken) blocked.push('EXEC_MISSING_APPLY_TOKEN');
  if (!input.diffHash) blocked.push('EXEC_MISSING_DIFF_HASH');
  if (!input.configBeforeHash) blocked.push('EXEC_MISSING_BEFORE_HASH');
  if (!input.configAfterHash) blocked.push('EXEC_MISSING_AFTER_HASH');

  // Approval status
  if (input.approval.status !== 'APPROVED') {
    blocked.push('EXEC_APPROVAL_NOT_APPROVED');
  }

  // Recommendation ID match
  if ((input.approval.sourceRecommendationId as string) !== (input.sourceRecommendationId as string)) {
    blocked.push('EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH');
  }

  // Proposed weights validation
  const weights = input.proposedWeights;
  if (weights && Object.keys(weights).length > 0) {
    for (const [, v] of Object.entries(weights)) {
      if (typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v) || v < 0) {
        blocked.push('EXEC_INVALID_PROPOSED_WEIGHTS');
        break;
      }
    }
  }

  const valid = blocked.length === 0;
  return { valid, blockedReasons: blocked, warnings: [], tenantId: input.tenantId, callerType: input.callerType };
}
