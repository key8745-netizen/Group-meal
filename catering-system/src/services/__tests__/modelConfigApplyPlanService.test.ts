import { simulateModelConfigApplyPlan } from '../modelConfigApplyPlanService';
import { asApplyToken, asConfigVersion, asModelConfigApprovalId, asModelConfigRecommendationId } from '../../types/modelConfigApply';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

const T1 = 'tenant-1' as TenantId;
const T2 = 'tenant-2' as TenantId;
const AUDIT = 'audit-1' as AuditTrailId;
const V1 = asConfigVersion('v1');
const V2 = asConfigVersion('v2');
const APPROVAL = asModelConfigApprovalId('approval-1');
const REC = asModelConfigRecommendationId('rec-1');
const TOKEN = asApplyToken('apply-tok');
const WEIGHTS = { historicalUsageWeight: 1.0, wasteRiskWeight: 1.0, receivingDeltaWeight: 1.0, safetyStockWeight: 1.0 };
const NOW = new Date('2026-01-01');

function base() {
  return {
    planId: 'plan-1',
    tenantId: T1, targetTenantId: T1, callerType: 'human' as const,
    sourceRecommendationId: REC, humanApprovalId: APPROVAL,
    auditTrailId: AUDIT, previousVersion: V1, proposedVersion: V2,
    previousWeights: WEIGHTS,
    proposedWeights: { historicalUsageWeight: 1.2 },
    weightMode: 'independent_multiplier' as const,
    applyToken: TOKEN, now: NOW,
  };
}

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- modelConfigApplyPlanService ---');

const plan = simulateModelConfigApplyPlan(base());
expect('_kind is model_config_apply_plan', plan._kind === 'model_config_apply_plan');
expect('executable is false', plan.executable === false);
expect('aiCanApply is false', plan.aiCanApply === false);
expect('requiresHumanApproval is true', plan.requiresHumanApproval === true);
expect('plan has diffHash', plan.diffHash.length === 64);
expect('plan has configBeforeHash', plan.configBeforeHash.length === 64);
expect('plan has configAfterHash', plan.configAfterHash.length === 64);
expect('configBefore !== configAfter', plan.configBeforeHash !== plan.configAfterHash);
expect('no blockedReasons', plan.blockedReasons.length === 0);
expect('weightMode propagated', plan.weightMode === 'independent_multiplier');

// Tenant mismatch → blocked
const planMismatch = simulateModelConfigApplyPlan({ ...base(), targetTenantId: T2 });
expect('tenant mismatch → blocked', planMismatch.blockedReasons.includes('CONFIG_APPLY_TENANT_MISMATCH'));
expect('tenant mismatch → executable still false', planMismatch.executable === false);
expect('tenant mismatch → aiCanApply still false', planMismatch.aiCanApply === false);

// AI caller → blocked
const planAI = simulateModelConfigApplyPlan({ ...base(), callerType: 'ai' });
expect('AI caller → CONFIG_APPLY_AI_CALLER_BLOCKED', planAI.blockedReasons.includes('CONFIG_APPLY_AI_CALLER_BLOCKED'));

// Missing humanApprovalId → blocked
const planNoApproval = simulateModelConfigApplyPlan({ ...base(), humanApprovalId: null });
expect('missing humanApprovalId → blocked', planNoApproval.blockedReasons.includes('CONFIG_APPLY_MISSING_HUMAN_APPROVAL_ID'));

// Missing auditTrailId → blocked
const planNoAudit = simulateModelConfigApplyPlan({ ...base(), auditTrailId: null });
expect('missing auditTrailId → blocked', planNoAudit.blockedReasons.includes('CONFIG_APPLY_MISSING_AUDIT_TRAIL_ID'));

// Missing applyToken → blocked
const planNoToken = simulateModelConfigApplyPlan({ ...base(), applyToken: null });
expect('missing applyToken → blocked', planNoToken.blockedReasons.includes('CONFIG_APPLY_MISSING_APPLY_TOKEN'));

// Deterministic: same input → same hashes
const plan2 = simulateModelConfigApplyPlan(base());
expect('deterministic: same diffHash', plan.diffHash === plan2.diffHash);
expect('deterministic: same configBeforeHash', plan.configBeforeHash === plan2.configBeforeHash);
expect('deterministic: same configAfterHash', plan.configAfterHash === plan2.configAfterHash);

// No real Firestore call — pure function
expect('simulateModelConfigApplyPlan returns synchronously (no I/O)', !(plan instanceof Promise));

if (fail === 0) console.log(`\nPASSED — modelConfigApplyPlanService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
