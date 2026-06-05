/**
 * Feature 007 Phase 3: Full-chain Hash Propagation tests
 *
 * Validates that approval → canonicalization → pseudoPlan → auditEventPlan
 * hash fields are fully consistent end-to-end.
 */
import {
  validateFullChainHashPropagation,
  validateApprovalToPlanHash,
  validatePlanToAuditEventHash,
} from '../realModelConfigApplyChainHashService';
import { validateCanonicalModelConfigHashInput } from '../realModelConfigCanonicalizationService';
import type { AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asDiffHash,
  asApplyToken,
  asModelConfigRecommendationId,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 007 Phase 3: Full-chain Hash Propagation ===\n');

const approvalId = asModelConfigApprovalId('approval-007');
const recId = asModelConfigRecommendationId('rec-007');
const auditTrailId = 'audit-007' as AuditTrailId;
const applyToken = asApplyToken('token-007');
const applyToken2 = asApplyToken('token-008');
const hashA = asDiffHash('hash-a');
const hashB = asDiffHash('hash-b');
const hashD = asDiffHash('hash-d');

const baseApproval = {
  approvalId,
  sourceRecommendationId: recId,
  configBeforeHash: hashA,
  configAfterHash: hashB,
  diffHash: hashD,
  applyToken,
  auditTrailId,
};

const basePlan = {
  configBeforeHash: hashA,
  configAfterHash: hashB,
  diffHash: hashD,
  applyToken,
  auditTrailId,
};

const baseAudit = {
  configBeforeHash: hashA,
  configAfterHash: hashB,
  diffHash: hashD,
  applyToken,
  auditTrailId,
};

// ─── Full-chain: valid end-to-end ────────────────────────────────────────────

console.log('[Full-chain: valid]\n');

const c1 = validateFullChainHashPropagation({ approval: baseApproval, plan: basePlan, auditEvent: baseAudit });
expect('valid full chain → valid=true', c1.valid === true);
expect('valid full chain → 0 blockedReasons', c1.blockedReasons.length === 0);

// ─── Approval → Plan mismatches ──────────────────────────────────────────────

console.log('\n[Approval → Plan mismatches]\n');

const c2 = validateFullChainHashPropagation({
  approval: { ...baseApproval, configBeforeHash: asDiffHash('wrong') },
  plan: basePlan, auditEvent: baseAudit,
});
expect('approval configBeforeHash mismatch → REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH', c2.blockedReasons.includes('REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH'));
expect('approval configBeforeHash mismatch → valid=false', c2.valid === false);

const c3 = validateFullChainHashPropagation({
  approval: { ...baseApproval, configAfterHash: asDiffHash('wrong') },
  plan: basePlan, auditEvent: baseAudit,
});
expect('approval configAfterHash mismatch → REAL_EXEC_APPROVAL_AFTER_HASH_MISMATCH', c3.blockedReasons.includes('REAL_EXEC_APPROVAL_AFTER_HASH_MISMATCH'));

const c4 = validateFullChainHashPropagation({
  approval: { ...baseApproval, diffHash: asDiffHash('wrong') },
  plan: basePlan, auditEvent: baseAudit,
});
expect('approval diffHash mismatch → REAL_EXEC_APPROVAL_DIFF_HASH_MISMATCH', c4.blockedReasons.includes('REAL_EXEC_APPROVAL_DIFF_HASH_MISMATCH'));

const c5 = validateFullChainHashPropagation({
  approval: { ...baseApproval, applyToken: applyToken2 },
  plan: basePlan, auditEvent: baseAudit,
});
expect('approval applyToken mismatch → REAL_EXEC_APPROVAL_APPLY_TOKEN_MISMATCH', c5.blockedReasons.includes('REAL_EXEC_APPROVAL_APPLY_TOKEN_MISMATCH'));

const c6 = validateFullChainHashPropagation({
  approval: { ...baseApproval, auditTrailId: 'other-trail' as AuditTrailId },
  plan: basePlan, auditEvent: baseAudit,
});
expect('approval auditTrailId mismatch → REAL_EXEC_APPROVAL_AUDIT_TRAIL_MISMATCH', c6.blockedReasons.includes('REAL_EXEC_APPROVAL_AUDIT_TRAIL_MISMATCH'));

// ─── Plan → AuditEvent mismatches ────────────────────────────────────────────

console.log('\n[Plan → AuditEvent mismatches]\n');

const c7 = validateFullChainHashPropagation({
  approval: baseApproval, plan: basePlan,
  auditEvent: { ...baseAudit, configBeforeHash: asDiffHash('wrong') },
});
expect('audit configBeforeHash mismatch → REAL_EXEC_CHAIN_AUDIT_BEFORE_HASH_MISMATCH', c7.blockedReasons.includes('REAL_EXEC_CHAIN_AUDIT_BEFORE_HASH_MISMATCH'));

const c8 = validateFullChainHashPropagation({
  approval: baseApproval, plan: basePlan,
  auditEvent: { ...baseAudit, configAfterHash: asDiffHash('wrong') },
});
expect('audit configAfterHash mismatch → REAL_EXEC_CHAIN_AUDIT_AFTER_HASH_MISMATCH', c8.blockedReasons.includes('REAL_EXEC_CHAIN_AUDIT_AFTER_HASH_MISMATCH'));

const c9 = validateFullChainHashPropagation({
  approval: baseApproval, plan: basePlan,
  auditEvent: { ...baseAudit, diffHash: asDiffHash('wrong') },
});
expect('audit diffHash mismatch → REAL_EXEC_CHAIN_AUDIT_DIFF_HASH_MISMATCH', c9.blockedReasons.includes('REAL_EXEC_CHAIN_AUDIT_DIFF_HASH_MISMATCH'));

const c10 = validateFullChainHashPropagation({
  approval: baseApproval, plan: basePlan,
  auditEvent: { ...baseAudit, applyToken: applyToken2 },
});
expect('audit applyToken mismatch → REAL_EXEC_CHAIN_AUDIT_APPLY_TOKEN_MISMATCH', c10.blockedReasons.includes('REAL_EXEC_CHAIN_AUDIT_APPLY_TOKEN_MISMATCH'));

const c11 = validateFullChainHashPropagation({
  approval: baseApproval, plan: basePlan,
  auditEvent: { ...baseAudit, auditTrailId: 'other-trail' as AuditTrailId },
});
expect('audit auditTrailId mismatch → REAL_EXEC_CHAIN_AUDIT_TRAIL_MISMATCH', c11.blockedReasons.includes('REAL_EXEC_CHAIN_AUDIT_TRAIL_MISMATCH'));

// ─── Segment helpers ─────────────────────────────────────────────────────────

console.log('\n[Segment helpers]\n');

const c12 = validateApprovalToPlanHash(baseApproval, basePlan);
expect('validateApprovalToPlanHash valid → valid=true', c12.valid === true);

const c13 = validateApprovalToPlanHash(
  { ...baseApproval, configBeforeHash: asDiffHash('mismatch') },
  basePlan,
);
expect('validateApprovalToPlanHash mismatch → invalid', c13.valid === false);
expect('validateApprovalToPlanHash mismatch → APPROVAL_BEFORE_HASH_MISMATCH', c13.blockedReasons.includes('REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH'));

const c14 = validatePlanToAuditEventHash(basePlan, baseAudit);
expect('validatePlanToAuditEventHash valid → valid=true', c14.valid === true);

const c15 = validatePlanToAuditEventHash(basePlan, { ...baseAudit, diffHash: asDiffHash('mismatch') });
expect('validatePlanToAuditEventHash mismatch → invalid', c15.valid === false);
expect('validatePlanToAuditEventHash mismatch → CHAIN_AUDIT_DIFF_HASH_MISMATCH', c15.blockedReasons.includes('REAL_EXEC_CHAIN_AUDIT_DIFF_HASH_MISMATCH'));

// ─── Canonicalization → approval chain continuity ────────────────────────────

console.log('\n[Canonicalization → approval chain]\n');

const sampleConfig = { weights: { a: 1.0, b: 2.0 }, mode: 'normalized' };
const canonResult = validateCanonicalModelConfigHashInput(sampleConfig);
const realHash = canonResult.canonicalized!.inputHash;

// canonical hash flows correctly into approval → plan → audit
const chainApproval = { ...baseApproval, configBeforeHash: realHash };
const chainPlan = { ...basePlan, configBeforeHash: realHash };
const chainAudit = { ...baseAudit, configBeforeHash: realHash };

const c16 = validateFullChainHashPropagation({ approval: chainApproval, plan: chainPlan, auditEvent: chainAudit });
expect('real canonical hash propagated end-to-end → valid', c16.valid === true);

// tampered configBeforeHash at plan level breaks chain
const c17 = validateFullChainHashPropagation({
  approval: chainApproval,
  plan: { ...chainPlan, configBeforeHash: asDiffHash('tampered') },
  auditEvent: chainAudit,
});
expect('tampered plan configBeforeHash → APPROVAL_BEFORE_HASH_MISMATCH', c17.blockedReasons.includes('REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH'));
expect('tampered plan configBeforeHash → CHAIN_AUDIT_BEFORE_HASH_MISMATCH', c17.blockedReasons.includes('REAL_EXEC_CHAIN_AUDIT_BEFORE_HASH_MISMATCH'));

// multiple mismatches accumulate
const c18 = validateFullChainHashPropagation({
  approval: { ...baseApproval, configBeforeHash: asDiffHash('x'), configAfterHash: asDiffHash('y') },
  plan: basePlan,
  auditEvent: baseAudit,
});
expect('multiple approval mismatches → multiple reasons', c18.blockedReasons.length >= 2);

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 3 Full-chain Hash Propagation (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
