import {
  createSimulatedHumanApproval,
  createApplyPlanFromRecommendation,
  createRollbackPlanFromApplyPlan,
} from '../modelConfigRecommendationApplyAdapterService';
import {
  asConfigVersion,
  asApplyToken,
  asRollbackToken,
  asModelConfigApprovalId,
  asModelConfigRecommendationId,
  asDiffHash,
} from '../../types/modelConfigApply';
import type { ModelConfigVersion, SimulatedHumanModelConfigApproval } from '../../types/modelConfigApply';
import type { ModelConfigRecommendation } from '../../types/predictionEngine';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

const T1 = 'tenant-1' as TenantId;
const T2 = 'tenant-2' as TenantId;
const AUDIT = 'audit-1' as AuditTrailId;
const V1 = asConfigVersion('v1');
const V2 = asConfigVersion('v2');
const REC_ID = asModelConfigRecommendationId('rec-1');
const APPROVAL_ID = asModelConfigApprovalId('approval-1');
const APPLY_TOKEN = asApplyToken('apply-tok');
const ROLLBACK_TOKEN = asRollbackToken('rollback-tok');
const DIFF_HASH = asDiffHash('a'.repeat(64));
const NOW = new Date('2026-01-01');

const BASE_WEIGHTS = {
  historicalUsageWeight: 1.0,
  wasteRiskWeight: 1.0,
  receivingDeltaWeight: 1.0,
  safetyStockWeight: 1.0,
};

const BASE_CONFIG_VERSION: ModelConfigVersion = {
  version: V1,
  tenantId: T1,
  weights: BASE_WEIGHTS,
  weightMode: 'independent_multiplier',
  createdAt: NOW,
  createdByHumanUserId: 'user-1',
  auditTrailId: AUDIT,
  sourceRecommendationId: null,
  configHash: DIFF_HASH,
};

const BASE_RECOMMENDATION: ModelConfigRecommendation = {
  _kind: 'recommendation',
  recommendationId: REC_ID as string,
  tenantId: T1,
  auditTrailId: AUDIT,
  proposedWeights: { historicalUsageWeight: 1.2, wasteRiskWeight: 0.9 },
  rationale: ['improved accuracy'],
  blockedReasons: [],
  warnings: [],
  aiCanApply: false,
  requiresHumanApproval: true,
  createdAt: NOW,
};

// Phase 3: BASE_APPROVAL is SimulatedHumanModelConfigApproval (type-isolated from persisted HumanModelConfigApproval)
const BASE_APPROVAL: SimulatedHumanModelConfigApproval = {
  _kind: 'simulated_human_model_config_approval',
  persisted: false,
  executable: false,
  approvalId: APPROVAL_ID,
  tenantId: T1,
  sourceRecommendationId: REC_ID,
  approvedByHumanUserId: 'user-1',
  approvalReason: 'looks good',
  approvedAt: NOW,
  auditTrailId: AUDIT,
  targetVersion: V2,
  diffHash: DIFF_HASH,
  aiCanApprove: false,
};

let pass = 0;
let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- modelConfigRecommendationApplyAdapterService ---');

// ─── createSimulatedHumanApproval ─────────────────────────────────────────────

console.log('\n[createSimulatedHumanApproval]');

const { approval } = createSimulatedHumanApproval({
  tenantId: T1,
  sourceRecommendationId: REC_ID,
  approvedByHumanUserId: 'user-1',
  approvalReason: 'approved',
  auditTrailId: AUDIT,
  targetVersion: V2,
  diffHash: DIFF_HASH,
  now: NOW,
});
expect('_kind is simulated_human_model_config_approval', approval!._kind === 'simulated_human_model_config_approval');
expect('_kind is NOT model_config_approval (type-isolated)', (approval!._kind as string) !== 'model_config_approval');
expect('persisted is false', approval!.persisted === false);
expect('executable is false', approval!.executable === false);
expect('aiCanApprove is false', approval!.aiCanApprove === false);
expect('tenantId correct', approval!.tenantId === T1);
expect('sourceRecommendationId correct', approval!.sourceRecommendationId === REC_ID);
expect('approvedByHumanUserId correct', approval!.approvedByHumanUserId === 'user-1');
expect('approvalReason correct', approval!.approvalReason === 'approved');

const noUser = createSimulatedHumanApproval({
  tenantId: T1, sourceRecommendationId: REC_ID,
  approvedByHumanUserId: '', approvalReason: 'fine',
  auditTrailId: AUDIT, targetVersion: V2, diffHash: DIFF_HASH, now: NOW,
});
expect('missing approvedByHumanUserId → blocked', noUser.approval === null);
expect('missing approvedByHumanUserId → ADAPTER_MISSING_APPROVED_BY_USER', noUser.blockedReasons.includes('ADAPTER_MISSING_APPROVED_BY_USER'));

