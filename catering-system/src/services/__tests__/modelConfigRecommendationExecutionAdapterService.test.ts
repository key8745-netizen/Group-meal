import {
  buildApplyTransactionPlanFromRecommendation,
  buildRollbackTransactionPlanFromApproval,
} from '../modelConfigRecommendationExecutionAdapterService';
import { canonicalizeValue } from '../modelConfigCanonicalHashService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asModelConfigRecommendationId,
  asConfigVersion,
  asDiffHash,
  asRollbackToken,
} from '../../types/modelConfigApply';
import type { ModelConfigRecommendation } from '../../types/predictionEngine';
import type {
  PersistedHumanModelConfigApproval,
  PersistedHumanModelConfigRollbackApproval,
} from '../../types/modelConfigApplyExecution';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigRecommendationExecutionAdapterService ===\n');

// ─── Test fixtures ────────────────────────────────────────────────────────────

const tenantId = 'tenant-001' as TenantId;
const otherTenantId = 'tenant-999' as TenantId;
const auditTrailId = 'audit-001' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-001');
const recId = asModelConfigRecommendationId('rec-001');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const diffHash = asDiffHash('diff-abc123');
const configBeforeHash = asDiffHash('before-abc');
const configAfterHash = asDiffHash('after-abc');
const now = new Date('2026-06-04T00:00:00.000Z');

const validRecommendation: ModelConfigRecommendation = {
  _kind: 'recommendation',
  recommendationId: 'rec-001',
  tenantId,
  auditTrailId,
  proposedWeights: { historicalUsageWeight: 1.2, wasteRiskWeight: 0.8 },
  rationale: ['usage up', 'waste stable'],
  blockedReasons: [],
  warnings: [],
  aiCanApply: false,
  requiresHumanApproval: true,
  createdAt: now,
};

const validApproval: PersistedHumanModelConfigApproval = {
  _kind: 'persisted_human_model_config_approval',
  approvalId,
  tenantId,
  sourceRecommendationId: recId,
  approvedByHumanUserId: 'user-human-001',
  approvalReason: 'Looks good, aligns with trend',
  approvedAt: now,
  auditTrailId,
  targetVersion: v2,
  expectedCurrentVersion: v1,
  diffHash,
  configBeforeHash,
  configAfterHash,
  status: 'APPROVED',
  aiCanApprove: false,
  persisted: true,
};

console.log('--- Apply plan from recommendation ---\n');

// Valid case → plan created
const validResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: validApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-001',
  callerType: 'human',
  callerUserId: 'user-human-001',
  now,
});

expect('valid: plan is not null', validResult.plan !== null);
expect('valid: plan._kind = model_config_apply_transaction_plan', validResult.plan?._kind === 'model_config_apply_transaction_plan');
expect('valid: plan.executable === false', validResult.plan?.executable === false);
expect('valid: plan.aiCanExecute === false', validResult.plan?.aiCanExecute === false);
expect('valid: plan.requiresHumanApproval === true', validResult.plan?.requiresHumanApproval === true);
expect('valid: blockedReasons empty', validResult.blockedReasons.length === 0);
expect('valid: auditEvent.eventType === MODEL_CONFIG_APPLIED_PLAN_CREATED', validResult.auditEvent.eventType === 'MODEL_CONFIG_APPLIED_PLAN_CREATED');
expect('valid: auditEvent.metadata.aiCanExecute === false', validResult.auditEvent.metadata.aiCanExecute === false);
expect('valid: auditEvent.metadata.executable === false', validResult.auditEvent.metadata.executable === false);
expect('valid: auditEvent.metadata.requiresHumanApproval === true', validResult.auditEvent.metadata.requiresHumanApproval === true);

// plan has no forbidden properties
const planKeys = Object.keys(validResult.plan ?? {});
expect('plan has no "apply" property', !planKeys.includes('apply'));
expect('plan has no "execute" property', !planKeys.includes('execute'));
expect('plan has no "commit" property', !planKeys.includes('commit'));
expect('plan has no "write" property', !planKeys.includes('write'));
expect('plan has no "runTransaction" property', !planKeys.includes('runTransaction'));

