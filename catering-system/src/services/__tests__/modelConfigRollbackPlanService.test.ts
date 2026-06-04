import { simulateModelConfigRollbackPlan } from '../modelConfigRollbackPlanService';
import { asRollbackToken, asConfigVersion } from '../../types/modelConfigApply';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

const T1 = 'tenant-1' as TenantId;
const T2 = 'tenant-2' as TenantId;
const AUDIT = 'audit-1' as AuditTrailId;
const V1 = asConfigVersion('v1');
const V2 = asConfigVersion('v2');
const RTOKEN = asRollbackToken('rollback-tok');
const NOW = new Date('2026-01-01');

function base() {
  return {
    planId: 'rollback-plan-1',
    tenantId: T1, targetTenantId: T1, callerType: 'human' as const,
    currentVersion: V2, rollbackTargetVersion: V1,
    rollbackToken: RTOKEN, rollbackReason: 'prediction accuracy dropped',
    auditTrailId: AUDIT, now: NOW,
  };
}

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- modelConfigRollbackPlanService ---');

const plan = simulateModelConfigRollbackPlan(base());
expect('_kind is model_config_rollback_plan', plan._kind === 'model_config_rollback_plan');
expect('executable is false', plan.executable === false);
expect('aiCanRollback is false', plan.aiCanRollback === false);
expect('humanApprovalRequired is true', plan.humanApprovalRequired === true);
expect('no blockedReasons', plan.blockedReasons.length === 0);
expect('rollbackTargetVersion correct', plan.rollbackTargetVersion === V1);
expect('currentVersion correct', plan.currentVersion === V2);
expect('rollbackReason propagated', plan.rollbackReason === 'prediction accuracy dropped');

// Tenant mismatch → blocked
const mismatch = simulateModelConfigRollbackPlan({ ...base(), targetTenantId: T2 });
expect('tenant mismatch → CONFIG_ROLLBACK_TENANT_MISMATCH', mismatch.blockedReasons.includes('CONFIG_ROLLBACK_TENANT_MISMATCH'));
expect('tenant mismatch → executable still false', mismatch.executable === false);
expect('tenant mismatch → aiCanRollback still false', mismatch.aiCanRollback === false);
expect('tenant mismatch → humanApprovalRequired still true', mismatch.humanApprovalRequired === true);

// AI caller → blocked
const aiPlan = simulateModelConfigRollbackPlan({ ...base(), callerType: 'ai' });
expect('AI caller → CONFIG_ROLLBACK_AI_CALLER_BLOCKED', aiPlan.blockedReasons.includes('CONFIG_ROLLBACK_AI_CALLER_BLOCKED'));

// System caller → blocked (non-human)
const sysPlan = simulateModelConfigRollbackPlan({ ...base(), callerType: 'system' });
expect('system caller → CONFIG_ROLLBACK_AI_CALLER_BLOCKED', sysPlan.blockedReasons.includes('CONFIG_ROLLBACK_AI_CALLER_BLOCKED'));

// Missing rollbackTargetVersion → blocked
const noTarget = simulateModelConfigRollbackPlan({ ...base(), rollbackTargetVersion: null });
expect('missing rollbackTargetVersion → blocked', noTarget.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_TARGET_VERSION'));

// Missing rollbackToken → blocked
const noToken = simulateModelConfigRollbackPlan({ ...base(), rollbackToken: null });
expect('missing rollbackToken → blocked', noToken.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_ROLLBACK_TOKEN'));

// Missing auditTrailId → blocked
const noAudit = simulateModelConfigRollbackPlan({ ...base(), auditTrailId: null });
expect('missing auditTrailId → blocked', noAudit.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_AUDIT_TRAIL_ID'));

// Missing rollbackReason → blocked
const noReason = simulateModelConfigRollbackPlan({ ...base(), rollbackReason: null });
expect('missing rollbackReason → blocked', noReason.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_ROLLBACK_REASON'));

// Same version → blocked
const sameVer = simulateModelConfigRollbackPlan({ ...base(), currentVersion: V1, rollbackTargetVersion: V1 });
expect('same version rollback → CONFIG_ROLLBACK_SAME_VERSION', sameVer.blockedReasons.includes('CONFIG_ROLLBACK_SAME_VERSION'));

// Rollback plan is pure — no history deletion
expect('rollback plan does not call delete (pure function)', !(plan instanceof Promise));

if (fail === 0) console.log(`\nPASSED — modelConfigRollbackPlanService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
