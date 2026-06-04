import type { TenantId, AuditTrailId, BlockedReason, CallerType } from '../types/aiBoundary';
import type { ConfigVersion, RollbackToken } from '../types/modelConfigApply';
import type { PersistedHumanModelConfigRollbackApproval, ModelConfigRollbackPreflightResult } from '../types/modelConfigApplyExecution';

export interface RollbackPreflightInput {
  tenantId: TenantId;
  callerType: CallerType;
  callerUserId: string;
  rollbackApproval: PersistedHumanModelConfigRollbackApproval;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  rollbackToken: RollbackToken;
  auditTrailId: AuditTrailId;
  rollbackReason: string;
}

export function validateModelConfigRollbackPreflight(
  input: RollbackPreflightInput,
): ModelConfigRollbackPreflightResult {
  const blocked: BlockedReason[] = [];

  // Tenant guard FIRST
  if (!input.tenantId) {
    blocked.push('ROLLBACK_EXEC_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked, warnings: [], tenantId: input.tenantId, callerType: input.callerType };
  }
  if (input.rollbackApproval.tenantId !== input.tenantId) {
    blocked.push('ROLLBACK_EXEC_APPROVAL_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked, warnings: [], tenantId: input.tenantId, callerType: input.callerType };
  }

  // Caller guard
  if (input.callerType === 'ai') {
    blocked.push('ROLLBACK_EXEC_AI_CALLER_BLOCKED');
  }

  // Required fields
  if (!input.rollbackApproval.approvalId) blocked.push('ROLLBACK_EXEC_MISSING_APPROVAL_ID');
  if (!input.auditTrailId) blocked.push('ROLLBACK_EXEC_MISSING_AUDIT_TRAIL_ID');
  if (!input.rollbackTargetVersion) blocked.push('ROLLBACK_EXEC_MISSING_ROLLBACK_TARGET_VERSION');
  if (!input.expectedCurrentVersion) blocked.push('ROLLBACK_EXEC_MISSING_EXPECTED_VERSION');
  if (!input.rollbackToken) blocked.push('ROLLBACK_EXEC_MISSING_ROLLBACK_TOKEN');
  if (!input.rollbackReason || input.rollbackReason.trim() === '') blocked.push('ROLLBACK_EXEC_MISSING_ROLLBACK_REASON');

  // Approval status
  if (input.rollbackApproval.status !== 'APPROVED') {
    blocked.push('ROLLBACK_EXEC_APPROVAL_NOT_APPROVED');
  }

  // Same version guard
  if (input.rollbackTargetVersion === input.expectedCurrentVersion) {
    blocked.push('ROLLBACK_EXEC_SAME_VERSION');
  }

  const valid = blocked.length === 0;
  return { valid, blockedReasons: blocked, warnings: [], tenantId: input.tenantId, callerType: input.callerType };
}