// settingsHistoryWritePlan guards
expect('settingsHistoryWritePlan.immutable === true', validResult.plan?.settingsHistoryWritePlan.immutable === true);
expect('settingsHistoryWritePlan.appendOnly === true', validResult.plan?.settingsHistoryWritePlan.appendOnly === true);

// idempotencyLockPlan
expect('idempotencyLockPlan.planOnly === true', validResult.plan?.idempotencyLockPlan.planOnly === true);

// applyToken determinism
const result2 = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: validApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-002',
  callerType: 'human',
  callerUserId: 'user-human-001',
  now,
});
expect('applyToken deterministic across two calls', validResult.plan?.applyToken === result2.plan?.applyToken);

// --- Blocked cases ---

// tenant mismatch
const tenantMismatchApproval = { ...validApproval, tenantId: otherTenantId };
const tenantMismatchResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: tenantMismatchApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-tm',
  callerType: 'human',
  callerUserId: 'user-001',
  now,
});
expect('tenant mismatch: plan === null', tenantMismatchResult.plan === null);
expect('tenant mismatch: EXEC_TENANT_MISMATCH', tenantMismatchResult.blockedReasons.includes('EXEC_TENANT_MISMATCH'));

// AI caller
const aiCallerResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: validApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-ai',
  callerType: 'ai',
  callerUserId: 'ai-bot',
  now,
});
expect('AI caller: plan === null', aiCallerResult.plan === null);
expect('AI caller: EXEC_AI_CALLER_BLOCKED', aiCallerResult.blockedReasons.includes('EXEC_AI_CALLER_BLOCKED'));

// approval not APPROVED
const pendingApproval = { ...validApproval, status: 'PENDING_REVIEW' as const };
const pendingResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: pendingApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-pending',
  callerType: 'human',
  callerUserId: 'user-001',
  now,
});
expect('not approved: plan === null', pendingResult.plan === null);
expect('not approved: EXEC_APPROVAL_NOT_APPROVED', pendingResult.blockedReasons.includes('EXEC_APPROVAL_NOT_APPROVED'));

// sourceRecommendationId mismatch
const wrongRecApproval = { ...validApproval, sourceRecommendationId: asModelConfigRecommendationId('rec-999') };
const wrongRecResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: wrongRecApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-wrec',
  callerType: 'human',
  callerUserId: 'user-001',
  now,
});
expect('rec id mismatch: plan === null', wrongRecResult.plan === null);
expect('rec id mismatch: EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH', wrongRecResult.blockedReasons.includes('EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH'));

// auditTrailId mismatch
const wrongAuditApproval = { ...validApproval, auditTrailId: 'audit-999' as AuditTrailId };
const wrongAuditResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: wrongAuditApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-audit',
  callerType: 'human',
  callerUserId: 'user-001',
  now,
});
expect('audit trail mismatch: plan === null', wrongAuditResult.plan === null);
expect('audit trail mismatch: EXEC_MISSING_AUDIT_TRAIL_ID', wrongAuditResult.blockedReasons.includes('EXEC_MISSING_AUDIT_TRAIL_ID'));

// missing approvedByHumanUserId
const noUserApproval = { ...validApproval, approvedByHumanUserId: '' };
const noUserResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: noUserApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-nouser',
  callerType: 'human',
  callerUserId: 'user-001',
  now,
});
expect('missing approvedBy: plan === null', noUserResult.plan === null);
expect('missing approvedBy: ADAPTER_MISSING_APPROVED_BY_USER', noUserResult.blockedReasons.includes('ADAPTER_MISSING_APPROVED_BY_USER'));

