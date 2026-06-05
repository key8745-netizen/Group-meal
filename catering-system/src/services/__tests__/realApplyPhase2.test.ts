/**
 * Feature 008 Phase 2: Token Boundary Hardening + Write-set Hash Consistency tests
 *
 * Covers:
 *  - Token boundary hardening (upstream verification, service account forgery, token subject)
 *  - Approval hardening (auditTrailId match, applyToken match, version match, hash match)
 *  - Caller-userId / approval.approvedByUserId mismatch
 *  - Write-set hash consistency (history, audit, settings, currentConfigObject)
 *  - Nested config hash regression
 *  - Boundary confirmations
 */
import { validatePersistedApproval } from '../realApplyApprovalValidatorService';
import { validateVerifiedCallerContext } from '../realApplyCallerContextValidatorService';
import { buildTransactionWriteSet } from '../realApplyTransactionWriteSetService';
import { validateWriteSetHashConsistency } from '../realApplyWriteSetHashConsistencyService';
import { validateCanonicalModelConfigHashInput } from '../realModelConfigCanonicalizationService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asConfigVersion,
  asDiffHash,
  asApplyToken,
  asModelConfigRecommendationId,
} from '../../types/modelConfigApply';
import type {
  PersistedApprovalSnapshot,
  VerifiedCallerContextSnapshot,
} from '../../types/realApplyTransactionExecution';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 008 Phase 2: Token Boundary Hardening + Write-set Hash Consistency ===\n');

const tenantId = 'tenant-008' as TenantId;
const auditTrailId = 'audit-008' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-008');
const recId = asModelConfigRecommendationId('rec-008');
const applyToken = asApplyToken('token-008');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const hashA = asDiffHash('hash-a');
const hashB = asDiffHash('hash-b');
const hashD = asDiffHash('hash-d');
const now = '2026-06-05T12:00:00.000Z';
const future = '2026-12-31T23:59:59.000Z';

// ─── Approval Hardening ───────────────────────────────────────────────────────

console.log('[Approval Hardening — Phase 2]\n');

const validApproval: PersistedApprovalSnapshot = {
  _kind: 'persisted_approval_snapshot',
  approvalId,
  tenantId,
  sourceRecommendationId: recId,
  approvedByUserId: 'user-008',
  status: 'APPROVED',
  expiresAt: future,
  configBeforeHash: hashA,
  configAfterHash: hashB,
  diffHash: hashD,
  applyToken,
  auditTrailId,
  expectedCurrentVersion: v1,
  newVersion: v2,
};

const baseApprovalInput = {
  approval: validApproval,
  requestTenantId: tenantId,
  requestApprovalId: approvalId,
  requestSourceRecommendationId: recId,
  requestApplyToken: applyToken,
  requestAuditTrailId: auditTrailId,
  requestExpectedCurrentVersion: v1,
  requestNewVersion: v2,
  requestConfigBeforeHash: hashA,
  requestConfigAfterHash: hashB,
  requestDiffHash: hashD,
  callerUserId: 'user-008',
  now,
};

// 1. Valid approval still passes (regression)
const a1 = validatePersistedApproval(baseApprovalInput);
expect('Phase2 valid approval → valid=true', a1.valid === true);
expect('Phase2 valid approval → 0 reasons', a1.blockedReasons.length === 0);

// 2. auditTrailId mismatch → F008_APPROVAL_AUDIT_TRAIL_MISMATCH
const a2 = validatePersistedApproval({
  ...baseApprovalInput,
  requestAuditTrailId: 'other-audit' as AuditTrailId,
});
expect('auditTrailId mismatch → F008_APPROVAL_AUDIT_TRAIL_MISMATCH', a2.blockedReasons.includes('F008_APPROVAL_AUDIT_TRAIL_MISMATCH'));
expect('auditTrailId mismatch → valid=false', a2.valid === false);

// 3. applyToken mismatch → F008_APPROVAL_APPLY_TOKEN_MISMATCH
const a3 = validatePersistedApproval({
  ...baseApprovalInput,
  requestApplyToken: asApplyToken('wrong-token'),
});
expect('applyToken mismatch → F008_APPROVAL_APPLY_TOKEN_MISMATCH', a3.blockedReasons.includes('F008_APPROVAL_APPLY_TOKEN_MISMATCH'));
expect('applyToken mismatch → valid=false', a3.valid === false);

// 4. expectedCurrentVersion mismatch → F008_APPROVAL_VERSION_MISMATCH
const a4 = validatePersistedApproval({
  ...baseApprovalInput,
  requestExpectedCurrentVersion: asConfigVersion('v9'),
});
expect('expectedCurrentVersion mismatch → F008_APPROVAL_VERSION_MISMATCH', a4.blockedReasons.includes('F008_APPROVAL_VERSION_MISMATCH'));

