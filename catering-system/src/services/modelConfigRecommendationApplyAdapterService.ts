import type { TenantId, AuditTrailId, BlockedReason } from '../types/aiBoundary';
import type { ModelConfigRecommendation } from '../types/predictionEngine';
import type {
  ModelConfigRecommendationId,
  ModelConfigApplyPlan,
  ModelConfigRollbackPlan,
  ModelConfigVersion,
  HumanModelConfigApproval,
  ApplyToken,
  RollbackToken,
  ConfigVersion,
  DiffHash,
} from '../types/modelConfigApply';
import {
  asModelConfigApprovalId,
  asDiffHash,
} from '../types/modelConfigApply';
import { simulateModelConfigApplyPlan } from './modelConfigApplyPlanService';
import { simulateModelConfigRollbackPlan } from './modelConfigRollbackPlanService';
import { buildModelConfigAuditEvent } from './modelConfigApplyAuditService';
import type { ModelConfigAuditEvent } from '../types/modelConfigApply';

// ─── Simulated Human Approval ─────────────────────────────────────────────────

export interface CreateSimulatedHumanApprovalInput {
  tenantId: TenantId;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvedByHumanUserId: string;
  approvalReason: string;
  auditTrailId: AuditTrailId;
  targetVersion: ConfigVersion;
  diffHash: DiffHash;
  now?: Date;
}

export interface SimulatedHumanApprovalResult {
  approval: HumanModelConfigApproval | null;
  blockedReasons: BlockedReason[];
}

export function createSimulatedHumanApproval(
  input: CreateSimulatedHumanApprovalInput,
): SimulatedHumanApprovalResult {
  const blockedReasons: BlockedReason[] = [];

  if (!input.approvedByHumanUserId || input.approvedByHumanUserId.trim() === '') {
    blockedReasons.push('ADAPTER_MISSING_APPROVED_BY_USER');
  }
  if (!input.approvalReason || input.approvalReason.trim() === '') {
    blockedReasons.push('ADAPTER_MISSING_APPROVAL_REASON');
  }

  if (blockedReasons.length > 0) {
    return { approval: null, blockedReasons };
  }

  const now = input.now ?? new Date();
  const approvalId = asModelConfigApprovalId(
    `approval-${input.tenantId}-${input.sourceRecommendationId}-${now.getTime()}`,
  );

  const approval: HumanModelConfigApproval = {
    _kind: 'model_config_approval',
    approvalId,
    tenantId: input.tenantId,
    sourceRecommendationId: input.sourceRecommendationId,
    approvedByHumanUserId: input.approvedByHumanUserId,
    approvalReason: input.approvalReason,
    approvedAt: now,
    auditTrailId: input.auditTrailId,
    targetVersion: input.targetVersion,
    diffHash: input.diffHash,
    aiCanApprove: false,
  };

  return { approval, blockedReasons: [] };
}

// ─── Full Pipeline Result ─────────────────────────────────────────────────────

export interface ApplyPlanFromRecommendationResult {
  applyPlan: ModelConfigApplyPlan;
  rollbackPlan: ModelConfigRollbackPlan | null;
  auditEvent: ModelConfigAuditEvent;
  blockedReasons: BlockedReason[];
}

export interface CreateApplyPlanFromRecommendationInput {
  recommendation: ModelConfigRecommendation;
  simulatedApproval: HumanModelConfigApproval;
  currentConfigVersion: ModelConfigVersion;
  planId: string;
  rollbackPlanId: string;
  applyToken: ApplyToken;
  rollbackToken: RollbackToken;
  now?: Date;
}

