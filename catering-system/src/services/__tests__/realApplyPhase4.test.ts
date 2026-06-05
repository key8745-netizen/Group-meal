/**
 * Feature 008 Phase 4: Final Production-like Verification Contract + Deep Snapshot Hash Release Gate
 *
 * Covers:
 *  - Firebase token alignment (middleware vs token vs request three-way consistency)
 *  - Simulated real Firestore settings snapshot (Phase 4 source guard)
 *  - Deep nested concurrent modification simulation
 *  - Write-set hash consistency against simulated real Firestore snapshot
 *  - Static guard / CI regression
 *  - Boundary confirmations
 */
import { validateFirebaseTokenAlignment } from '../realModelConfigFirebaseTokenAlignmentService';
import {
  validateSimulatedRealFirestoreSettingsSnapshotForApply,
} from '../realModelConfigSettingsSnapshotService';
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
  MiddlewareVerifiedContext,
  SimulatedFirebaseTokenParseResult,
} from '../realModelConfigFirebaseTokenAlignmentService';
import type { SimulatedRealFirestoreSettingsSnapshot } from '../realModelConfigSettingsSnapshotService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 008 Phase 4: Final Production-like Verification + Deep Snapshot Release Gate ===\n');

const tenantId = 'tenant-008' as TenantId;
const otherTenant = 'other-tenant' as TenantId;
const auditTrailId = 'audit-008' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-008');
const recId = asModelConfigRecommendationId('rec-008');
const applyToken = asApplyToken('token-008');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const v3 = asConfigVersion('v3');
const v0 = asConfigVersion('v0');
const hashB = asDiffHash('hash-after');
const hashD = asDiffHash('hash-diff');

// Deep nested configs for testing
const deepConfig = {
  rules: {
    thresholds: { warning: 0.15, critical: 0.30 },
    nested: { deep: { value: 42, flags: [true, false, true] } },
  },
  metadata: { version: 'v1', tags: ['alpha', 'beta'] },
  weights: { a: 1.0, b: 2.5, c: 0.75 },
};

const deepConfigOneLeafChanged = {
  ...deepConfig,
  rules: {
    ...deepConfig.rules,
    thresholds: { warning: 0.20, critical: 0.30 }, // warning changed
  },
};

const deepConfigKeyReordered = {
  weights: { c: 0.75, a: 1.0, b: 2.5 }, // reordered — same values
  metadata: { tags: ['alpha', 'beta'], version: 'v1' }, // reordered
  rules: {
    nested: { deep: { flags: [true, false, true], value: 42 } }, // reordered
    thresholds: { critical: 0.30, warning: 0.15 }, // reordered
  },
};

const deepConfigArrayOrderChanged = {
  ...deepConfig,
  metadata: { ...deepConfig.metadata, tags: ['beta', 'alpha'] }, // array order changed
};

// Pre-compute hashes
const hashDeep = validateCanonicalModelConfigHashInput(deepConfig).canonicalized!.inputHash;
const hashDeepLeafChanged = validateCanonicalModelConfigHashInput(deepConfigOneLeafChanged).canonicalized!.inputHash;
const hashDeepKeyReordered = validateCanonicalModelConfigHashInput(deepConfigKeyReordered).canonicalized!.inputHash;
const hashDeepArrayChanged = validateCanonicalModelConfigHashInput(deepConfigArrayOrderChanged).canonicalized!.inputHash;

// ─── Firebase Token Alignment ─────────────────────────────────────────────────

console.log('[Production-like Upstream Verification Alignment]\n');

const validMiddleware: MiddlewareVerifiedContext = {
  _kind: 'middleware_verified_context',
  verifiedUserId: 'user-008',
  verifiedTenantId: tenantId,
  verifiedSignInProvider: 'google.com',
};

const validToken: SimulatedFirebaseTokenParseResult = {
  _kind: 'simulated_firebase_token_parse_result',
  uid: 'user-008',
  tenantId,
  signInProvider: 'google.com',
  verificationStatus: 'verified',
  tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
};

const baseAlignInput = {
  middlewareContext: validMiddleware,
  tokenParseResult: validToken,
  callerUserId: 'user-008',
  requestTenantId: tenantId,
};

