import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  RollbackToken,
  ModelWeights,
  WeightMode,
} from '../types/modelConfigApply';
import type {
  ModelConfigApplyTransactionPlan,
  ModelConfigRollbackTransactionPlan,
} from '../types/modelConfigApplyExecution';
import { buildSettingsHistoryWritePlan, buildSettingsUpdatePlan } from './modelConfigSettingsHistoryService';
import { buildIdempotencyLockPlan } from './modelConfigIdempotencyService';

export interface BuildApplyTransactionPlanInput {
  planId: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  applyToken: ApplyToken;
  auditTrailId: AuditTrailId;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  configBeforeHash: DiffHash;
  proposedWeights: Partial<ModelWeights>;
  weightMode: WeightMode;
  createdByHumanUserId: string;
  now?: Date;
}

export function buildModelConfigApplyTransactionPlan(
  input: BuildApplyTransactionPlanInput,
): ModelConfigApplyTransactionPlan {
  const now = input.now ?? new Date();

  const settingsHistoryWritePlan = buildSettingsHistoryWritePlan({
    tenantId: input.tenantId,
    version: input.newVersion,
    newVersion: input.newVersion,
    previousVersion: input.expectedCurrentVersion,
    configHash: input.configAfterHash,
    diffHash: input.diffHash,
    sourceRecommendationId: input.sourceRecommendationId,
    approvalId: input.approvalId,
    auditTrailId: input.auditTrailId,
    createdByHumanUserId: input.createdByHumanUserId,
    createdAt: now,
  });

  const settingsUpdatePlan = buildSettingsUpdatePlan({
    tenantId: input.tenantId,
    currentVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    proposedWeights: input.proposedWeights,
    weightMode: input.weightMode,
    configAfterHash: input.configAfterHash,
  });

  const idempotencyLockPlan = buildIdempotencyLockPlan(
    input.applyToken,
    input.tenantId,
    input.auditTrailId,
  );

  const auditEventPlan = {
    _kind: 'audit_event_plan' as const,
    eventType: 'MODEL_CONFIG_APPLIED_PLAN_CREATED',
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    approvalId: input.approvalId,
    sourceRecommendationId: input.sourceRecommendationId,
    previousVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    rollbackTargetVersion: null,
    diffHash: input.diffHash,
    configBeforeHash: input.configBeforeHash,
    configAfterHash: input.configAfterHash,
    applyToken: input.applyToken,
    rollbackToken: null,
    rollbackReason: null,
    aiCanExecute: false as const,
    executable: false as const,
  };

  return {
    _kind: 'model_config_apply_transaction_plan',
    planId: input.planId,
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    sourceRecommendationId: input.sourceRecommendationId,
    expectedCurrentVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    applyToken: input.applyToken,
    settingsHistoryWritePlan,
    settingsUpdatePlan,
    idempotencyLockPlan,
    auditEventPlan,
    blockedReasons: [],
    executable: false,
    aiCanExecute: false,
    requiresHumanApproval: true,
    createdAt: now,
  };
}

export interface BuildRollbackTransactionPlanInput {
  planId: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  rollbackToken: RollbackToken;
  rollbackReason: string;
  auditTrailId: AuditTrailId;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  proposedWeights: Partial<ModelWeights>;
  weightMode: WeightMode;
  createdByHumanUserId: string;
  now?: Date;
}

export function buildModelConfigRollbackTransactionPlan(
  input: BuildRollbackTransactionPlanInput,
): ModelConfigRollbackTransactionPlan {
  const now = input.now ?? new Date();

  const settingsHistoryWritePlan = buildSettingsHistoryWritePlan({
    tenantId: input.tenantId,
    version: input.rollbackTargetVersion,
    newVersion: input.rollbackTargetVersion,
    previousVersion: input.expectedCurrentVersion,
    configHash: input.configAfterHash,
    diffHash: input.diffHash,
    sourceRecommendationId: null,
    approvalId: input.approvalId,
    auditTrailId: input.auditTrailId,
    createdByHumanUserId: input.createdByHumanUserId,
    createdAt: now,
  });

  const settingsUpdatePlan = buildSettingsUpdatePlan({
    tenantId: input.tenantId,
    currentVersion: input.expectedCurrentVersion,
    newVersion: input.rollbackTargetVersion,
    proposedWeights: input.proposedWeights,
    weightMode: input.weightMode,
    configAfterHash: input.configAfterHash,
  });

  const idempotencyLockPlan = buildIdempotencyLockPlan(
    input.rollbackToken,
    input.tenantId,
    input.auditTrailId,
  );

  const auditEventPlan = {
    _kind: 'audit_event_plan' as const,
    eventType: 'MODEL_CONFIG_ROLLBACK_PLAN_CREATED',
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    approvalId: input.approvalId,
    sourceRecommendationId: null,
    previousVersion: input.expectedCurrentVersion,
    newVersion: input.rollbackTargetVersion,
    rollbackTargetVersion: input.rollbackTargetVersion,
    diffHash: input.diffHash,
    configBeforeHash: null,
    configAfterHash: input.configAfterHash,
    applyToken: null,
    rollbackToken: input.rollbackToken,
    rollbackReason: input.rollbackReason,
    aiCanExecute: false as const,
    executable: false as const,
  };

  return {
    _kind: 'model_config_rollback_transaction_plan',
    planId: input.planId,
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    rollbackTargetVersion: input.rollbackTargetVersion,
    expectedCurrentVersion: input.expectedCurrentVersion,
    rollbackToken: input.rollbackToken,
    settingsHistoryWritePlan,
    settingsUpdatePlan,
    idempotencyLockPlan,
    auditEventPlan,
    blockedReasons: [],
    executable: false,
    aiCanExecute: false,
    requiresHumanApproval: true,
    createdAt: now,
  };
}
