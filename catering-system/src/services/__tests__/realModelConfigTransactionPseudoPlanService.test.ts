/**
 * Feature 007 Phase 1 + Phase 2: Transaction Pseudo-plan tests
 * Phase 2 adds: hash continuity validation, currentConfigObject check,
 * audit hash consistency cross-validation.
 */
import {
  buildRealModelConfigApplyTransactionPseudoPlan,
  validateAuditHashContinuity,
} from '../realModelConfigTransactionPseudoPlanService';
import { validateCanonicalModelConfigHashInput } from '../realModelConfigCanonicalizationService';
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

console.log('\n=== Feature 007 Phase 1+2: Transaction Pseudo-plan ===\n');

const tenantId = 'tenant-007' as TenantId;
const auditTrailId = 'audit-007' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-007');
const recId = asModelConfigRecommendationId('rec-007');
const applyToken = asApplyToken('token-007');
const applyToken2 = asApplyToken('token-008');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const hashA = asDiffHash('hash-a');
const hashB = asDiffHash('hash-b');
const hashD = asDiffHash('hash-d');
const now = new Date('2026-06-04T12:00:00.000Z');

const guardResult = { allowed: true, blockedReasons: [] };

// Compute real canonical hash for a config object (Phase 2 consistency test)
const sampleConfig = { weights: { a: 1.0, b: 2.0 }, mode: 'normalized' };
const canonicalResult = validateCanonicalModelConfigHashInput(sampleConfig);
const realHash = canonicalResult.canonicalized!.inputHash;

// ─── Phase 1 core plan invariants ───────────────────────────────────────────

const r1 = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashA, configAfterHash: hashB, diffHash: hashD,
  guardResult, now,
});

expect('plan builds without error', r1.blocked === false);
expect('plan not blocked', r1.blocked === false);
expect('plan blockedReasons empty', r1.blockedReasons.length === 0);
expect('plan non-null', r1.plan !== null);

const plan = r1.plan!;

// Hard invariants
expect('plan _kind correct', plan._kind === 'real_model_config_apply_pseudo_plan');
expect('plan executable=false', plan.executable === false);
expect('plan aiCanExecute=false', plan.aiCanExecute === false);
expect('plan dryRunOnly=true', plan.dryRunOnly === true);

// Non-executable guards
expect('plan containsRunTransaction=false', plan.containsRunTransaction === false);
expect('plan containsWriteFunction=false', plan.containsWriteFunction === false);
expect('plan containsDeleteFunction=false', plan.containsDeleteFunction === false);
expect('plan containsFirestoreReference=false', plan.containsFirestoreReference === false);

// Identity fields
expect('plan tenantId set', (plan.tenantId as string) === (tenantId as string));
expect('plan approvalId set', (plan.approvalId as string) === (approvalId as string));
expect('plan auditTrailId set', (plan.auditTrailId as string) === (auditTrailId as string));
expect('plan expectedCurrentVersion set', (plan.expectedCurrentVersion as string) === (v1 as string));
expect('plan newVersion set', (plan.newVersion as string) === (v2 as string));
expect('plan applyToken set', (plan.applyToken as string) === (applyToken as string));

// Plan steps present
expect('guardPlan present', !!plan.guardPlan);
expect('approvalValidationPlan present', !!plan.approvalValidationPlan);
expect('settingsReadPlan present', !!plan.settingsReadPlan);
expect('idempotencyLockPlan present', !!plan.idempotencyLockPlan);
expect('settingsHistoryWritePlan present', !!plan.settingsHistoryWritePlan);
expect('settingsUpdatePlan present', !!plan.settingsUpdatePlan);
expect('auditEventPlan present', !!plan.auditEventPlan);

// All steps executable=false
expect('guardPlan executable=false', plan.guardPlan.executable === false);
expect('idempotencyLockPlan executable=false', plan.idempotencyLockPlan.executable === false);
expect('settingsHistoryWritePlan executable=false', plan.settingsHistoryWritePlan.executable === false);
expect('settingsUpdatePlan executable=false', plan.settingsUpdatePlan.executable === false);
expect('auditEventPlan executable=false', plan.auditEventPlan.executable === false);

// Step order
expect('guardPlan step=1', plan.guardPlan.step === 1);
expect('approvalValidationPlan step=2', plan.approvalValidationPlan.step === 2);
expect('settingsReadPlan step=3', plan.settingsReadPlan.step === 3);
expect('idempotencyLockPlan step=4', plan.idempotencyLockPlan.step === 4);
expect('settingsHistoryWritePlan step=5', plan.settingsHistoryWritePlan.step === 5);
expect('settingsUpdatePlan step=6', plan.settingsUpdatePlan.step === 6);
expect('auditEventPlan step=7', plan.auditEventPlan.step === 7);

// Plan JSON-serializable (no function/callback in values)
const planStr = JSON.stringify(plan);
expect('plan JSON serializable', planStr.length > 0);
expect('plan JSON no "function"', !planStr.includes('"function"'));
expect('generatedAt set', plan.generatedAt.getTime() === now.getTime());

// ─── Phase 2: Hash continuity validation ─────────────────────────────────────

console.log('\n[Phase 2: Hash continuity]\n');

// Missing configBeforeHash → blocked
const r2 = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: asDiffHash(''), configAfterHash: hashB, diffHash: hashD,
  guardResult, now,
});
expect('missing configBeforeHash → blocked', r2.blocked === true);
expect('missing configBeforeHash → REAL_EXEC_CONFIG_BEFORE_HASH_MISSING', r2.blockedReasons.includes('REAL_EXEC_CONFIG_BEFORE_HASH_MISSING'));
expect('missing configBeforeHash → plan=null', r2.plan === null);