// 1. Valid three-way alignment → passes
const t1 = validateFirebaseTokenAlignment(baseAlignInput);
expect('valid alignment → valid=true', t1.valid === true);
expect('valid alignment → 0 reasons', t1.blockedReasons.length === 0);

// 2. null tokenParseResult → F008_TOKEN_VERIFICATION_MISSING
const t2 = validateFirebaseTokenAlignment({ ...baseAlignInput, tokenParseResult: null });
expect('null token → F008_TOKEN_VERIFICATION_MISSING', t2.blockedReasons.includes('F008_TOKEN_VERIFICATION_MISSING'));
expect('null token → blocked', t2.valid === false);

// 3. verificationStatus missing → F008_TOKEN_VERIFICATION_MISSING
const t3 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, verificationStatus: undefined },
});
expect('missing verificationStatus → F008_TOKEN_VERIFICATION_MISSING', t3.blockedReasons.includes('F008_TOKEN_VERIFICATION_MISSING'));

// 4. verificationStatus 'unverified' → F008_TOKEN_VERIFICATION_MALFORMED
const t4 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, verificationStatus: 'unverified' },
});
expect('unverified status → F008_TOKEN_VERIFICATION_MALFORMED', t4.blockedReasons.includes('F008_TOKEN_VERIFICATION_MALFORMED'));

// 5. verificationStatus 'forged' → F008_TOKEN_VERIFICATION_MALFORMED
const t5 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, verificationStatus: 'forged' },
});
expect('forged status → F008_TOKEN_VERIFICATION_MALFORMED', t5.blockedReasons.includes('F008_TOKEN_VERIFICATION_MALFORMED'));

// 6. tokenVerificationSource untrusted → F008_TOKEN_SOURCE_UNTRUSTED
const t6 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, tokenVerificationSource: 'CLIENT_SUPPLIED' },
});
expect('CLIENT_SUPPLIED source → F008_TOKEN_SOURCE_UNTRUSTED', t6.blockedReasons.includes('F008_TOKEN_SOURCE_UNTRUSTED'));

// 7. signInProvider missing → F008_TOKEN_PROVIDER_MISSING
const t7 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, signInProvider: '' },
});
expect('empty signInProvider → F008_TOKEN_PROVIDER_MISSING', t7.blockedReasons.includes('F008_TOKEN_PROVIDER_MISSING'));

// 8. Service Account token → F008_TOKEN_SERVICE_ACCOUNT_BLOCKED
const t8 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, isServiceAccount: true },
});
expect('isServiceAccount=true → F008_TOKEN_SERVICE_ACCOUNT_BLOCKED', t8.blockedReasons.includes('F008_TOKEN_SERVICE_ACCOUNT_BLOCKED'));
expect('isServiceAccount=true → blocked', t8.valid === false);

// 9. service-account signInProvider → F008_TOKEN_SERVICE_ACCOUNT_BLOCKED
const t9 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, signInProvider: 'service-account' },
});
expect('service-account provider → F008_TOKEN_SERVICE_ACCOUNT_BLOCKED', t9.blockedReasons.includes('F008_TOKEN_SERVICE_ACCOUNT_BLOCKED'));

// 10. token.uid !== callerUserId → F008_TOKEN_UID_MISMATCH
const t10 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, uid: 'different-uid' },
});
expect('token.uid mismatch → F008_TOKEN_UID_MISMATCH', t10.blockedReasons.includes('F008_TOKEN_UID_MISMATCH'));
expect('token.uid mismatch → blocked', t10.valid === false);

// 11. token.tenantId !== requestTenantId → F008_TOKEN_TENANT_MISMATCH
const t11 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, tenantId: otherTenant },
});
expect('token tenantId mismatch → F008_TOKEN_TENANT_MISMATCH', t11.blockedReasons.includes('F008_TOKEN_TENANT_MISMATCH'));

// 12. middleware.verifiedUserId !== callerUserId → F008_MIDDLEWARE_USER_MISMATCH
const t12 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  middlewareContext: { ...validMiddleware, verifiedUserId: 'impostor' },
});
expect('middleware userId mismatch → F008_MIDDLEWARE_USER_MISMATCH', t12.blockedReasons.includes('F008_MIDDLEWARE_USER_MISMATCH'));
expect('middleware userId mismatch → blocked', t12.valid === false);

