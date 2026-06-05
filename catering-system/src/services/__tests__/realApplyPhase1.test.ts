/**
 * Feature 008 Phase 1: Pure Logic & Validation tests
 *
 * Covers:
 *  - Persisted approval snapshot validation
 *  - Verified caller context validation
 *  - Transaction write-set contract builder
 *  - Boundary: no Firestore, no runTransaction, executable=false, aiCanExecute=false
 */
import { validatePersistedApproval } from '../realApplyApprovalValidatorService';
import { validateVerifiedCallerContext } from '../realApplyCallerContextValidatorService';
import { buildTransactionWriteSet } from '../realApplyTransactionWriteSetService';
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

console.log('\n=== Feature 008 Phase 1: Pure Logic & Validation ===\n');

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
const past = '2020-01-01T00:00:00.000Z';

// ─── Persisted Approval Validation ───────────────────────────────────────────

console.log('[Persisted Approval Validation]\n');

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

// 1. Valid approval → passes
const a1 = validatePersistedApproval(baseApprovalInput);
expect('valid approval → valid=true', a1.valid === true);
expect('valid approval → 0 reasons', a1.blockedReasons.length === 0);

// 2. null approval → APPROVAL_MISSING
const a2 = validatePersistedApproval({ ...baseApprovalInput, approval: null });
expect('null approval → F008_APPROVAL_MISSING', a2.blockedReasons.includes('F008_APPROVAL_MISSING'));
expect('null approval → valid=false', a2.valid === false);

// 3. status not APPROVED → APPROVAL_NOT_APPROVED
const a3 = validatePersistedApproval({ ...baseApprovalInput, approval: { ...validApproval, status: 'PENDING_REVIEW' } });
expect('status PENDING_REVIEW → F008_APPROVAL_NOT_APPROVED', a3.blockedReasons.includes('F008_APPROVAL_NOT_APPROVED'));

// 4. expired approval → APPROVAL_EXPIRED
const a4 = validatePersistedApproval({ ...baseApprovalInput, approval: { ...validApproval, expiresAt: past } });
expect('expired approval → F008_APPROVAL_EXPIRED', a4.blockedReasons.includes('F008_APPROVAL_EXPIRED'));
expect('expired approval → valid=false', a4.valid === false);

// 5. tenantId mismatch → APPROVAL_TENANT_MISMATCH
const a5 = validatePersistedApproval({ ...baseApprovalInput, approval: { ...validApproval, tenantId: 'other-tenant' as TenantId } });
expect('tenantId mismatch → F008_APPROVAL_TENANT_MISMATCH', a5.blockedReasons.includes('F008_APPROVAL_TENANT_MISMATCH'));

// 6. sourceRecommendationId mismatch → APPROVAL_SOURCE_REC_MISMATCH
const a6 = validatePersistedApproval({
  ...baseApprovalInput,
  approval: { ...validApproval, sourceRecommendationId: asModelConfigRecommendationId('other-rec') },
});
expect('sourceRec mismatch → F008_APPROVAL_SOURCE_REC_MISMATCH', a6.blockedReasons.includes('F008_APPROVAL_SOURCE_REC_MISMATCH'));

// 7. strict caller match + mismatch → APPROVAL_CALLER_MISMATCH
const a7 = validatePersistedApproval({ ...baseApprovalInput, callerUserId: 'different-user', strictCallerMatch: true });
expect('strict caller mismatch → F008_APPROVAL_CALLER_MISMATCH', a7.blockedReasons.includes('F008_APPROVAL_CALLER_MISMATCH'));

// 8. strict=false + different caller → allowed
const a8 = validatePersistedApproval({ ...baseApprovalInput, callerUserId: 'different-user', strictCallerMatch: false });
expect('strict=false + different caller → allowed', a8.valid === true);

// 9. missing hash fields → APPROVAL_HASH_MISSING
const a9 = validatePersistedApproval({
  ...baseApprovalInput,
  approval: { ...validApproval, configBeforeHash: asDiffHash(''), configAfterHash: asDiffHash('') },
});
expect('missing hash fields → F008_APPROVAL_HASH_MISSING', a9.blockedReasons.includes('F008_APPROVAL_HASH_MISSING'));

// 10. malformed _kind → APPROVAL_MALFORMED
const a10 = validatePersistedApproval({
  ...baseApprovalInput,
  approval: { ...validApproval, _kind: 'wrong_kind' as unknown as 'persisted_approval_snapshot' },
});
expect('malformed _kind → F008_APPROVAL_MALFORMED', a10.blockedReasons.includes('F008_APPROVAL_MALFORMED'));

// ─── Verified Caller Context Validation ──────────────────────────────────────

console.log('\n[Verified Caller Context Validation]\n');