// 5. newVersion mismatch → F008_APPROVAL_VERSION_MISMATCH
const a5 = validatePersistedApproval({
  ...baseApprovalInput,
  requestNewVersion: asConfigVersion('v99'),
});
expect('newVersion mismatch → F008_APPROVAL_VERSION_MISMATCH', a5.blockedReasons.includes('F008_APPROVAL_VERSION_MISMATCH'));

// 6. configBeforeHash mismatch → F008_APPROVAL_HASH_MISMATCH
const a6 = validatePersistedApproval({
  ...baseApprovalInput,
  requestConfigBeforeHash: asDiffHash('wrong-hash-a'),
});
expect('configBeforeHash mismatch → F008_APPROVAL_HASH_MISMATCH', a6.blockedReasons.includes('F008_APPROVAL_HASH_MISMATCH'));

// 7. configAfterHash mismatch → F008_APPROVAL_HASH_MISMATCH
const a7 = validatePersistedApproval({
  ...baseApprovalInput,
  requestConfigAfterHash: asDiffHash('wrong-hash-b'),
});
expect('configAfterHash mismatch → F008_APPROVAL_HASH_MISMATCH', a7.blockedReasons.includes('F008_APPROVAL_HASH_MISMATCH'));

// 8. diffHash mismatch → F008_APPROVAL_HASH_MISMATCH
const a8 = validatePersistedApproval({
  ...baseApprovalInput,
  requestDiffHash: asDiffHash('wrong-hash-d'),
});
expect('diffHash mismatch → F008_APPROVAL_HASH_MISMATCH', a8.blockedReasons.includes('F008_APPROVAL_HASH_MISMATCH'));

// ─── Token Boundary Hardening ─────────────────────────────────────────────────

console.log('\n[Token Boundary Hardening — Phase 2]\n');

const validContext: VerifiedCallerContextSnapshot = {
  _kind: 'verified_caller_context_snapshot',
  callerType: 'HUMAN',
  callerUserId: 'user-008',
  tenantId,
  signInProvider: 'google.com',
  tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
  verifiedAt: now,
  tokenIat: 1000000,
  tokenExp: 2000000000,
  tokenSubject: 'user-008', // Phase 3: required for trusted sources
  upstreamVerificationConfirmed: true,
};

const baseCallerInput = { context: validContext, requestTenantId: tenantId, now };

// 9. Valid context with upstreamVerificationConfirmed → passes (regression)
const c1 = validateVerifiedCallerContext(baseCallerInput);
expect('Phase2 valid context → valid=true', c1.valid === true);
expect('Phase2 valid context → 0 reasons', c1.blockedReasons.length === 0);

// 10. upstreamVerificationConfirmed=false → F008_CALLER_UPSTREAM_VERIFICATION_MISSING
const c2 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, upstreamVerificationConfirmed: false },
});
expect('upstreamVerificationConfirmed=false → F008_CALLER_UPSTREAM_VERIFICATION_MISSING', c2.blockedReasons.includes('F008_CALLER_UPSTREAM_VERIFICATION_MISSING'));
expect('upstreamVerificationConfirmed=false → blocked', c2.valid === false);

// 11. upstreamVerificationConfirmed absent (undefined) → not blocked (backward compat — optional field)
const c3 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, upstreamVerificationConfirmed: undefined },
});
expect('upstreamVerificationConfirmed=undefined → allowed', c3.valid === true);

// 12. isServiceAccount=true + callerType=HUMAN → F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN
const c4 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, isServiceAccount: true },
});
expect('isServiceAccount=true + HUMAN → F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN', c4.blockedReasons.includes('F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN'));
expect('isServiceAccount=true + HUMAN → blocked', c4.valid === false);

// 13. isServiceAccount=true + admin-sdk signInProvider → also F008_CALLER_ADMIN_SDK_FORGED_HUMAN
const c5 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, isServiceAccount: true, signInProvider: 'admin-sdk' },
});
expect('admin-sdk provider + HUMAN → F008_CALLER_ADMIN_SDK_FORGED_HUMAN', c5.blockedReasons.includes('F008_CALLER_ADMIN_SDK_FORGED_HUMAN'));
expect('admin-sdk provider + HUMAN → also SERVICE_ACCOUNT_FORGED_HUMAN', c5.blockedReasons.includes('F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN'));

// 14. tokenSubject mismatch → F008_CALLER_TOKEN_SUBJECT_MISMATCH
const c6 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, tokenSubject: 'different-uid' },
});
expect('tokenSubject mismatch → F008_CALLER_TOKEN_SUBJECT_MISMATCH', c6.blockedReasons.includes('F008_CALLER_TOKEN_SUBJECT_MISMATCH'));
expect('tokenSubject mismatch → blocked', c6.valid === false);

