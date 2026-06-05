/**
 * Feature 007 Phase 1: Transaction Pseudo-plan tests
 */
import { buildRealModelConfigApplyTransactionPseudoPlan } from '../realModelConfigTransactionPseudoPlanService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asConfigVersion,
  asDiffHash,
  asApplyToken,
  asModelConfigRecommendationId,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 007 Phase 1: Transaction Pseudo-plan ===\n');

const tenantId = 'tenant-007' as TenantId;
const auditTrailId = 'audit-007' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-007');
const recId = asModelConfigRecommendationId('rec-007');
const applyToken = asApplyToken('token-007');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const hashA = asDiffHash('hash-a');
const hashB = asDiffHash('hash-b');
const hashD = asDiffHash('hash-d');
const now = new Date('2026-06-04T12:00:00.000Z');

const guardResult = { allowed: true, blockedReasons: [] };

const plan = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashA, configAfterHash: hashB, diffHash: hashD,
  guardResult, now,
});

// 1. Hard invariants
expect('plan _kind correct', plan._kind === 'real_model_config_apply_pseudo_plan');
expect('plan executable=false', plan.executable === false);
expect('plan aiCanExecute=false', plan.aiCanExecute === false);
expect('plan dryRunOnly=true', plan.dryRunOnly === true);

// 2. Non-executable guards
expect('plan containsRunTransaction=false', plan.containsRunTransaction === false);
expect('plan containsWriteFunction=false', plan.containsWriteFunction === false);
expect('plan containsDeleteFunction=false', plan.containsDeleteFunction === false);
expect('plan containsFirestoreReference=false', plan.containsFirestoreReference === false);

// 3. Identity fields
expect('plan tenantId set', (plan.tenantId as string) === (tenantId as string));
expect('plan approvalId set', (plan.approvalId as string) === (approvalId as string));
expect('plan auditTrailId set', (plan.auditTrailId as string) === (auditTrailId as string));
expect('plan expectedCurrentVersion set', (plan.expectedCurrentVersion as string) === (v1 as string));
expect('plan newVersion set', (plan.newVersion as string) === (v2 as string));
expect('plan applyToken set', (plan.applyToken as string) === (applyToken as string));

// 4. All plan steps present
expect('plan guardPlan present', !!plan.guardPlan);
expect('plan approvalValidationPlan present', !!plan.approvalValidationPlan);
expect('plan settingsReadPlan present', !!plan.settingsReadPlan);
expect('plan idempotencyLockPlan present', !!plan.idempotencyLockPlan);
expect('plan settingsHistoryWritePlan present', !!plan.settingsHistoryWritePlan);
expect('plan settingsUpdatePlan present', !!plan.settingsUpdatePlan);
expect('plan auditEventPlan present', !!plan.auditEventPlan);

// 5. Plan steps are executable=false
expect('guardPlan step executable=false', plan.guardPlan.executable === false);
expect('idempotencyLockPlan step executable=false', plan.idempotencyLockPlan.executable === false);
expect('settingsHistoryWritePlan step executable=false', plan.settingsHistoryWritePlan.executable === false);
expect('settingsUpdatePlan step executable=false', plan.settingsUpdatePlan.executable === false);
expect('auditEventPlan step executable=false', plan.auditEventPlan.executable === false);

// 6. Plan steps are descriptive (no function / callback in values)
const planStr = JSON.stringify(plan);
expect('plan JSON contains no "function"', !planStr.includes('"function"'));
expect('plan JSON serializable', planStr.length > 0);

// 7. Steps in correct order
expect('guardPlan step=1', plan.guardPlan.step === 1);
expect('approvalValidationPlan step=2', plan.approvalValidationPlan.step === 2);
expect('settingsReadPlan step=3', plan.settingsReadPlan.step === 3);
expect('idempotencyLockPlan step=4', plan.idempotencyLockPlan.step === 4);
expect('settingsHistoryWritePlan step=5', plan.settingsHistoryWritePlan.step === 5);
expect('settingsUpdatePlan step=6', plan.settingsUpdatePlan.step === 6);
expect('auditEventPlan step=7', plan.auditEventPlan.step === 7);

// 8. generatedAt set
expect('plan generatedAt set', plan.generatedAt.getTime() === now.getTime());

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1 Pseudo-plan (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