// Missing configAfterHash → blocked
const r3 = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashA, configAfterHash: asDiffHash(''), diffHash: hashD,
  guardResult, now,
});
expect('missing configAfterHash → REAL_EXEC_CONFIG_AFTER_HASH_MISSING', r3.blockedReasons.includes('REAL_EXEC_CONFIG_AFTER_HASH_MISSING'));

// Missing diffHash → blocked
const r4 = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashA, configAfterHash: hashB, diffHash: asDiffHash(''),
  guardResult, now,
});
expect('missing diffHash → REAL_EXEC_DIFF_HASH_MISSING', r4.blockedReasons.includes('REAL_EXEC_DIFF_HASH_MISSING'));

// currentConfigObject canonical hash === configBeforeHash → passes
const r5 = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: realHash, configAfterHash: hashB, diffHash: hashD,
  currentConfigObject: sampleConfig,
  guardResult, now,
});
expect('correct currentConfigObject hash → not blocked', r5.blocked === false);
expect('correct currentConfigObject hash → plan built', r5.plan !== null);

// currentConfigObject canonical hash mismatch → blocked
const r6 = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: asDiffHash('wrong-hash'), configAfterHash: hashB, diffHash: hashD,
  currentConfigObject: sampleConfig,
  guardResult, now,
});
expect('currentConfigObject hash mismatch → blocked', r6.blocked === true);
expect('currentConfigObject hash mismatch → REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH', r6.blockedReasons.includes('REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH'));

// currentConfigObject with BigInt → canonicalization blocked
const r7 = buildRealModelConfigApplyTransactionPseudoPlan({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  applyToken, expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashA, configAfterHash: hashB, diffHash: hashD,
  currentConfigObject: { n: BigInt(42) },
  guardResult, now,
});
expect('BigInt in currentConfigObject → blocked', r7.blocked === true);
expect('BigInt → REAL_EXEC_CANONICAL_BIGINT_BLOCKED', r7.blockedReasons.includes('REAL_EXEC_CANONICAL_BIGINT_BLOCKED'));

// ─── Phase 2: Audit hash continuity cross-validation ─────────────────────────

console.log('\n[Phase 2: Audit hash continuity]\n');

const auditBase = {
  planConfigBeforeHash: hashA,
  planConfigAfterHash: hashB,
  planDiffHash: hashD,
  planApplyToken: applyToken,
  planAuditTrailId: auditTrailId,
  planApprovalId: approvalId,
  planSourceRecommendationId: recId,
  auditConfigBeforeHash: hashA,
  auditConfigAfterHash: hashB,
  auditDiffHash: hashD,
  auditApplyToken: applyToken,
  auditAuditTrailId: auditTrailId,
  auditApprovalId: approvalId,
  auditSourceRecommendationId: recId,
};

// Valid continuity
const h1 = validateAuditHashContinuity(auditBase);
expect('valid hash continuity → valid=true', h1.valid === true);
expect('valid hash continuity → 0 blockedReasons', h1.blockedReasons.length === 0);

// configBeforeHash mismatch
const h2 = validateAuditHashContinuity({ ...auditBase, auditConfigBeforeHash: asDiffHash('wrong') });
expect('configBeforeHash mismatch → REAL_EXEC_HASH_CONTINUITY_BROKEN', h2.blockedReasons.includes('REAL_EXEC_HASH_CONTINUITY_BROKEN'));

// configAfterHash mismatch
const h3 = validateAuditHashContinuity({ ...auditBase, auditConfigAfterHash: asDiffHash('wrong') });
expect('configAfterHash mismatch → REAL_EXEC_AUDIT_HASH_MISMATCH', h3.blockedReasons.includes('REAL_EXEC_AUDIT_HASH_MISMATCH'));

// diffHash mismatch
const h4 = validateAuditHashContinuity({ ...auditBase, auditDiffHash: asDiffHash('wrong') });
expect('diffHash mismatch → REAL_EXEC_AUDIT_HASH_MISMATCH', h4.blockedReasons.includes('REAL_EXEC_AUDIT_HASH_MISMATCH'));

// applyToken mismatch
const h5 = validateAuditHashContinuity({ ...auditBase, auditApplyToken: applyToken2 });
expect('applyToken mismatch → REAL_EXEC_AUDIT_TOKEN_MISMATCH', h5.blockedReasons.includes('REAL_EXEC_AUDIT_TOKEN_MISMATCH'));

// auditTrailId mismatch
const h6 = validateAuditHashContinuity({ ...auditBase, auditAuditTrailId: 'other-trail' as AuditTrailId });
expect('auditTrailId mismatch → REAL_EXEC_AUDIT_TRAIL_ID_MISMATCH', h6.blockedReasons.includes('REAL_EXEC_AUDIT_TRAIL_ID_MISMATCH'));

// approvalId mismatch
const h7 = validateAuditHashContinuity({ ...auditBase, auditApprovalId: asModelConfigApprovalId('other-approval') });
expect('approvalId mismatch → REAL_EXEC_AUDIT_APPROVAL_ID_MISMATCH', h7.blockedReasons.includes('REAL_EXEC_AUDIT_APPROVAL_ID_MISMATCH'));

// sourceRecommendationId mismatch
const h8 = validateAuditHashContinuity({ ...auditBase, auditSourceRecommendationId: asModelConfigRecommendationId('other-rec') });
expect('sourceRecommendationId mismatch → REAL_EXEC_AUDIT_SOURCE_REC_MISMATCH', h8.blockedReasons.includes('REAL_EXEC_AUDIT_SOURCE_REC_MISMATCH'));

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1+2 Pseudo-plan (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