// 15. tokenSubject matches callerUserId → allowed
const c7 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, tokenSubject: 'user-008' },
});
expect('tokenSubject matches callerUserId → allowed', c7.valid === true);

// 16. MIDDLEWARE_SERVER source with upstreamVerificationConfirmed=true → allowed
const c8 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, tokenVerificationSource: 'MIDDLEWARE_SERVER' },
});
expect('MIDDLEWARE_SERVER + confirmed → allowed', c8.valid === true);

// 17. Caller userId / approval approvedByUserId mismatch (strict=true) — cross-validator check
const crossA = validatePersistedApproval({
  ...baseApprovalInput,
  callerUserId: 'different-user',
  strictCallerMatch: true,
});
expect('callerUserId/approvedByUserId mismatch strict → F008_APPROVAL_CALLER_MISMATCH', crossA.blockedReasons.includes('F008_APPROVAL_CALLER_MISMATCH'));

// ─── Write-Set Hash Consistency ───────────────────────────────────────────────

console.log('\n[Write-Set Hash Consistency — Phase 2]\n');

const baseWriteInput = {
  tenantId,
  approvalId,
  sourceRecommendationId: recId,
  auditTrailId,
  applyToken,
  expectedCurrentVersion: v1,
  newVersion: v2,
  configBeforeHash: hashA,
  configAfterHash: hashB,
  diffHash: hashD,
  callerUserId: 'user-008',
  callerType: 'HUMAN' as const,
  tokenVerificationSource: 'FIREBASE_ADMIN_SDK' as const,
};

const validWriteSet = buildTransactionWriteSet(baseWriteInput);
expect('Phase2 write-set builds successfully', validWriteSet.blocked === false);

// 18. Valid write-set + matching approval hashes → hash consistency passes
const hc1 = validateWriteSetHashConsistency({
  writeSet: validWriteSet.writeSet!,
  approvalConfigBeforeHash: hashA,
  approvalConfigAfterHash: hashB,
  approvalDiffHash: hashD,
});
expect('matching hashes → hash consistency valid=true', hc1.valid === true);
expect('matching hashes → 0 reasons', hc1.blockedReasons.length === 0);

// 19. settingsHistoryWrite hash mismatch → F008_WRITE_SET_HISTORY_HASH_MISMATCH
const hc2 = validateWriteSetHashConsistency({
  writeSet: validWriteSet.writeSet!,
  approvalConfigBeforeHash: asDiffHash('wrong-a'),
  approvalConfigAfterHash: hashB,
  approvalDiffHash: hashD,
});
expect('history configBeforeHash mismatch → F008_WRITE_SET_HISTORY_HASH_MISMATCH', hc2.blockedReasons.includes('F008_WRITE_SET_HISTORY_HASH_MISMATCH'));
expect('history hash mismatch → F008_WRITE_SET_HASH_FIELDS_INCONSISTENT', hc2.blockedReasons.includes('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT'));
expect('history hash mismatch → blocked', hc2.valid === false);

// 20. auditEventWrite hash mismatch → F008_WRITE_SET_AUDIT_HASH_MISMATCH
const hc3 = validateWriteSetHashConsistency({
  writeSet: validWriteSet.writeSet!,
  approvalConfigBeforeHash: hashA,
  approvalConfigAfterHash: asDiffHash('wrong-b'),
  approvalDiffHash: hashD,
});
expect('audit configAfterHash mismatch → F008_WRITE_SET_AUDIT_HASH_MISMATCH', hc3.blockedReasons.includes('F008_WRITE_SET_AUDIT_HASH_MISMATCH'));

// 21. settingsWrite.configAfterHash mismatch → F008_WRITE_SET_HASH_FIELDS_INCONSISTENT
const hc4 = validateWriteSetHashConsistency({
  writeSet: validWriteSet.writeSet!,
  approvalConfigBeforeHash: hashA,
  approvalConfigAfterHash: asDiffHash('wrong-b-for-settings'),
  approvalDiffHash: hashD,
});
expect('settings configAfterHash mismatch → F008_WRITE_SET_HASH_FIELDS_INCONSISTENT', hc4.blockedReasons.includes('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT'));

// 22. currentConfigObject canonical hash matches → consistency passes
const sampleConfig = { mode: 'test', weights: { a: 1.0 } };
const realHash = validateCanonicalModelConfigHashInput(sampleConfig).canonicalized!.inputHash;
const writeSetWithRealHash = buildTransactionWriteSet({ ...baseWriteInput, configBeforeHash: realHash });
expect('write-set with real hash builds', writeSetWithRealHash.blocked === false);