const noReason = createSimulatedHumanApproval({
  tenantId: T1, sourceRecommendationId: REC_ID,
  approvedByHumanUserId: 'user-1', approvalReason: '   ',
  auditTrailId: AUDIT, targetVersion: V2, diffHash: DIFF_HASH, now: NOW,
});
expect('whitespace-only approvalReason → blocked', noReason.approval === null);
expect('whitespace-only approvalReason → ADAPTER_MISSING_APPROVAL_REASON', noReason.blockedReasons.includes('ADAPTER_MISSING_APPROVAL_REASON'));

// ─── createApplyPlanFromRecommendation — happy path ───────────────────────────

console.log('\n[createApplyPlanFromRecommendation — happy path]');

const result = createApplyPlanFromRecommendation({
  recommendation: BASE_RECOMMENDATION,
  simulatedApproval: BASE_APPROVAL,
  currentConfigVersion: BASE_CONFIG_VERSION,
  planId: 'plan-1',
  rollbackPlanId: 'rollback-plan-1',
  applyToken: APPLY_TOKEN,
  rollbackToken: ROLLBACK_TOKEN,
  now: NOW,
});

expect('applyPlan._kind is model_config_apply_plan_dry_run', result.applyPlan._kind === 'model_config_apply_plan_dry_run');
expect('applyPlan.executable is false', result.applyPlan.executable === false);
expect('applyPlan.aiCanApply is false', result.applyPlan.aiCanApply === false);
expect('applyPlan.requiresHumanApproval is true', result.applyPlan.requiresHumanApproval === true);
expect('applyPlan.tenantId correct', result.applyPlan.tenantId === T1);
expect('applyPlan.blockedReasons empty', result.applyPlan.blockedReasons.length === 0);
expect('applyPlan.configBeforeHash !== configAfterHash', result.applyPlan.configBeforeHash !== result.applyPlan.configAfterHash);
expect('applyPlan.diffHash is 64 chars', result.applyPlan.diffHash.length === 64);

expect('rollbackPlan returned', result.rollbackPlan !== null);
expect('rollbackPlan._kind is model_config_rollback_plan_dry_run', result.rollbackPlan!._kind === 'model_config_rollback_plan_dry_run');
expect('rollbackPlan.executable is false', result.rollbackPlan!.executable === false);
expect('rollbackPlan.aiCanRollback is false', result.rollbackPlan!.aiCanRollback === false);
expect('rollbackPlan.humanApprovalRequired is true', result.rollbackPlan!.humanApprovalRequired === true);
expect('rollbackPlan.rollbackTargetVersion is V1', result.rollbackPlan!.rollbackTargetVersion === V1);
expect('rollbackPlan.currentVersion is V2', result.rollbackPlan!.currentVersion === V2);

expect('auditEvent.eventType is APPLY_PLAN_CREATED', result.auditEvent.eventType === 'MODEL_CONFIG_APPLY_PLAN_CREATED');
expect('auditEvent.aiCanApply false', result.auditEvent.metadata.aiCanApply === false);
expect('auditEvent.aiCanRollback false', result.auditEvent.metadata.aiCanRollback === false);
expect('auditEvent.executable false', result.auditEvent.metadata.executable === false);
expect('auditEvent.requiresHumanApproval true', result.auditEvent.metadata.requiresHumanApproval === true);
expect('blockedReasons empty', result.blockedReasons.length === 0);

// ─── Tenant mismatch: recommendation vs approval ──────────────────────────────

console.log('\n[tenant mismatch]');

const wrongRecTenant: ModelConfigRecommendation = {
  ...BASE_RECOMMENDATION, tenantId: T2,
};
const r1 = createApplyPlanFromRecommendation({
  recommendation: wrongRecTenant,
  simulatedApproval: BASE_APPROVAL,
  currentConfigVersion: BASE_CONFIG_VERSION,
  planId: 'plan-2', rollbackPlanId: 'rp-2',
  applyToken: APPLY_TOKEN, rollbackToken: ROLLBACK_TOKEN, now: NOW,
});
expect('rec tenant mismatch → ADAPTER_RECOMMENDATION_TENANT_MISMATCH', r1.blockedReasons.includes('ADAPTER_RECOMMENDATION_TENANT_MISMATCH'));
expect('rec tenant mismatch → auditEvent BLOCKED', r1.auditEvent.eventType === 'MODEL_CONFIG_APPLY_BLOCKED');
expect('rec tenant mismatch → rollbackPlan null', r1.rollbackPlan === null);

const wrongConfigTenant: ModelConfigVersion = {
  ...BASE_CONFIG_VERSION, tenantId: T2,
};
const r2 = createApplyPlanFromRecommendation({
  recommendation: BASE_RECOMMENDATION,
  simulatedApproval: BASE_APPROVAL,
  currentConfigVersion: wrongConfigTenant,
  planId: 'plan-3', rollbackPlanId: 'rp-3',
  applyToken: APPLY_TOKEN, rollbackToken: ROLLBACK_TOKEN, now: NOW,
});
expect('config tenant mismatch → ADAPTER_APPROVAL_TENANT_MISMATCH', r2.blockedReasons.includes('ADAPTER_APPROVAL_TENANT_MISMATCH'));

