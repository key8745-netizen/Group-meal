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
  detectConcurrentModification,
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

// ─── Phase 4: Deep nested hash propagation ───────────────────────────────────

console.log('\n[Phase 4: Deep nested hash propagation]\n');

// Deep nested config — hash computed and propagated end-to-end
const deepConfig = {
  level1: {
    level2: {
      level3: {
        level4: {
          weights: [1.5, 2.0, 0.75],
          metadata: { locale: 'zh-TW', tags: ['生產', 'config'], active: true },
        },
      },
    },
  },
  scalars: { count: 42, ratio: 0.333, label: 'normalized', enabled: false, spare: null },
  unicode: { zh: '團膳管理系統', emoji: '🍜🍱', special: '\n\t\r\\' },
};

const deepResult = validateCanonicalModelConfigHashInput(deepConfig);
expect('deep nested config → canonicalization valid', deepResult.valid === true);
const deepHash = deepResult.canonicalized!.inputHash;

// Propagate deep hash through full chain
const deepApproval = { ...baseApproval, configBeforeHash: deepHash };
const deepPlan = { ...basePlan, configBeforeHash: deepHash };
const deepAudit = { ...baseAudit, configBeforeHash: deepHash };

const p1 = validateFullChainHashPropagation({ approval: deepApproval, plan: deepPlan, auditEvent: deepAudit });
expect('deep nested hash end-to-end → valid', p1.valid === true);

// Modify one deep value → different hash
const deepConfigModified = { ...deepConfig, scalars: { ...deepConfig.scalars, count: 43 } };
const deepResultModified = validateCanonicalModelConfigHashInput(deepConfigModified);
expect('modified deep config → different hash', deepResult.canonicalized !== null && deepResultModified.canonicalized !== null && (deepResult.canonicalized.inputHash as string) !== (deepResultModified.canonicalized.inputHash as string));

// Tampered hash at plan level → blocked
const p2 = validateFullChainHashPropagation({
  approval: deepApproval,
  plan: { ...deepPlan, configBeforeHash: asDiffHash('tampered') },
  auditEvent: deepAudit,
});
expect('deep nested tampered plan hash → blocked', p2.valid === false);

// Key reorder in deep config → same hash (deterministic)
const deepReordered = {
  scalars: { spare: null, enabled: false, label: 'normalized', ratio: 0.333, count: 42 },
  unicode: { special: '\n\t\r\\', zh: '團膳管理系統', emoji: '🍜🍱' },
  level1: deepConfig.level1,
};
const deepReorderedResult = validateCanonicalModelConfigHashInput(deepReordered);
expect('deep nested key reorder → same hash', deepResult.canonicalized !== null && deepReorderedResult.canonicalized !== null && (deepResult.canonicalized.inputHash as string) === (deepReorderedResult.canonicalized.inputHash as string));

// Mixed scalar types deterministic through chain
const mixedConfig = { n: 0, b: false, s: '', arr: [], obj: {} };
const mixedA = validateCanonicalModelConfigHashInput(mixedConfig);
const mixedB = validateCanonicalModelConfigHashInput({ b: false, n: 0, s: '', arr: [], obj: {} });
expect('mixed scalars → deterministic', mixedA.canonicalized !== null && mixedB.canonicalized !== null && (mixedA.canonicalized.inputHash as string) === (mixedB.canonicalized.inputHash as string));

// ─── Phase 4: Concurrent modification simulation ──────────────────────────────

console.log('\n[Phase 4: Concurrent modification simulation]\n');

const oldConfigHash = asDiffHash('old-config-hash');
const newConfigHash = asDiffHash('new-config-hash'); // concurrent write changed the config

// approval was based on old config; current shows new config → BLOCKED
const cm1 = detectConcurrentModification({
  approvalConfigBeforeHash: oldConfigHash,
  currentConfigHash: newConfigHash,
  expectedCurrentVersion: 'v1',
  observedCurrentVersion: 'v1',
});
expect('config hash mismatch → safe=false', cm1.safe === false);
expect('config hash mismatch → REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH', cm1.blockedReasons.includes('REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH'));
expect('config hash mismatch → REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED', cm1.blockedReasons.includes('REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED'));

// no modification — same hash and same version → safe
const cm2 = detectConcurrentModification({
  approvalConfigBeforeHash: oldConfigHash,
  currentConfigHash: oldConfigHash,
  expectedCurrentVersion: 'v1',
  observedCurrentVersion: 'v1',
});
expect('no modification → safe=true', cm2.safe === true);
expect('no modification → 0 reasons', cm2.blockedReasons.length === 0);

// version mismatch only (hash same, version bumped by concurrent update) → BLOCKED
const cm3 = detectConcurrentModification({
  approvalConfigBeforeHash: oldConfigHash,
  currentConfigHash: oldConfigHash,
  expectedCurrentVersion: 'v1',
  observedCurrentVersion: 'v2',
});
expect('version mismatch → REAL_EXEC_CURRENT_CONFIG_VERSION_MISMATCH', cm3.blockedReasons.includes('REAL_EXEC_CURRENT_CONFIG_VERSION_MISMATCH'));
expect('version mismatch → REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED', cm3.blockedReasons.includes('REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED'));
expect('version mismatch → safe=false', cm3.safe === false);

// both hash and version mismatch → multiple reasons
const cm4 = detectConcurrentModification({
  approvalConfigBeforeHash: oldConfigHash,
  currentConfigHash: newConfigHash,
  expectedCurrentVersion: 'v1',
  observedCurrentVersion: 'v3',
});
expect('hash + version mismatch → multiple blocked reasons', cm4.blockedReasons.length >= 3);

// concurrent modification → no executable pseudo-plan should be produced
// (simulated: if detectConcurrentModification returns safe=false, plan should not proceed)
expect('concurrent mod safe=false → plan must not execute', cm1.safe === false);

// auditEventPlan receives blocked reason (simulated by chain continuity with blocked hash)
const blockedChain = validateFullChainHashPropagation({
  approval: { ...baseApproval, configBeforeHash: oldConfigHash },
  plan: { ...basePlan, configBeforeHash: newConfigHash }, // concurrent change in plan
  auditEvent: { ...baseAudit, configBeforeHash: newConfigHash },
});
expect('concurrent mod in chain → approval before hash mismatch', blockedChain.blockedReasons.includes('REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH'));
expect('concurrent mod in chain → valid=false', blockedChain.valid === false);

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 3+4 Full-chain Hash Propagation (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
