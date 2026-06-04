/**
 * modelConfigRecommendationExecutionAdapterService.ts
 *
 * Feature 005 Phase 2: Wires ModelConfigRecommendation → PersistedHumanModelConfigApproval
 * → dry-run apply/rollback transaction plans.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI components, no async, no side effects
 *  - All plans: aiCanExecute: false, executable: false, requiresHumanApproval: true
 */

import type { BlockedReason, CallerType } from '../types/aiBoundary';
import type { ModelConfigRecommendation } from '../types/predictionEngine';
import type {
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ModelWeights,
  WeightMode,
} from '../types/modelConfigApply';
import type {
  PersistedHumanModelConfigApproval,
  PersistedHumanModelConfigRollbackApproval,
  ModelConfigApplyTransactionPlan,
  ModelConfigRollbackTransactionPlan,
  ModelConfigExecutionAuditEvent,
} from '../types/modelConfigApplyExecution';
import { generateApplyToken, generateRollbackToken } from './modelConfigIdempotencyService';
import { buildModelConfigApplyTransactionPlan, buildModelConfigRollbackTransactionPlan } from './modelConfigTransactionPlanService';
import { buildModelConfigExecutionAuditEvent } from './modelConfigExecutionAuditService';
import type { TenantId } from '../types/aiBoundary';

// ─── Apply Plan from Recommendation ──────────────────────────────────────────

export interface BuildApplyFromRecommendationInput {
  recommendation: ModelConfigRecommendation;
  approval: PersistedHumanModelConfigApproval;
  currentConfigVersion: ConfigVersion;
  weightMode: WeightMode;
  planId: string;
  callerType: CallerType;
  callerUserId: string;
  now?: Date;
}

export interface ApplyFromRecommendationResult {
  plan: ModelConfigApplyTransactionPlan | null;
  auditEvent: ModelConfigExecutionAuditEvent;
  blockedReasons: BlockedReason[];
}

export function buildApplyTransactionPlanFromRecommendation(
  input: BuildApplyFromRecommendationInput,
): ApplyFromRecommendationResult {
  const now = input.now ?? new Date();
  const blocked: BlockedReason[] = [];

  // 1. Tenant guard FIRST
  if (input.approval.tenantId !== input.recommendation.tenantId) {
    blocked.push('EXEC_TENANT_MISMATCH');
    return {
      plan: null,
      auditEvent: buildModelConfigExecutionAuditEvent({
        eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
        tenantId: input.recommendation.tenantId as TenantId,
        auditTrailId: input.recommendation.auditTrailId,
        approvalId: input.approval.approvalId,
        sourceRecommendationId: input.recommendation.recommendationId as unknown as ModelConfigRecommendationId,
        previousVersion: input.currentConfigVersion,
        newVersion: null,
        rollbackTargetVersion: null,
        diffHash: null,
        applyToken: null,
        rollbackToken: null,
        blockedReasons: blocked,
        approvedByHumanUserId: null,
        rollbackReason: null,
        now,
      }),
      blockedReasons: blocked,
    };
  }

  // 2. AI caller guard
  if (input.callerType === 'ai') {
    blocked.push('EXEC_AI_CALLER_BLOCKED');
  }

  // 3. recommendation.aiCanApply guard
  if (input.recommendation.aiCanApply !== false) {
    blocked.push('ADAPTER_RECOMMENDATION_AI_APPLY_GUARD');
  }

  // 4. recommendation.requiresHumanApproval guard
  if (input.recommendation.requiresHumanApproval !== true) {
    blocked.push('ADAPTER_RECOMMENDATION_HUMAN_APPROVAL_REQUIRED');
  }

  // 5. approval status
  if (input.approval.status !== 'APPROVED') {
    blocked.push('EXEC_APPROVAL_NOT_APPROVED');
  }

  // 6. sourceRecommendationId mismatch
  if ((input.approval.sourceRecommendationId as string) !== (input.recommendation.recommendationId as string)) {
    blocked.push('EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH');
  }

  // 7. auditTrailId mismatch
  if (input.approval.auditTrailId !== input.recommendation.auditTrailId) {
    blocked.push('EXEC_MISSING_AUDIT_TRAIL_ID');
  }

  // 8. missing approvedByHumanUserId
  if (!input.approval.approvedByHumanUserId) {
    blocked.push('ADAPTER_MISSING_APPROVED_BY_USER');
  }

  // 9. missing approvalReason
  if (!input.approval.approvalReason || input.approval.approvalReason.trim() === '') {
    blocked.push('ADAPTER_MISSING_APPROVAL_REASON');
  }

  if (blocked.length > 0) {
    return {
      plan: null,
      auditEvent: buildModelConfigExecutionAuditEvent({
        eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
        tenantId: input.recommendation.tenantId as TenantId,
        auditTrailId: input.recommendation.auditTrailId,
        approvalId: input.approval.approvalId,
        sourceRecommendationId: input.recommendation.recommendationId as unknown as ModelConfigRecommendationId,
        previousVersion: input.currentConfigVersion,
        newVersion: null,
        rollbackTargetVersion: null,
        diffHash: null,
        applyToken: null,
        rollbackToken: null,
        blockedReasons: blocked,
        approvedByHumanUserId: input.approval.approvedByHumanUserId || null,
        rollbackReason: null,
        now,
      }),
      blockedReasons: blocked,
    };
  }

  // Generate applyToken
  const applyToken = generateApplyToken({
    tenantId: input.approval.tenantId,
    approvalId: input.approval.approvalId,
    sourceRecommendationId: input.approval.sourceRecommendationId,
    expectedCurrentVersion: input.approval.expectedCurrentVersion,
    newVersion: input.approval.targetVersion,
    auditTrailId: input.approval.auditTrailId,
    diffHash: input.approval.diffHash,
  });

  // Build plan
  const plan = buildModelConfigApplyTransactionPlan({
    planId: input.planId,
    tenantId: input.approval.tenantId,
    approvalId: input.approval.approvalId,
    sourceRecommendationId: input.approval.sourceRecommendationId,
    expectedCurrentVersion: input.approval.expectedCurrentVersion,
    newVersion: input.approval.targetVersion,
    applyToken,
    auditTrailId: input.approval.auditTrailId,
    configAfterHash: input.approval.configAfterHash,
    diffHash: input.approval.diffHash,
    configBeforeHash: input.approval.configBeforeHash,
    proposedWeights: input.recommendation.proposedWeights,
    weightMode: input.weightMode,
    createdByHumanUserId: input.approval.approvedByHumanUserId,
    now,
  });

  const auditEvent = buildModelConfigExecutionAuditEvent({
    eventType: 'MODEL_CONFIG_APPLIED_PLAN_CREATED',
    tenantId: input.approval.tenantId,
    auditTrailId: input.approval.auditTrailId,
    approvalId: input.approval.approvalId,
    sourceRecommendationId: input.approval.sourceRecommendationId,
    previousVersion: input.approval.expectedCurrentVersion,
    newVersion: input.approval.targetVersion,
    rollbackTargetVersion: null,
    diffHash: input.approval.diffHash,
    applyToken,
    rollbackToken: null,
    blockedReasons: [],
    approvedByHumanUserId: input.approval.approvedByHumanUserId,
    rollbackReason: null,
    now,
  });

  return { plan, auditEvent, blockedReasons: [] };
}