// ─── Recommendation ID mismatch ───────────────────────────────────────────────

console.log('\n[recommendationId mismatch]');

const wrongRecId = asModelConfigRecommendationId('rec-WRONG');
const wrongApproval: SimulatedHumanModelConfigApproval = {
  ...BASE_APPROVAL, sourceRecommendationId: wrongRecId,
};
const r3 = createApplyPlanFromRecommendation({
  recommendation: BASE_RECOMMENDATION,
  simulatedApproval: wrongApproval,
  currentConfigVersion: BASE_CONFIG_VERSION,
  planId: 'plan-4', rollbackPlanId: 'rp-4',
  applyToken: APPLY_TOKEN, rollbackToken: ROLLBACK_TOKEN, now: NOW,
});
expect('rec ID mismatch → ADAPTER_RECOMMENDATION_ID_MISMATCH', r3.blockedReasons.includes('ADAPTER_RECOMMENDATION_ID_MISMATCH'));

// ─── Audit trail mismatch ─────────────────────────────────────────────────────

console.log('\n[audit trail mismatch]');

const wrongAuditApproval: SimulatedHumanModelConfigApproval = {
  ...BASE_APPROVAL, auditTrailId: 'audit-WRONG' as AuditTrailId,
};
const r4 = createApplyPlanFromRecommendation({
  recommendation: BASE_RECOMMENDATION,
  simulatedApproval: wrongAuditApproval,
  currentConfigVersion: BASE_CONFIG_VERSION,
  planId: 'plan-5', rollbackPlanId: 'rp-5',
  applyToken: APPLY_TOKEN, rollbackToken: ROLLBACK_TOKEN, now: NOW,
});
expect('audit trail mismatch → ADAPTER_AUDIT_TRAIL_MISMATCH', r4.blockedReasons.includes('ADAPTER_AUDIT_TRAIL_MISMATCH'));

// ─── AI guard invariants ──────────────────────────────────────────────────────

console.log('\n[AI guard invariants]');

expect('happy path: applyPlan.aiCanApply === false (literal)', result.applyPlan.aiCanApply === false);
expect('blocked path: applyPlan.aiCanApply === false (literal)', r1.applyPlan.aiCanApply === false);
expect('happy path: applyPlan.executable === false (literal)', result.applyPlan.executable === false);
expect('blocked path: applyPlan.executable === false (literal)', r1.applyPlan.executable === false);

// ─── createRollbackPlanFromApplyPlan ──────────────────────────────────────────

console.log('\n[createRollbackPlanFromApplyPlan]');

const rollback = createRollbackPlanFromApplyPlan({
  applyPlan: result.applyPlan,
  rollbackPlanId: 'standalone-rp-1',
  rollbackToken: ROLLBACK_TOKEN,
  rollbackReason: 'accuracy dropped',
  now: NOW,
});
expect('rollback._kind is model_config_rollback_plan_dry_run', rollback._kind === 'model_config_rollback_plan_dry_run');
expect('rollback.executable is false', rollback.executable === false);
expect('rollback.aiCanRollback is false', rollback.aiCanRollback === false);
expect('rollback.humanApprovalRequired is true', rollback.humanApprovalRequired === true);
expect('rollback.rollbackTargetVersion is applyPlan.previousVersion', rollback.rollbackTargetVersion === result.applyPlan.previousVersion);
expect('rollback.currentVersion is applyPlan.proposedNewVersion', rollback.currentVersion === result.applyPlan.proposedNewVersion);
expect('rollback.rollbackReason correct', rollback.rollbackReason === 'accuracy dropped');
expect('rollback.blockedReasons empty', rollback.blockedReasons.length === 0);

// ─── Determinism ──────────────────────────────────────────────────────────────

console.log('\n[determinism]');

const result2 = createApplyPlanFromRecommendation({
  recommendation: BASE_RECOMMENDATION,
  simulatedApproval: BASE_APPROVAL,
  currentConfigVersion: BASE_CONFIG_VERSION,
  planId: 'plan-1',
  rollbackPlanId: 'rollback-plan-1',
  applyToken: APPLY_TOKEN,
  rollbackToken: ROLLBACK_TOKEN,
  now: NOW,
});
expect('deterministic configBeforeHash', result.applyPlan.configBeforeHash === result2.applyPlan.configBeforeHash);
expect('deterministic configAfterHash', result.applyPlan.configAfterHash === result2.applyPlan.configAfterHash);
expect('deterministic diffHash', result.applyPlan.diffHash === result2.applyPlan.diffHash);

// ─── Pure — no I/O ────────────────────────────────────────────────────────────

expect('createApplyPlanFromRecommendation is synchronous', !(result instanceof Promise));
expect('createRollbackPlanFromApplyPlan is synchronous', !(rollback instanceof Promise));

if (fail === 0) console.log(`\nPASSED — modelConfigRecommendationApplyAdapterService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