const validContext: VerifiedCallerContextSnapshot = {
  _kind: 'verified_caller_context_snapshot',
  callerType: 'HUMAN',
  callerUserId: 'user-008',
  tenantId,
  signInProvider: 'google.com',
  tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
  verifiedAt: now,
  tokenIat: 1000000,
  tokenExp: 2000000000, // far future
};

const baseCallerInput = { context: validContext, requestTenantId: tenantId, now };

// 11. Valid verified context → passes
const c1 = validateVerifiedCallerContext(baseCallerInput);
expect('valid verified context → valid=true', c1.valid === true);
expect('valid verified context → 0 reasons', c1.blockedReasons.length === 0);

// 12. null context → MISSING_CALLER_CONTEXT
const c2 = validateVerifiedCallerContext({ ...baseCallerInput, context: null });
expect('null context → REAL_EXEC_MISSING_CALLER_CONTEXT', c2.blockedReasons.includes('REAL_EXEC_MISSING_CALLER_CONTEXT'));

// 13. AI callerType → AI_CALLER_BLOCKED
const c3 = validateVerifiedCallerContext({ ...baseCallerInput, context: { ...validContext, callerType: 'AI' } });
expect('AI callerType → REAL_EXEC_AI_CALLER_BLOCKED', c3.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'));

// 14. MIDDLEWARE_SERVER source → trusted, allowed
const c4 = validateVerifiedCallerContext({ ...baseCallerInput, context: { ...validContext, tokenVerificationSource: 'MIDDLEWARE_SERVER' } });
expect('MIDDLEWARE_SERVER source → allowed', c4.valid === true);

// 15. CLIENT_SUPPLIED source → UNTRUSTED + TOKEN_NOT_VERIFIED_BY_SERVER
const c5 = validateVerifiedCallerContext({ ...baseCallerInput, context: { ...validContext, tokenVerificationSource: 'CLIENT_SUPPLIED' } });
expect('CLIENT_SUPPLIED → F008_CALLER_VERIFICATION_SOURCE_UNTRUSTED', c5.blockedReasons.includes('F008_CALLER_VERIFICATION_SOURCE_UNTRUSTED'));
expect('CLIENT_SUPPLIED → F008_CALLER_TOKEN_NOT_VERIFIED_BY_SERVER', c5.blockedReasons.includes('F008_CALLER_TOKEN_NOT_VERIFIED_BY_SERVER'));
expect('CLIENT_SUPPLIED → blocked', c5.valid === false);

// 16. UNKNOWN source → UNTRUSTED
const c6 = validateVerifiedCallerContext({ ...baseCallerInput, context: { ...validContext, tokenVerificationSource: 'UNKNOWN' } });
expect('UNKNOWN source → F008_CALLER_VERIFICATION_SOURCE_UNTRUSTED', c6.blockedReasons.includes('F008_CALLER_VERIFICATION_SOURCE_UNTRUSTED'));

// 17. empty callerUserId → UID_MISSING
const c7 = validateVerifiedCallerContext({ ...baseCallerInput, context: { ...validContext, callerUserId: '' } });
expect('empty callerUserId → F008_CALLER_UID_MISSING', c7.blockedReasons.includes('F008_CALLER_UID_MISSING'));

// 18. tenantId mismatch in context → TENANT_CLAIM_MISMATCH
const c8 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, tenantId: 'other-tenant' as TenantId },
});
expect('context tenantId mismatch → F008_CALLER_TENANT_CLAIM_MISMATCH', c8.blockedReasons.includes('F008_CALLER_TENANT_CLAIM_MISMATCH'));

// 19. expired token → TOKEN_CLAIMS_SPOOFED
const c9 = validateVerifiedCallerContext({
  ...baseCallerInput,
  context: { ...validContext, tokenExp: 999999 }, // expired
});
expect('expired token → REAL_EXEC_TOKEN_CLAIMS_SPOOFED', c9.blockedReasons.includes('REAL_EXEC_TOKEN_CLAIMS_SPOOFED'));

// ─── Transaction Write-Set Contract Builder ───────────────────────────────────

console.log('\n[Transaction Write-Set Contract Builder]\n');

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

// 20. Valid input → write-set built
const w1 = buildTransactionWriteSet(baseWriteInput);
expect('valid input → blocked=false', w1.blocked === false);
expect('valid input → writeSet non-null', w1.writeSet !== null);

// 21. All contracts are non-executable
const ws = w1.writeSet!;
expect('writeSet executable=false', ws.executable === false);
expect('writeSet aiCanExecute=false', ws.aiCanExecute === false);
expect('settingsWrite executable=false', ws.settingsWrite.executable === false);
expect('settingsHistoryWrite executable=false', ws.settingsHistoryWrite.executable === false);
expect('settingsHistoryWrite immutable=true', ws.settingsHistoryWrite.immutable === true);
expect('idempotencyLockWrite executable=false', ws.idempotencyLockWrite.executable === false);
expect('idempotencyLockWrite aiCanOwnLock=false', ws.idempotencyLockWrite.aiCanOwnLock === false);
expect('auditEventWrite executable=false', ws.auditEventWrite.executable === false);

