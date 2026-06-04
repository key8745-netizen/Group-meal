import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelWeights,
  WeightMode,
  ModelConfigApplyPlan,
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ApplyToken,
  ConfigVersion,
  DiffHash,
} from '../types/modelConfigApply';
import { validateApplyPlanInput } from './modelConfigValidationService';
import { computeModelConfigDiff } from './modelConfigDiffService';

const EMPTY_HASH = '' as DiffHash;

export interface SimulateApplyPlanInput {
  planId: string;
  tenantId: TenantId;
  targetTenantId: TenantId;
  callerType: 'human' | 'ai' | 'system';
  sourceRecommendationId: ModelConfigRecommendationId | null | undefined;
  humanApprovalId: ModelConfigApprovalId | null | undefined;
  auditTrailId: AuditTrailId | null | undefined;
  previousVersion: ConfigVersion | null | undefined;
  proposedVersion: ConfigVersion | null | undefined;
  previousWeights: ModelWeights;
  proposedWeights: Partial<ModelWeights>;
  weightMode: WeightMode;
  applyToken: ApplyToken | null | undefined;
  now?: Date;
}

export function simulateModelConfigApplyPlan(input: SimulateApplyPlanInput): ModelConfigApplyPlan {
  const now = input.now ?? new Date();

  const validation = validateApplyPlanInput({
    tenantId: input.tenantId,
    targetTenantId: input.targetTenantId,
    callerType: input.callerType,
    humanApprovalId: input.humanApprovalId ?? null,
    auditTrailId: input.auditTrailId ?? null,
    sourceRecommendationId: input.sourceRecommendationId ?? null,
    applyToken: input.applyToken ?? null,
    previousVersion: input.previousVersion ?? null,
    proposedVersion: input.proposedVersion ?? null,
    proposedWeights: input.proposedWeights,
    weightMode: input.weightMode,
  });

  if (!validation.valid || !input.previousVersion || !input.proposedVersion) {
    return {
      _kind: 'model_config_apply_plan_dry_run',
      planId: input.planId,
      tenantId: input.tenantId,
      sourceRecommendationId: (input.sourceRecommendationId ?? '') as ModelConfigRecommendationId,
      humanApprovalId: (input.humanApprovalId ?? '') as ModelConfigApprovalId,
      auditTrailId: (input.auditTrailId ?? '') as AuditTrailId,
      previousVersion: (input.previousVersion ?? '') as ConfigVersion,
      proposedNewVersion: (input.proposedVersion ?? '') as ConfigVersion,
      proposedWeights: input.proposedWeights,
      configBeforeHash: EMPTY_HASH,
      configAfterHash: EMPTY_HASH,
      diffHash: EMPTY_HASH,
      applyToken: (input.applyToken ?? '') as ApplyToken,
      weightMode: input.weightMode,
      blockedReasons: validation.blockedReasons,
      warnings: validation.warnings,
      executable: false,
      aiCanApply: false,
      requiresHumanApproval: true,
      createdAt: now,
    };
  }

  const diff = computeModelConfigDiff({
    tenantId: input.tenantId,
    previousVersion: input.previousVersion,
    previousWeights: input.previousWeights,
    proposedWeights: input.proposedWeights,
    proposedVersion: input.proposedVersion,
    now,
  });

  return {
    _kind: 'model_config_apply_plan_dry_run',
    planId: input.planId,
    tenantId: input.tenantId,
    sourceRecommendationId: input.sourceRecommendationId as ModelConfigRecommendationId,
    humanApprovalId: input.humanApprovalId as ModelConfigApprovalId,
    auditTrailId: input.auditTrailId as AuditTrailId,
    previousVersion: input.previousVersion,
    proposedNewVersion: input.proposedVersion,
    proposedWeights: input.proposedWeights,
    configBeforeHash: diff.configBeforeHash,
    configAfterHash: diff.configAfterHash,
    diffHash: diff.diffHash,
    applyToken: input.applyToken as ApplyToken,
    weightMode: input.weightMode,
    blockedReasons: [],
    warnings: validation.warnings,
    executable: false,
    aiCanApply: false,
    requiresHumanApproval: true,
    createdAt: now,
  };
}