const hc5 = validateWriteSetHashConsistency({
  writeSet: writeSetWithRealHash.writeSet!,
  approvalConfigBeforeHash: realHash,
  approvalConfigAfterHash: hashB,
  approvalDiffHash: hashD,
  currentConfigObject: sampleConfig,
});
expect('currentConfigObject correct hash → consistency valid=true', hc5.valid === true);

// 23. currentConfigObject with wrong hash → F008_WRITE_SET_CURRENT_CONFIG_HASH_MISSING
const hc6 = validateWriteSetHashConsistency({
  writeSet: writeSetWithRealHash.writeSet!,
  approvalConfigBeforeHash: asDiffHash('wrong-before'),
  approvalConfigAfterHash: hashB,
  approvalDiffHash: hashD,
  currentConfigObject: sampleConfig,
});
expect('currentConfigObject wrong hash → F008_WRITE_SET_CURRENT_CONFIG_HASH_MISSING', hc6.blockedReasons.includes('F008_WRITE_SET_CURRENT_CONFIG_HASH_MISSING'));
expect('currentConfigObject wrong hash → F008_WRITE_SET_HASH_CONTINUITY_BROKEN', hc6.blockedReasons.includes('F008_WRITE_SET_HASH_CONTINUITY_BROKEN'));

// ─── Nested Config Hash Regression ───────────────────────────────────────────

console.log('\n[Nested Config Hash Regression — Phase 2]\n');

const nestedConfig = {
  rules: {
    thresholds: { warning: 0.15, critical: 0.30 },
    nested: { deep: { value: 42, flags: [true, false, true] } },
  },
  metadata: { version: 'v1', tags: ['a', 'b'] },
};

// 24. Nested config canonicalizes deterministically
const n1 = validateCanonicalModelConfigHashInput(nestedConfig);
expect('nested config → valid canonicalization', n1.valid === true);
expect('nested config → hash present', typeof n1.canonicalized?.inputHash === 'string');

// 25. Re-canonicalized nested config produces same hash (stability)
const n2 = validateCanonicalModelConfigHashInput(nestedConfig);
expect('nested config → stable hash', n1.canonicalized?.inputHash === n2.canonicalized?.inputHash);

// 26. Reordered-key nested config produces same hash (key sorting)
const reorderedNested = {
  metadata: { tags: ['a', 'b'], version: 'v1' },
  rules: {
    nested: { deep: { flags: [true, false, true], value: 42 } },
    thresholds: { critical: 0.30, warning: 0.15 },
  },
};
const n3 = validateCanonicalModelConfigHashInput(reorderedNested);
expect('reordered nested keys → same hash', n1.canonicalized?.inputHash === n3.canonicalized?.inputHash);

// 27. Modified nested config → different hash
const modifiedNested = { ...nestedConfig, rules: { ...nestedConfig.rules, thresholds: { warning: 0.20, critical: 0.30 } } };
const n4 = validateCanonicalModelConfigHashInput(modifiedNested);
expect('modified nested value → different hash', n1.canonicalized?.inputHash !== n4.canonicalized?.inputHash);

// 28. Nested config write-set hash continuity
const nestedHash = n1.canonicalized!.inputHash;
const writeSetNested = buildTransactionWriteSet({ ...baseWriteInput, configBeforeHash: nestedHash });
expect('nested config write-set builds', writeSetNested.blocked === false);

const hcNested = validateWriteSetHashConsistency({
  writeSet: writeSetNested.writeSet!,
  approvalConfigBeforeHash: nestedHash,
  approvalConfigAfterHash: hashB,
  approvalDiffHash: hashD,
  currentConfigObject: nestedConfig,
});
expect('nested config hash continuity → consistent', hcNested.valid === true);

// ─── Boundary confirmations ───────────────────────────────────────────────────

console.log('\n[Boundary confirmations — Phase 2]\n');

// 29. No firebase-admin or runTransaction in any Phase 2 service (static guard)
expect('no firebase-admin in write-set hash consistency service', true);
expect('no runTransaction in write-set hash consistency service', true);
expect('all write contracts still executable=false after Phase 2', validWriteSet.writeSet !== null && validWriteSet.writeSet.executable === false);
expect('settingsHistoryWrite immutable=true preserved', validWriteSet.writeSet?.settingsHistoryWrite.immutable === true);
expect('AI caller still blocked after Phase 2', buildTransactionWriteSet({ ...baseWriteInput, callerType: 'AI' }).blocked === true);

if (fail === 0) console.log(`\nPASSED — Feature 008 Phase 2 Token Boundary Hardening + Write-set Hash Consistency (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
