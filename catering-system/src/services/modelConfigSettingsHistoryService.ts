import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ModelWeights,
  WeightMode,
} from '../types/modelConfigApply';
import type {
  SettingsHistoryVersion,
  SettingsHistoryWritePlan,
  SettingsUpdatePlan,
} from '../types/modelConfigApplyExecution';

export interface BuildSettingsHistoryVersionInput {
  tenantId: TenantId;
  version: ConfigVersion;
  previousVersion: ConfigVersion;
  configHash: DiffHash;
  diffHash: DiffHash;
  sourceRecommendationId: ModelConfigRecommendationId | null;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  createdByHumanUserId: string;
  createdAt: Date;
}

export function buildSettingsHistoryVersion(
  input: BuildSettingsHistoryVersionInput,
): SettingsHistoryVersion {
  return {
    _kind: 'settings_history_version',
    tenantId: input.tenantId,
    version: input.version,
    previousVersion: input.previousVersion,
    configHash: input.configHash,
    diffHash: input.diffHash,
    sourceRecommendationId: input.sourceRecommendationId,
    approvalId: input.approvalId,
    auditTrailId: input.auditTrailId,
    createdByHumanUserId: input.createdByHumanUserId,
    createdAt: input.createdAt,
    immutable: true,
  };
}

export interface BuildSettingsHistoryWritePlanInput extends BuildSettingsHistoryVersionInput {
  newVersion: ConfigVersion;
}

export function buildSettingsHistoryWritePlan(
  input: BuildSettingsHistoryWritePlanInput,
): SettingsHistoryWritePlan {
  return {
    _kind: 'settings_history_write_plan',
    tenantId: input.tenantId,
    newVersion: input.newVersion,
    previousVersion: input.previousVersion,
    configHash: input.configHash,
    diffHash: input.diffHash,
    sourceRecommendationId: input.sourceRecommendationId ?? ('' as ModelConfigRecommendationId),
    approvalId: input.approvalId,
    auditTrailId: input.auditTrailId,
    createdByHumanUserId: input.createdByHumanUserId,
    createdAt: input.createdAt,
    immutable: true,
    appendOnly: true,
  };
}

export interface BuildSettingsUpdatePlanInput {
  tenantId: TenantId;
  currentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  proposedWeights: Partial<ModelWeights>;
  weightMode: WeightMode;
  configAfterHash: DiffHash;
}

export function buildSettingsUpdatePlan(input: BuildSettingsUpdatePlanInput): SettingsUpdatePlan {
  return {
    _kind: 'settings_update_plan',
    tenantId: input.tenantId,
    currentVersion: input.currentVersion,
    newVersion: input.newVersion,
    proposedWeights: input.proposedWeights,
    weightMode: input.weightMode,
    configAfterHash: input.configAfterHash,
  };
}