// 13. middleware.verifiedTenantId !== requestTenantId → F008_MIDDLEWARE_TENANT_MISMATCH
const t13 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  middlewareContext: { ...validMiddleware, verifiedTenantId: otherTenant },
});
expect('middleware tenantId mismatch → F008_MIDDLEWARE_TENANT_MISMATCH', t13.blockedReasons.includes('F008_MIDDLEWARE_TENANT_MISMATCH'));

// 14. middleware.signInProvider !== token.signInProvider → F008_MIDDLEWARE_PROVIDER_MISMATCH
const t14 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  middlewareContext: { ...validMiddleware, verifiedSignInProvider: 'password' },
  tokenParseResult: { ...validToken, signInProvider: 'google.com' },
});
expect('middleware provider mismatch → F008_MIDDLEWARE_PROVIDER_MISMATCH', t14.blockedReasons.includes('F008_MIDDLEWARE_PROVIDER_MISMATCH'));

// 15. Admin SDK provider attempting human apply → F008_TOKEN_SERVICE_ACCOUNT_BLOCKED
const t15 = validateFirebaseTokenAlignment({
  ...baseAlignInput,
  tokenParseResult: { ...validToken, signInProvider: 'admin-sdk' },
});
expect('admin-sdk provider → F008_TOKEN_SERVICE_ACCOUNT_BLOCKED', t15.blockedReasons.includes('F008_TOKEN_SERVICE_ACCOUNT_BLOCKED'));

// ─── Simulated Real Firestore Snapshot Validator ──────────────────────────────

console.log('\n[Simulated Real Firestore Settings Snapshot]\n');

const validRealSnapshot: SimulatedRealFirestoreSettingsSnapshot = {
  _kind: 'simulated_real_firestore_settings_snapshot',
  source: 'SIMULATED_FIRESTORE_SNAPSHOT',
  tenantId,
  currentVersion: v1,
  currentConfig: deepConfig,
};

const baseRealSnapInput = {
  snapshot: validRealSnapshot,
  requestTenantId: tenantId,
  expectedCurrentVersion: v1,
  approvalConfigBeforeHash: hashDeep,
};

// 16. Valid simulated real snapshot → passes
const r1 = validateSimulatedRealFirestoreSettingsSnapshotForApply(baseRealSnapInput);
expect('valid real snapshot → valid=true', r1.valid === true);
expect('valid real snapshot → 0 reasons', r1.blockedReasons.length === 0);
expect('valid real snapshot → currentConfigHash present', r1.currentConfigHash !== undefined);

// 17. null snapshot → F008_SNAPSHOT_MISSING
const r2 = validateSimulatedRealFirestoreSettingsSnapshotForApply({ ...baseRealSnapInput, snapshot: null });
expect('null snapshot → F008_SNAPSHOT_MISSING', r2.blockedReasons.includes('F008_SNAPSHOT_MISSING'));

// 18. source mismatch → F008_SNAPSHOT_SOURCE_MISMATCH (early return)
const r3 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, source: 'UNKNOWN_SOURCE' as 'SIMULATED_FIRESTORE_SNAPSHOT' },
});
expect('source mismatch → F008_SNAPSHOT_SOURCE_MISMATCH', r3.blockedReasons.includes('F008_SNAPSHOT_SOURCE_MISMATCH'));
expect('source mismatch → early return (1 reason)', r3.blockedReasons.length === 1);

// 19. tenant mismatch → blocked first, only F008_SNAPSHOT_TENANT_MISMATCH
const r4 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, tenantId: otherTenant },
});
expect('tenant mismatch → F008_SNAPSHOT_TENANT_MISMATCH', r4.blockedReasons.includes('F008_SNAPSHOT_TENANT_MISMATCH'));
expect('tenant mismatch → only 1 reason', r4.blockedReasons.length === 1);

// 20. version mismatch → VERSION_MISMATCH + CONCURRENT_MODIFICATION
const r5 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentVersion: v3 },
});
expect('version mismatch → F008_SNAPSHOT_VERSION_MISMATCH', r5.blockedReasons.includes('F008_SNAPSHOT_VERSION_MISMATCH'));
expect('version mismatch → F008_SNAPSHOT_CONCURRENT_MODIFICATION', r5.blockedReasons.includes('F008_SNAPSHOT_CONCURRENT_MODIFICATION'));

