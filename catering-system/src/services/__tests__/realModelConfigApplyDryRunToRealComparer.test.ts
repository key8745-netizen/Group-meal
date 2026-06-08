/**
 * Feature 009 Phase 5B: Dry-Run-to-Real Comparer tests
 * Pure runner — no test framework. npx tsx from repo root.
 */
import { compareDryRunToReal } from '../realModelConfigApplyDryRunToRealComparer';
import type { WriteSetIntent } from '../realModelConfigApplyDryRunToRealComparer';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId, asModelConfigRecommendationId, asConfigVersion, asDiffHash, asApplyToken,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5B: Dry-Run-to-Real Comparer ===\n');

const base: WriteSetIntent = {
  _kind: 'f009_phase5b_write_set_intent',
  tenantId: 'tenant-5b' as TenantId,
  approvalId: asModelConfigApprovalId('approval-5b'),
  sourceRecommendationId: asModelConfigRecommendationId('rec-5b'),
  auditTrailId: 'audit-5b' as AuditTrailId,
  expectedCurrentVersion: asConfigVersion('v1'),
  configBeforeHash: asDiffHash('hash-before'),
  configAfterHash: asDiffHash('hash-after'),
  diffHash: asDiffHash('hash-diff'),
  applyToken: asApplyToken('token-5b'),
  payloadHash: asDiffHash('hash-payload'),
};

const real = { ...base };

console.log('[Exact match]\n');
const r1 = compareDryRunToReal(base, real);
expect('exact match passes', r1.matches === true);
expect('exact match → no blocked reasons', r1.blockedReasons.length === 0);
expect('exact match → no mismatched fields', r1.mismatchedFields.length === 0);

console.log('\n[Field-by-field mismatches]\n');

const cases: { field: keyof WriteSetIntent; override: unknown; reason: string }[] = [
  { field: 'tenantId', override: 'tenant-other' as unknown as TenantId, reason: 'F009_PHASE5B_DRYRUN_TENANT_MISMATCH' },
  { field: 'approvalId', override: asModelConfigApprovalId('approval-other'), reason: 'F009_PHASE5B_DRYRUN_APPROVAL_MISMATCH' },
  { field: 'sourceRecommendationId', override: asModelConfigRecommendationId('rec-other'), reason: 'F009_PHASE5B_DRYRUN_RECOMMENDATION_MISMATCH' },
  { field: 'auditTrailId', override: 'audit-other' as unknown as AuditTrailId, reason: 'F009_PHASE5B_DRYRUN_AUDIT_TRAIL_MISMATCH' },
  { field: 'expectedCurrentVersion', override: asConfigVersion('v2'), reason: 'F009_PHASE5B_DRYRUN_VERSION_MISMATCH' },
  { field: 'configBeforeHash', override: asDiffHash('different'), reason: 'F009_PHASE5B_DRYRUN_BEFORE_HASH_MISMATCH' },
  { field: 'configAfterHash', override: asDiffHash('different'), reason: 'F009_PHASE5B_DRYRUN_AFTER_HASH_MISMATCH' },
  { field: 'diffHash', override: asDiffHash('different'), reason: 'F009_PHASE5B_DRYRUN_DIFF_HASH_MISMATCH' },
  { field: 'applyToken', override: asApplyToken('different-token'), reason: 'F009_PHASE5B_DRYRUN_APPLY_TOKEN_MISMATCH' },
  { field: 'payloadHash', override: asDiffHash('different'), reason: 'F009_PHASE5B_DRYRUN_PAYLOAD_HASH_MISMATCH' },
];

for (const c of cases) {
  const dryRun = { ...base, [c.field]: c.override };
  const result = compareDryRunToReal(dryRun, real);
  expect(`${String(c.field)} mismatch BLOCKED`, result.blockedReasons.includes(c.reason as never));
  expect(`${String(c.field)} mismatch → not matching`, result.matches === false);
  expect(`${String(c.field)} mismatch → field listed`, result.mismatchedFields.includes(c.field as string));
}

console.log('\n[Missing inputs]\n');
const r2 = compareDryRunToReal(null, real);
expect('missing dry-run intent → blocked with all reasons', r2.blockedReasons.length === cases.length);
expect('missing dry-run intent → not matching', r2.matches === false);

const r3 = compareDryRunToReal(base, null);
expect('missing real intent → blocked with all reasons', r3.blockedReasons.length === cases.length);

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5B Dry-Run-to-Real Comparer (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