// missing approvalReason
const noReasonApproval = { ...validApproval, approvalReason: '   ' };
const noReasonResult = buildApplyTransactionPlanFromRecommendation({
  recommendation: validRecommendation,
  approval: noReasonApproval,
  currentConfigVersion: v1,
  weightMode: 'normalized',
  planId: 'plan-noreason',
  callerType: 'human',
  callerUserId: 'user-001',
  now,
});
expect('missing approvalReason: plan === null', noReasonResult.plan === null);
expect('missing approvalReason: ADAPTER_MISSING_APPROVAL_REASON', noReasonResult.blockedReasons.includes('ADAPTER_MISSING_APPROVAL_REASON'));

// ─── Rollback plan from approval ─────────────────────────────────────────────

console.log('\n--- Rollback plan from approval ---\n');

const validRollbackApproval: PersistedHumanModelConfigRollbackApproval = {
  _kind: 'persisted_human_model_config_rollback_approval',
  approvalId: asModelConfigApprovalId('rb-approval-001'),
  tenantId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  approvedByHumanUserId: 'user-human-001',
  approvalReason: 'Need to rollback bad weights',
  rollbackReason: 'Config caused prediction drift',
  approvedAt: now,
  auditTrailId,
  rollbackToken: asRollbackToken('token-rollback-placeholder'),
  status: 'APPROVED',
  aiCanApprove: false,
  persisted: true,
};

const validRollbackResult = buildRollbackTransactionPlanFromApproval({
  rollbackApproval: validRollbackApproval,
  callerType: 'human',
  callerUserId: 'user-human-001',
  planId: 'rb-plan-001',
  weightMode: 'normalized',
  rollbackWeights: { historicalUsageWeight: 1.0 },
  configAfterHash,
  diffHash,
  now,
});

expect('rollback: plan is not null', validRollbackResult.plan !== null);
expect('rollback: plan._kind = model_config_rollback_transaction_plan', validRollbackResult.plan?._kind === 'model_config_rollback_transaction_plan');
expect('rollback: plan.executable === false', validRollbackResult.plan?.executable === false);
expect('rollback: plan.aiCanExecute === false', validRollbackResult.plan?.aiCanExecute === false);
expect('rollback: plan.requiresHumanApproval === true', validRollbackResult.plan?.requiresHumanApproval === true);
expect('rollback: blockedReasons empty', validRollbackResult.blockedReasons.length === 0);
expect('rollback: auditEvent.eventType === MODEL_CONFIG_ROLLBACK_PLAN_CREATED', validRollbackResult.auditEvent.eventType === 'MODEL_CONFIG_ROLLBACK_PLAN_CREATED');

// rollback settingsHistoryWritePlan is appendOnly (rollback is modeled as new change, not delete)
expect('rollback: settingsHistoryWritePlan.appendOnly === true', validRollbackResult.plan?.settingsHistoryWritePlan.appendOnly === true);
expect('rollback: settingsHistoryWritePlan.immutable === true', validRollbackResult.plan?.settingsHistoryWritePlan.immutable === true);

// rollback AI caller
const rbAiResult = buildRollbackTransactionPlanFromApproval({
  rollbackApproval: validRollbackApproval,
  callerType: 'ai',
  callerUserId: 'ai-bot',
  planId: 'rb-plan-ai',
  weightMode: 'normalized',
  rollbackWeights: {},
  configAfterHash,
  diffHash,
  now,
});
expect('rollback AI caller: plan === null', rbAiResult.plan === null);
expect('rollback AI caller: ROLLBACK_EXEC_AI_CALLER_BLOCKED', rbAiResult.blockedReasons.includes('ROLLBACK_EXEC_AI_CALLER_BLOCKED'));

// rollback not approved
const rbPendingApproval = { ...validRollbackApproval, status: 'PENDING_REVIEW' as const };
const rbPendingResult = buildRollbackTransactionPlanFromApproval({
  rollbackApproval: rbPendingApproval,
  callerType: 'human',
  callerUserId: 'user-001',
  planId: 'rb-plan-pending',
  weightMode: 'normalized',
  rollbackWeights: {},
  configAfterHash,
  diffHash,
  now,
});
expect('rollback not approved: plan === null', rbPendingResult.plan === null);
expect('rollback not approved: ROLLBACK_EXEC_APPROVAL_NOT_APPROVED', rbPendingResult.blockedReasons.includes('ROLLBACK_EXEC_APPROVAL_NOT_APPROVED'));