// ─── Rollback Plan from Approval ─────────────────────────────────────────────

export interface BuildRollbackFromApprovalInput {
  rollbackApproval: PersistedHumanModelConfigRollbackApproval;
  callerType: CallerType;
  callerUserId: string;
  planId: string;
  weightMode: WeightMode;
  rollbackWeights: Partial<ModelWeights>;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  now?: Date;
}

export interface RollbackFromApprovalResult {
  plan: ModelConfigRollbackTransactionPlan | null;
  auditEvent: ModelConfigExecutionAuditEvent;
  blockedReasons: BlockedReason[];
}

export function buildRollbackTransactionPlanFromApproval(
  input: BuildRollbackFromApprovalInput,
): RollbackFromApprovalResult {
  const now = input.now ?? new Date();
  const blocked: BlockedReason[] = [];

  // 1. Tenant guard
  if (!input.rollbackApproval.tenantId) {
    blocked.push('ROLLBACK_EXEC_TENANT_MISMATCH');
    return {
      plan: null,
      auditEvent: buildModelConfigExecutionAuditEvent({
        eventType: 'MODEL_CONFIG_ROLLBACK_BLOCKED',
        tenantId: '' as TenantId,
        auditTrailId: input.rollbackApproval.auditTrailId,
        approvalId: input.rollbackApproval.approvalId,
        sourceRecommendationId: null,
        previousVersion: null,
        newVersion: null,
        rollbackTargetVersion: null,
        diffHash: null,
        applyToken: null,
        rollbackToken: null,
        blockedReasons: blocked,
        approvedByHumanUserId: null,
        rollbackReason: null,
        now,
      }),
      blockedReasons: blocked,
    };
  }

  // 2. AI caller guard
  if (input.callerType === 'ai') {
    blocked.push('ROLLBACK_EXEC_AI_CALLER_BLOCKED');
  }

  // 3. approval status
  if (input.rollbackApproval.status !== 'APPROVED') {
    blocked.push('ROLLBACK_EXEC_APPROVAL_NOT_APPROVED');
  }

  // 4. missing rollbackTargetVersion
  if (!input.rollbackApproval.rollbackTargetVersion) {
    blocked.push('ROLLBACK_EXEC_MISSING_ROLLBACK_TARGET_VERSION');
  }

  // 5. missing expectedCurrentVersion
  if (!input.rollbackApproval.expectedCurrentVersion) {
    blocked.push('ROLLBACK_EXEC_MISSING_EXPECTED_VERSION');
  }

  // 6. missing rollbackToken
  if (!input.rollbackApproval.rollbackToken) {
    blocked.push('ROLLBACK_EXEC_MISSING_ROLLBACK_TOKEN');
  }

  // 7. missing rollbackReason
  if (!input.rollbackApproval.rollbackReason || input.rollbackApproval.rollbackReason.trim() === '') {
    blocked.push('ROLLBACK_EXEC_MISSING_ROLLBACK_REASON');
  }

  // 8. same version guard
  if (
    input.rollbackApproval.rollbackTargetVersion &&
    input.rollbackApproval.expectedCurrentVersion &&
    input.rollbackApproval.rollbackTargetVersion === input.rollbackApproval.expectedCurrentVersion
  ) {
    blocked.push('ROLLBACK_EXEC_SAME_VERSION');
  }

  if (blocked.length > 0) {
    return {
      plan: null,
      auditEvent: buildModelConfigExecutionAuditEvent({
        eventType: 'MODEL_CONFIG_ROLLBACK_BLOCKED',
        tenantId: input.rollbackApproval.tenantId,
        auditTrailId: input.rollbackApproval.auditTrailId,
        approvalId: input.rollbackApproval.approvalId,
        sourceRecommendationId: null,
        previousVersion: input.rollbackApproval.expectedCurrentVersion ?? null,
        newVersion: null,
        rollbackTargetVersion: input.rollbackApproval.rollbackTargetVersion ?? null,
        diffHash: null,
        applyToken: null,
        rollbackToken: null,
        blockedReasons: blocked,
        approvedByHumanUserId: input.rollbackApproval.approvedByHumanUserId,
        rollbackReason: input.rollbackApproval.rollbackReason,
        now,
      }),
      blockedReasons: blocked,
    };
  }

  // Generate rollbackToken
  const rollbackToken = generateRollbackToken({
    tenantId: input.rollbackApproval.tenantId,
    approvalId: input.rollbackApproval.approvalId,
    rollbackTargetVersion: input.rollbackApproval.rollbackTargetVersion,
    expectedCurrentVersion: input.rollbackApproval.expectedCurrentVersion,
    newVersion: input.rollbackApproval.expectedCurrentVersion, // newVersion = the version being replaced
    auditTrailId: input.rollbackApproval.auditTrailId,
    rollbackReason: input.rollbackApproval.rollbackReason,
  });

  const plan = buildModelConfigRollbackTransactionPlan({
    planId: input.planId,
    tenantId: input.rollbackApproval.tenantId,
    approvalId: input.rollbackApproval.approvalId,
    rollbackTargetVersion: input.rollbackApproval.rollbackTargetVersion,
    expectedCurrentVersion: input.rollbackApproval.expectedCurrentVersion,
    newVersion: input.rollbackApproval.expectedCurrentVersion,
    rollbackToken,
    rollbackReason: input.rollbackApproval.rollbackReason,
    auditTrailId: input.rollbackApproval.auditTrailId,
    configAfterHash: input.configAfterHash,
    diffHash: input.diffHash,
    proposedWeights: input.rollbackWeights,
    weightMode: input.weightMode,
    createdByHumanUserId: input.rollbackApproval.approvedByHumanUserId,
    now,
  });

  const auditEvent = buildModelConfigExecutionAuditEvent({
    eventType: 'MODEL_CONFIG_ROLLBACK_PLAN_CREATED',
    tenantId: input.rollbackApproval.tenantId,
    auditTrailId: input.rollbackApproval.auditTrailId,
    approvalId: input.rollbackApproval.approvalId,
    sourceRecommendationId: null,
    previousVersion: input.rollbackApproval.expectedCurrentVersion,
    newVersion: input.rollbackApproval.rollbackTargetVersion,
    rollbackTargetVersion: input.rollbackApproval.rollbackTargetVersion,
    diffHash: input.diffHash,
    applyToken: null,
    rollbackToken,
    blockedReasons: [],
    approvedByHumanUserId: input.rollbackApproval.approvedByHumanUserId,
    rollbackReason: input.rollbackApproval.rollbackReason,
    now,
  });

  return { plan, auditEvent, blockedReasons: [] };
}