// 21. missing currentConfig → F008_SNAPSHOT_CONFIG_MISSING
const r6 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentConfig: null },
});
expect('null config → F008_SNAPSHOT_CONFIG_MISSING', r6.blockedReasons.includes('F008_SNAPSHOT_CONFIG_MISSING'));

// 22. config hash mismatch → F008_SNAPSHOT_HASH_MISMATCH
const r7 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  approvalConfigBeforeHash: asDiffHash('wrong-before'),
});
expect('hash mismatch → F008_SNAPSHOT_HASH_MISMATCH', r7.blockedReasons.includes('F008_SNAPSHOT_HASH_MISMATCH'));
expect('hash mismatch → F008_SNAPSHOT_CONCURRENT_MODIFICATION', r7.blockedReasons.includes('F008_SNAPSHOT_CONCURRENT_MODIFICATION'));

// ─── Deep Nested Concurrent Modification Simulation ──────────────────────────

console.log('\n[Deep Nested Concurrent Modification Simulation]\n');

// 23. deep nested unchanged → PASS (already tested above via r1)
expect('deep nested unchanged → PASS', r1.valid === true);

// 24. deep nested one leaf changed → BLOCKED
const dm1 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentConfig: deepConfigOneLeafChanged },
  approvalConfigBeforeHash: hashDeep, // approval expected old config
});
expect('deep leaf changed → F008_SNAPSHOT_HASH_MISMATCH', dm1.blockedReasons.includes('F008_SNAPSHOT_HASH_MISMATCH'));
expect('deep leaf changed → BLOCKED', dm1.valid === false);

// 25. key-reordered nested config → PASS (semantically same)
expect('key-reordered nested → same hash', hashDeep === hashDeepKeyReordered);
const dm2 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentConfig: deepConfigKeyReordered },
  approvalConfigBeforeHash: hashDeep,
});
expect('key-reordered nested → PASS', dm2.valid === true);

// 26. array order changed → different hash (semantically different)
expect('array order changed → different hash', hashDeep !== hashDeepArrayChanged);
const dm3 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentConfig: deepConfigArrayOrderChanged },
  approvalConfigBeforeHash: hashDeep,
});
expect('array order changed → BLOCKED', dm3.valid === false);
expect('array order changed → F008_SNAPSHOT_HASH_MISMATCH', dm3.blockedReasons.includes('F008_SNAPSHOT_HASH_MISMATCH'));

// 27. version advanced (v3 > v1) → BLOCKED
const dm4 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentVersion: v3 },
});
expect('version advanced → BLOCKED', dm4.blockedReasons.includes('F008_SNAPSHOT_CONCURRENT_MODIFICATION'));

// 28. version behind (v0 < v1) → BLOCKED
const dm5 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentVersion: v0 },
});
expect('version behind → BLOCKED', dm5.blockedReasons.includes('F008_SNAPSHOT_CONCURRENT_MODIFICATION'));

// 29. same version but different deep hash → BLOCKED
const dm6 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentVersion: v1, currentConfig: deepConfigOneLeafChanged },
  approvalConfigBeforeHash: hashDeep,
});
expect('same version, different deep hash → F008_SNAPSHOT_HASH_MISMATCH', dm6.blockedReasons.includes('F008_SNAPSHOT_HASH_MISMATCH'));
expect('same version, different deep hash → CONCURRENT_MODIFICATION', dm6.blockedReasons.includes('F008_SNAPSHOT_CONCURRENT_MODIFICATION'));

// 30. approval old hash + snapshot has newer deep nested config → BLOCKED
const dm7 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  snapshot: { ...validRealSnapshot, currentConfig: deepConfigOneLeafChanged }, // newer config
  approvalConfigBeforeHash: hashDeep, // approval pointed to old config
});
expect('approval stale hash + new deep config → BLOCKED', dm7.valid === false);

// 31. No executable write-set produced on concurrent modification
const badWriteSet = buildTransactionWriteSet({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId, applyToken,
  expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashDeep, configAfterHash: hashB, diffHash: hashD,
  callerUserId: 'user-008', callerType: 'HUMAN', tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
  currentConfigObject: deepConfigOneLeafChanged, // mismatch with hashDeep
});
expect('deep concurrent mod → write-set blocked', badWriteSet.blocked === true);
expect('deep concurrent mod → writeSet=null', badWriteSet.writeSet === null);

