import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelConfigRollbackPlan,
  ConfigVersion,
  RollbackToken,
} from '../types/modelConfigApply';
import { validateRollbackPlanInput } from './modelConfigValidationService';

export interface SimulateRollbackPlanInput {
  planId: string;
  tenantId: TenantId;
  targetTenantId: TenantId;
  callerType: 'human' | 'ai' | 'system';
  currentVersion: ConfigVersion | null | undefined;
  rollbackTargetVersion: ConfigVersion | null | undefined;
  rollbackToken: RollbackToken | null | undefined;
  rollbackReason: string | null | undefined;
  auditTrailId: AuditTrailId | null | undefined;
  now?: Date;
}

export function simulateModelConfigRollbackPlan(
  input: SimulateRollbackPlanInput,
): ModelConfigRollbackPlan {
  const now = input.now ?? new Date();

  const validation = validateRollbackPlanInput({
    tenantId: input.tenantId,
    targetTenantId: input.targetTenantId,
    callerType: input.callerType,
    currentVersion: input.currentVersion ?? null,
    rollbackTargetVersion: input.rollbackTargetVersion ?? null,
    rollbackToken: input.rollbackToken ?? null,
    auditTrailId: input.auditTrailId ?? null,
    rollbackReason: input.rollbackReason ?? null,
  });

  return {
    _kind: 'model_config_rollback_plan',
    planId: input.planId,
    tenantId: input.tenantId,
    currentVersion: (input.currentVersion ?? '') as ConfigVersion,
    rollbackTargetVersion: (input.rollbackTargetVersion ?? '') as ConfigVersion,
    rollbackToken: (input.rollbackToken ?? '') as RollbackToken,
    rollbackReason: input.rollbackReason ?? '',
    auditTrailId: (input.auditTrailId ?? '') as AuditTrailId,
    humanApprovalRequired: true,
    blockedReasons: validation.blockedReasons,
    warnings: validation.warnings,
    executable: false,
    aiCanRollback: false,
    createdAt: now,
  };
}