export function createApplyPlanFromRecommendation(
  input: CreateApplyPlanFromRecommendationInput,
): ApplyPlanFromRecommendationResult {
  const {
    recommendation,
    simulatedApproval,
    currentConfigVersion,
    planId,
    rollbackPlanId,
    applyToken,
    rollbackToken,
  } = input;
  const now = input.now ?? new Date();

  const blockedReasons: BlockedReason[] = [];

  // Guard: AI apply invariant must be honoured on the recommendation itself
  if (recommendation.aiCanApply !== false) {
    blockedReasons.push('ADAPTER_RECOMMENDATION_AI_APPLY_GUARD');
  }
  if (recommendation.requiresHumanApproval !== true) {
    blockedReasons.push('ADAPTER_RECOMMENDATION_HUMAN_APPROVAL_REQUIRED');
  }

  // Tenant continuity checks
  if (recommendation.tenantId !== simulatedApproval.tenantId) {
    blockedReasons.push('ADAPTER_RECOMMENDATION_TENANT_MISMATCH');
  }
  if (currentConfigVersion.tenantId !== simulatedApproval.tenantId) {
    blockedReasons.push('ADAPTER_APPROVAL_TENANT_MISMATCH');
  }

  // Recommendation ID must match approval's sourceRecommendationId
  if (
    (recommendation.recommendationId as string) !==
    (simulatedApproval.sourceRecommendationId as string)
  ) {
    blockedReasons.push('ADAPTER_RECOMMENDATION_ID_MISMATCH');
  }

  // Audit trail continuity
  if (recommendation.auditTrailId !== simulatedApproval.auditTrailId) {
    blockedReasons.push('ADAPTER_AUDIT_TRAIL_MISMATCH');
  }

  // Required approval fields
  if (!simulatedApproval.approvedByHumanUserId) {
    blockedReasons.push('ADAPTER_MISSING_APPROVED_BY_USER');
  }
  if (!simulatedApproval.approvalReason) {
    blockedReasons.push('ADAPTER_MISSING_APPROVAL_REASON');
  }

  const proposedVersion = simulatedApproval.targetVersion;

  const applyPlan = simulateModelConfigApplyPlan({
    planId,
    tenantId: simulatedApproval.tenantId,
    targetTenantId: simulatedApproval.tenantId,
    callerType: 'human',
    sourceRecommendationId: simulatedApproval.sourceRecommendationId,
    humanApprovalId: simulatedApproval.approvalId,
    auditTrailId: simulatedApproval.auditTrailId,
    previousVersion: currentConfigVersion.version,
    proposedVersion,
    previousWeights: currentConfigVersion.weights,
    proposedWeights: recommendation.proposedWeights,
    weightMode: currentConfigVersion.weightMode,
    applyToken,
    now,
  });

  // Merge any adapter-level blocked reasons into the plan's blocked reasons
  const mergedBlockedReasons = [...blockedReasons, ...applyPlan.blockedReasons];

  const finalApplyPlan: ModelConfigApplyPlan = {
    ...applyPlan,
    blockedReasons: mergedBlockedReasons,
  };

  // Build rollback plan referencing the proposed version as "current"
  const rollbackPlan = simulateModelConfigRollbackPlan({
    planId: rollbackPlanId,
    tenantId: simulatedApproval.tenantId,
    targetTenantId: simulatedApproval.tenantId,
    callerType: 'human',
    currentVersion: proposedVersion,
    rollbackTargetVersion: currentConfigVersion.version,
    rollbackToken,
    rollbackReason: `Rollback plan for apply plan ${planId}`,
    auditTrailId: simulatedApproval.auditTrailId,
    now,
  });

  const isBlocked = mergedBlockedReasons.length > 0;

  const auditEvent = buildModelConfigAuditEvent({
    eventType: isBlocked ? 'MODEL_CONFIG_APPLY_BLOCKED' : 'MODEL_CONFIG_APPLY_PLAN_CREATED',
    tenantId: simulatedApproval.tenantId,
    auditTrailId: simulatedApproval.auditTrailId,
    sourceRecommendationId: simulatedApproval.sourceRecommendationId,
    approvalId: simulatedApproval.approvalId,
    previousVersion: currentConfigVersion.version,
    newVersion: proposedVersion,
    diffHash: isBlocked ? asDiffHash(''.padStart(64, '0')) : finalApplyPlan.diffHash,
    blockedReasons: mergedBlockedReasons,
    approvedByHumanUserId: simulatedApproval.approvedByHumanUserId,
    appliedByHumanUserId: null,
    rollbackReason: null,
    rollbackReference: null,
    now,
  });

  return {
    applyPlan: finalApplyPlan,
    rollbackPlan: isBlocked ? null : rollbackPlan,
    auditEvent,
    blockedReasons: mergedBlockedReasons,
  };
}

// ─── Rollback from Apply Plan ─────────────────────────────────────────────────

export interface CreateRollbackPlanFromApplyPlanInput {
  applyPlan: ModelConfigApplyPlan;
  rollbackPlanId: string;
  rollbackToken: RollbackToken;
  rollbackReason: string;
  now?: Date;
}

export function createRollbackPlanFromApplyPlan(
  input: CreateRollbackPlanFromApplyPlanInput,
): ModelConfigRollbackPlan {
  const { applyPlan, rollbackPlanId, rollbackToken, rollbackReason } = input;
  const now = input.now ?? new Date();

  return simulateModelConfigRollbackPlan({
    planId: rollbackPlanId,
    tenantId: applyPlan.tenantId,
    targetTenantId: applyPlan.tenantId,
    callerType: 'human',
    currentVersion: applyPlan.proposedNewVersion,
    rollbackTargetVersion: applyPlan.previousVersion,
    rollbackToken,
    rollbackReason,
    auditTrailId: applyPlan.auditTrailId,
    now,
  });
}