// rollback same version
const rbSameVersionApproval = { ...validRollbackApproval, rollbackTargetVersion: v2, expectedCurrentVersion: v2 };
const rbSameVersionResult = buildRollbackTransactionPlanFromApproval({
  rollbackApproval: rbSameVersionApproval,
  callerType: 'human',
  callerUserId: 'user-001',
  planId: 'rb-plan-same',
  weightMode: 'normalized',
  rollbackWeights: {},
  configAfterHash,
  diffHash,
  now,
});
expect('rollback same version: plan === null', rbSameVersionResult.plan === null);
expect('rollback same version: ROLLBACK_EXEC_SAME_VERSION', rbSameVersionResult.blockedReasons.includes('ROLLBACK_EXEC_SAME_VERSION'));

// rollback missing reason
const rbNoReasonApproval = { ...validRollbackApproval, rollbackReason: '' };
const rbNoReasonResult = buildRollbackTransactionPlanFromApproval({
  rollbackApproval: rbNoReasonApproval,
  callerType: 'human',
  callerUserId: 'user-001',
  planId: 'rb-plan-noreason',
  weightMode: 'normalized',
  rollbackWeights: {},
  configAfterHash,
  diffHash,
  now,
});
expect('rollback missing reason: plan === null', rbNoReasonResult.plan === null);
expect('rollback missing reason: ROLLBACK_EXEC_MISSING_ROLLBACK_REASON', rbNoReasonResult.blockedReasons.includes('ROLLBACK_EXEC_MISSING_ROLLBACK_REASON'));

// rollbackToken changes when newVersion changes (different expectedCurrentVersion)
const rbApprovalV3 = {
  ...validRollbackApproval,
  expectedCurrentVersion: asConfigVersion('v3'),
  rollbackTargetVersion: v1,
};
const rbResultV3 = buildRollbackTransactionPlanFromApproval({
  rollbackApproval: rbApprovalV3,
  callerType: 'human',
  callerUserId: 'user-001',
  planId: 'rb-plan-v3',
  weightMode: 'normalized',
  rollbackWeights: {},
  configAfterHash,
  diffHash,
  now,
});
expect(
  'rollbackToken changes when expectedCurrentVersion changes',
  validRollbackResult.plan !== null &&
  rbResultV3.plan !== null &&
  validRollbackResult.plan.rollbackToken !== rbResultV3.plan.rollbackToken,
);

// ─── BigInt canonical JSON tests ─────────────────────────────────────────────

console.log('\n--- BigInt canonical JSON ---\n');

const bigintResult = canonicalizeValue(BigInt(42));
expect('BigInt → ok === false', !bigintResult.ok);
expect('BigInt → reason === CANONICAL_BIGINT_NOT_SUPPORTED', !bigintResult.ok && bigintResult.reason === 'CANONICAL_BIGINT_NOT_SUPPORTED');

const nestedBigintResult = canonicalizeValue({ a: 1, b: BigInt(99) });
expect('nested object with BigInt → ok === false', !nestedBigintResult.ok);
expect('nested object with BigInt → reason === CANONICAL_BIGINT_NOT_SUPPORTED', !nestedBigintResult.ok && nestedBigintResult.reason === 'CANONICAL_BIGINT_NOT_SUPPORTED');

const arrayBigintResult = canonicalizeValue([1, 2, BigInt(3)]);
expect('array containing BigInt → ok === false', !arrayBigintResult.ok);
expect('array containing BigInt → reason === CANONICAL_BIGINT_NOT_SUPPORTED', !arrayBigintResult.ok && arrayBigintResult.reason === 'CANONICAL_BIGINT_NOT_SUPPORTED');

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('');
if (fail === 0) console.log(`PASSED — modelConfigRecommendationExecutionAdapterService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures (${pass} passed)`); }