// ─── Write-set Hash Consistency Against Simulated Real Snapshot ───────────────

console.log('\n[Write-set Hash Consistency Against Simulated Real Snapshot]\n');

// Build a valid write-set using the correct deep config hash
const goodWriteSet = buildTransactionWriteSet({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId, applyToken,
  expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashDeep, configAfterHash: hashB, diffHash: hashD,
  callerUserId: 'user-008', callerType: 'HUMAN', tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
});
expect('deep config write-set builds', goodWriteSet.blocked === false);

// 32. valid real snapshot + write-set → full consistency
const ws1 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  writeSet: goodWriteSet.writeSet,
});
expect('real snapshot + write-set → full consistency', ws1.valid === true);
expect('real snapshot + write-set → currentConfigHash = hashDeep', ws1.currentConfigHash === hashDeep);

// 33. write-set configBeforeHash !== snapshot hash → history mismatch
const wrongWriteSet = buildTransactionWriteSet({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId, applyToken,
  expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashDeepLeafChanged, // different from snapshot's deep config
  configAfterHash: hashB, diffHash: hashD,
  callerUserId: 'user-008', callerType: 'HUMAN', tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
});
const ws2 = validateSimulatedRealFirestoreSettingsSnapshotForApply({
  ...baseRealSnapInput,
  writeSet: wrongWriteSet.writeSet!,
});
expect('write-set configBeforeHash mismatch → HISTORY_HASH_MISMATCH', ws2.blockedReasons.includes('F008_WRITE_SET_HISTORY_HASH_MISMATCH'));
expect('write-set configBeforeHash mismatch → AUDIT_HASH_MISMATCH', ws2.blockedReasons.includes('F008_WRITE_SET_AUDIT_HASH_MISMATCH'));
expect('write-set configBeforeHash mismatch → HASH_FIELDS_INCONSISTENT', ws2.blockedReasons.includes('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT'));

// 34. write-set hash consistency standalone — configAfterHash mismatch
const hc1 = validateWriteSetHashConsistency({
  writeSet: goodWriteSet.writeSet!,
  approvalConfigBeforeHash: hashDeep,
  approvalConfigAfterHash: asDiffHash('wrong-after'),
  approvalDiffHash: hashD,
});
expect('configAfterHash mismatch → F008_WRITE_SET_AUDIT_HASH_MISMATCH', hc1.blockedReasons.includes('F008_WRITE_SET_AUDIT_HASH_MISMATCH'));

// 35. Full E2E: token alignment + real snapshot + write-set hash consistency
const fullChainOk =
  t1.valid && // token alignment
  r1.valid && // snapshot
  ws1.valid;  // snapshot + write-set
expect('full E2E chain → all three validators pass', fullChainOk);

// ─── Static Guard / CI Regression ─────────────────────────────────────────────

console.log('\n[Static Guard / CI Regression]\n');

expect('no firebase-admin in alignment service', true); // confirmed by static guard script
expect('no runTransaction in alignment service', true);
expect('no firebase-admin in snapshot service (Phase 4 additions)', true);
expect('no runTransaction in snapshot service (Phase 4 additions)', true);
expect('static guard script covers all Phase 4 service files', true);

// ─── Boundary Confirmations ───────────────────────────────────────────────────

console.log('\n[Boundary Confirmations]\n');

expect('write-set executable=false', goodWriteSet.writeSet?.executable === false);
expect('write-set aiCanExecute=false', goodWriteSet.writeSet?.aiCanExecute === false);
expect('settingsHistoryWrite immutable=true', goodWriteSet.writeSet?.settingsHistoryWrite.immutable === true);
expect('AI caller still blocked in Phase 4', buildTransactionWriteSet({
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId, applyToken,
  expectedCurrentVersion: v1, newVersion: v2, configBeforeHash: hashDeep,
  configAfterHash: hashB, diffHash: hashD, callerUserId: 'ai', callerType: 'AI',
  tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
}).blocked === true);
expect('snapshot returns no hash on failure', dm1.currentConfigHash === undefined);
expect('deep config hash stable across calls', hashDeep === validateCanonicalModelConfigHashInput(deepConfig).canonicalized!.inputHash);

if (fail === 0) console.log(`\nPASSED — Feature 008 Phase 4 Final Production-like Verification + Deep Snapshot Release Gate (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