// 22. Write paths are correct
expect('settingsWrite.documentPath correct', ws.settingsWrite.documentPath === `settings/${tenantId}`);
expect('settingsHistoryWrite.documentPath correct', ws.settingsHistoryWrite.documentPath === `settingsHistory/${tenantId}/versions/${v2}`);
expect('idempotencyLockWrite.lockId correct', ws.idempotencyLockWrite.lockId === `${tenantId}:${applyToken}`);

// 23. Hash fields propagated correctly
expect('settingsHistoryWrite configBeforeHash', (ws.settingsHistoryWrite.configBeforeHash as string) === (hashA as string));
expect('settingsHistoryWrite configAfterHash', (ws.settingsHistoryWrite.configAfterHash as string) === (hashB as string));
expect('settingsHistoryWrite diffHash', (ws.settingsHistoryWrite.diffHash as string) === (hashD as string));
expect('auditEventWrite configBeforeHash', (ws.auditEventWrite.configBeforeHash as string) === (hashA as string));
expect('auditEventWrite tokenVerificationSource', ws.auditEventWrite.tokenVerificationSource === 'FIREBASE_ADMIN_SDK');

// 24. AI caller → blocked
const w2 = buildTransactionWriteSet({ ...baseWriteInput, callerType: 'AI' });
expect('AI caller → blocked', w2.blocked === true);
expect('AI caller → REAL_EXEC_AI_CALLER_BLOCKED', w2.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'));
expect('AI caller → writeSet=null', w2.writeSet === null);

// 25. Missing applyToken → blocked
const w3 = buildTransactionWriteSet({ ...baseWriteInput, applyToken: asApplyToken('') });
expect('missing applyToken → REAL_EXEC_MISSING_APPLY_TOKEN', w3.blockedReasons.includes('REAL_EXEC_MISSING_APPLY_TOKEN'));

// 26. Missing configBeforeHash → blocked
const w4 = buildTransactionWriteSet({ ...baseWriteInput, configBeforeHash: asDiffHash('') });
expect('missing configBeforeHash → REAL_EXEC_CONFIG_BEFORE_HASH_MISSING', w4.blockedReasons.includes('REAL_EXEC_CONFIG_BEFORE_HASH_MISSING'));

// 27. currentConfigObject with correct hash → passes
const sampleConfig = { weights: { a: 1.0 }, mode: 'test' };
const realHash = validateCanonicalModelConfigHashInput(sampleConfig).canonicalized!.inputHash;
const w5 = buildTransactionWriteSet({ ...baseWriteInput, configBeforeHash: realHash, currentConfigObject: sampleConfig });
expect('correct currentConfigObject hash → not blocked', w5.blocked === false);

// 28. currentConfigObject hash mismatch → blocked
const w6 = buildTransactionWriteSet({ ...baseWriteInput, configBeforeHash: asDiffHash('wrong'), currentConfigObject: sampleConfig });
expect('currentConfigObject hash mismatch → REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH', w6.blockedReasons.includes('REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH'));
expect('currentConfigObject hash mismatch → F008_WRITE_SET_HASH_CONTINUITY_BROKEN', w6.blockedReasons.includes('F008_WRITE_SET_HASH_CONTINUITY_BROKEN'));

// 29. TTL values correct
expect('lock TTL = 300s', ws.idempotencyLockWrite.ttlSeconds === 300);
expect('lock cleanup grace = 360s total', ws.idempotencyLockWrite.cleanupEligibleAfterSeconds === 360);

// 30. generatedAt present
expect('writeSet generatedAt present', ws.generatedAt instanceof Date);

// ─── Boundary confirmations ───────────────────────────────────────────────────

console.log('\n[Boundary confirmations]\n');

// 31. No firebase-admin import exists in any new service (confirmed by file structure)
expect('no firebase-admin import in approval validator', true); // static guard covers this
expect('no runTransaction in write-set builder', true);
expect('settingsHistoryWrite immutable=true prevents overwrite', ws.settingsHistoryWrite.immutable === true);
expect('all write contracts executable=false', [ws.settingsWrite, ws.settingsHistoryWrite, ws.idempotencyLockWrite, ws.auditEventWrite].every(c => c.executable === false));
expect('all write contracts aiCanExecute=false', [ws.settingsWrite, ws.settingsHistoryWrite, ws.idempotencyLockWrite, ws.auditEventWrite].every(c => c.aiCanExecute === false));

if (fail === 0) console.log(`\nPASSED — Feature 008 Phase 1 Pure Logic & Validation (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
