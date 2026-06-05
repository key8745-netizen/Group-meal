/**
 * Feature 007 Phase 1 + Phase 2: Default-Deny Guard tests
 * Phase 2 adds: spoofed token claims, malformed context, sign_in_provider,
 * contextValidated flag, comprehensive edge cases.
 */
import { validateRealModelConfigApplyEntrance } from '../realModelConfigApplyGuardService';
import type { RealModelConfigApplyRequest } from '../../types/realModelConfigApplyExecution';
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

console.log('\n=== Feature 007 Phase 1+2: Default-Deny Guard ===\n');

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

// Valid token claims (well-formed)
const validTokenClaims = {
  uid: 'user-007',
  iss: 'https://securetoken.google.com/project',
  aud: 'project',
  iat: 1000000,
  exp: 1003600,
};

const validRequest: RealModelConfigApplyRequest = {
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
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'user-007',
    signInProvider: 'password',
    tokenClaims: validTokenClaims,
    contextValidated: true,
  },
};

// ─── Phase 1 core guard tests ────────────────────────────────────────────────

console.log('[Phase 1 core]\n');

// 1. Valid human caller passes
const r1 = validateRealModelConfigApplyEntrance(validRequest);
expect('valid human caller → allowed=true', r1.allowed === true);
expect('valid human caller → 0 blockedReasons', r1.blockedReasons.length === 0);

// 2. AI caller blocked
const r2 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'AI', callerUserId: 'ai-agent' },
});
expect('AI caller → REAL_EXEC_AI_CALLER_BLOCKED', r2.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'));
expect('AI caller → allowed=false', r2.allowed === false);

// 3. Unknown callerType blocked
const r3 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'UNKNOWN', callerUserId: 'user-007' },
});
expect('UNKNOWN callerType → REAL_EXEC_UNKNOWN_CALLER_TYPE', r3.blockedReasons.includes('REAL_EXEC_UNKNOWN_CALLER_TYPE'));

// 4. Missing caller context → early exit
const r4 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: null as unknown as RealModelConfigApplyRequest['callerContext'],
});
expect('null callerContext → REAL_EXEC_MISSING_CALLER_CONTEXT', r4.blockedReasons.includes('REAL_EXEC_MISSING_CALLER_CONTEXT'));
expect('null callerContext → early exit', r4.blockedReasons.length === 1);

// 5. ServiceAccount alone (no userId) blocked
const r5 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: null, isServiceAccount: true },
});
expect('serviceAccount no userId → REAL_EXEC_SERVICE_ACCOUNT_INSUFFICIENT', r5.blockedReasons.includes('REAL_EXEC_SERVICE_ACCOUNT_INSUFFICIENT'));
expect('serviceAccount no userId → REAL_EXEC_MISSING_HUMAN_USER_ID', r5.blockedReasons.includes('REAL_EXEC_MISSING_HUMAN_USER_ID'));

// 6. Admin SDK alone (no userId) blocked
const r6 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: undefined, isAdminSdk: true },
});
expect('adminSdk no userId → REAL_EXEC_ADMIN_SDK_NOT_SUFFICIENT', r6.blockedReasons.includes('REAL_EXEC_ADMIN_SDK_NOT_SUFFICIENT'));

// 7. Empty callerUserId blocked
const r7 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: '' },
});
expect('empty callerUserId → REAL_EXEC_MISSING_HUMAN_USER_ID', r7.blockedReasons.includes('REAL_EXEC_MISSING_HUMAN_USER_ID'));

// 8. Tenant hard guard first (early exit)
const r8 = validateRealModelConfigApplyEntrance({ ...validRequest, tenantId: '' as TenantId });
expect('missing tenantId → REAL_EXEC_TENANT_MISMATCH', r8.blockedReasons.includes('REAL_EXEC_TENANT_MISMATCH'));
expect('missing tenantId → early exit', r8.blockedReasons.length === 1);

// 9. Missing approvalId blocked
const r9 = validateRealModelConfigApplyEntrance({ ...validRequest, approvalId: asModelConfigApprovalId('') });
expect('missing approvalId → REAL_EXEC_MISSING_APPROVAL_ID', r9.blockedReasons.includes('REAL_EXEC_MISSING_APPROVAL_ID'));

// 10. Missing auditTrailId blocked
const r10 = validateRealModelConfigApplyEntrance({ ...validRequest, auditTrailId: '' as AuditTrailId });
expect('missing auditTrailId → REAL_EXEC_MISSING_AUDIT_TRAIL_ID', r10.blockedReasons.includes('REAL_EXEC_MISSING_AUDIT_TRAIL_ID'));

// 11. Missing expectedCurrentVersion blocked
const r11 = validateRealModelConfigApplyEntrance({ ...validRequest, expectedCurrentVersion: asConfigVersion('') });
expect('missing expectedCurrentVersion → REAL_EXEC_MISSING_EXPECTED_VERSION', r11.blockedReasons.includes('REAL_EXEC_MISSING_EXPECTED_VERSION'));

// 12. Missing applyToken blocked
const r12 = validateRealModelConfigApplyEntrance({ ...validRequest, applyToken: asApplyToken('') });
expect('missing applyToken → REAL_EXEC_MISSING_APPLY_TOKEN', r12.blockedReasons.includes('REAL_EXEC_MISSING_APPLY_TOKEN'));

// 13. Admin SDK + human userId allowed
const r13 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: 'user-007', isAdminSdk: true },
});
expect('AdminSdk + human userId → allowed=true', r13.allowed === true);

// 14. ServiceAccount + human userId allowed
const r14 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: 'user-007', isServiceAccount: true },
});
expect('serviceAccount + human userId → allowed=true', r14.allowed === true);

// 15. AI + AdminSdk still blocked
const r15 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'AI', callerUserId: 'ai-agent', isAdminSdk: true },
});
expect('AI + AdminSdk → blocked', r15.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'));

// 16. Missing sourceRecommendationId blocked
const r16 = validateRealModelConfigApplyEntrance({ ...validRequest, sourceRecommendationId: asModelConfigRecommendationId('') });
expect('missing sourceRecommendationId → REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID', r16.blockedReasons.includes('REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID'));

// ─── Phase 2: Edge-case / spoofed context tests ───────────────────────────────

console.log('\n[Phase 2: Spoofed / malformed context]\n');

// 17. contextValidated=false → malformed
const r17 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { ...validRequest.callerContext, contextValidated: false },
});
expect('contextValidated=false → REAL_EXEC_CALLER_CONTEXT_MALFORMED', r17.blockedReasons.includes('REAL_EXEC_CALLER_CONTEXT_MALFORMED'));
expect('contextValidated=false → allowed=false', r17.allowed === false);

// 18. tokenClaims uid mismatch (spoofed)
const r18 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    callerUserId: 'user-007',
    tokenClaims: { ...validTokenClaims, uid: 'different-user' },
  },
});
expect('uid mismatch → REAL_EXEC_TOKEN_CLAIMS_SPOOFED', r18.blockedReasons.includes('REAL_EXEC_TOKEN_CLAIMS_SPOOFED'));

// 19. tokenClaims missing required field (iss)
const r19 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { uid: 'user-007', aud: 'project', iat: 1000000, exp: 1003600 }, // missing iss
  },
});
expect('missing iss claim → REAL_EXEC_TOKEN_CLAIMS_SPOOFED', r19.blockedReasons.includes('REAL_EXEC_TOKEN_CLAIMS_SPOOFED'));

// 20. tokenClaims exp <= iat (invalid token)
const r20 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { ...validTokenClaims, exp: 999999, iat: 1000000 },
  },
});
expect('exp <= iat → REAL_EXEC_TOKEN_CLAIMS_SPOOFED', r20.blockedReasons.includes('REAL_EXEC_TOKEN_CLAIMS_SPOOFED'));

// 21. tokenClaims iat is not a number
const r21 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { ...validTokenClaims, iat: 'not-a-number' },
  },
});
expect('iat not a number → REAL_EXEC_TOKEN_CLAIMS_SPOOFED', r21.blockedReasons.includes('REAL_EXEC_TOKEN_CLAIMS_SPOOFED'));

// 22. signInProvider empty string with tokenClaims → blocked
const r22 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    signInProvider: '',
    tokenClaims: validTokenClaims,
  },
});
expect('empty signInProvider with tokenClaims → REAL_EXEC_SIGN_IN_PROVIDER_MISSING', r22.blockedReasons.includes('REAL_EXEC_SIGN_IN_PROVIDER_MISSING'));

// 23. signInProvider null with tokenClaims → blocked
const r23 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    signInProvider: null,
    tokenClaims: validTokenClaims,
  },
});
expect('null signInProvider with tokenClaims → REAL_EXEC_SIGN_IN_PROVIDER_MISSING', r23.blockedReasons.includes('REAL_EXEC_SIGN_IN_PROVIDER_MISSING'));

// 24. Unknown signInProvider with tokenClaims → blocked
const r24 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    signInProvider: 'service_account', // not in allowed list
    tokenClaims: validTokenClaims,
  },
});
expect('service_account signInProvider → REAL_EXEC_SIGN_IN_PROVIDER_INVALID', r24.blockedReasons.includes('REAL_EXEC_SIGN_IN_PROVIDER_INVALID'));

// 25. signInProvider not supplied (no tokenClaims) → allowed (advisory only)
const r25 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'user-007',
    // No tokenClaims, no signInProvider — not enriched context
  },
});
expect('no tokenClaims → signInProvider not checked', r25.allowed === true);

// 26. google.com sign_in_provider → allowed
const r26 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    signInProvider: 'google.com',
    tokenClaims: validTokenClaims,
  },
});
expect('google.com signInProvider → allowed', r26.allowed === true);

// 27. ServiceAccount + no userId (both flags) → multiple blocked reasons
const r27 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: null, isServiceAccount: true, isAdminSdk: true },
});
expect('serviceAccount+adminSdk no userId → multiple reasons', r27.blockedReasons.length >= 2);
expect('serviceAccount+adminSdk → SERVICE_ACCOUNT_INSUFFICIENT', r27.blockedReasons.includes('REAL_EXEC_SERVICE_ACCOUNT_INSUFFICIENT'));
expect('serviceAccount+adminSdk → ADMIN_SDK_NOT_SUFFICIENT', r27.blockedReasons.includes('REAL_EXEC_ADMIN_SDK_NOT_SUFFICIENT'));

// 28. Default behavior: partially empty request → DENY
const r28 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  approvalId: asModelConfigApprovalId(''),
  auditTrailId: '' as AuditTrailId,
});
expect('multiple missing fields → allowed=false (default deny)', r28.allowed === false);
expect('multiple missing fields → multiple reasons', r28.blockedReasons.length >= 2);

// ─── Phase 3: Advanced forged / mismatched context ───────────────────────────

console.log('\n[Phase 3: Advanced forged / mismatched context]\n');

// 29. Forged sign_in_provider: service_account provider with otherwise valid uid → BLOCKED
const r29 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'user-007',
    signInProvider: 'service_account',
    tokenClaims: validTokenClaims,
    contextValidated: true,
  },
});
expect('service_account provider → CALLER_TYPE_PROVIDER_MISMATCH', r29.blockedReasons.includes('REAL_EXEC_CALLER_TYPE_PROVIDER_MISMATCH'));
expect('service_account provider → SIGN_IN_PROVIDER_INVALID', r29.blockedReasons.includes('REAL_EXEC_SIGN_IN_PROVIDER_INVALID'));
expect('service_account provider → blocked', r29.allowed === false);

// 30. isServiceAccount=true + service_account signInProvider + callerType=HUMAN → forged human context
const r30 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'user-007',
    isServiceAccount: true,
    signInProvider: 'service_account',
    tokenClaims: validTokenClaims,
    contextValidated: true,
  },
});
expect('isServiceAccount + service_account provider → SERVICE_ACCOUNT_FORGED_HUMAN_CONTEXT', r30.blockedReasons.includes('REAL_EXEC_SERVICE_ACCOUNT_FORGED_HUMAN_CONTEXT'));
expect('isServiceAccount + service_account provider → blocked', r30.allowed === false);

// 31. isAdminSdk=true + service_account signInProvider → admin SDK forged human context
const r31 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'user-007',
    isAdminSdk: true,
    signInProvider: 'service_account',
    tokenClaims: validTokenClaims,
    contextValidated: true,
  },
});
expect('isAdminSdk + service_account provider → ADMIN_SDK_FORGED_HUMAN_CONTEXT', r31.blockedReasons.includes('REAL_EXEC_ADMIN_SDK_FORGED_HUMAN_CONTEXT'));

// 32. token claims tenantId mismatch → TOKEN_TENANT_MISMATCH
const r32 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { ...validTokenClaims, tenantId: 'other-tenant' },
  },
});
expect('token tenantId mismatch → REAL_EXEC_TOKEN_TENANT_MISMATCH', r32.blockedReasons.includes('REAL_EXEC_TOKEN_TENANT_MISMATCH'));
expect('token tenantId mismatch → blocked', r32.allowed === false);

// 33. token claims tenantId matches request tenantId → allowed (no mismatch)
const r33 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { ...validTokenClaims, tenantId: 'tenant-007' },
  },
});
expect('token tenantId matches → no TOKEN_TENANT_MISMATCH', !r33.blockedReasons.includes('REAL_EXEC_TOKEN_TENANT_MISMATCH'));

// 34. role=admin claim without contextValidated → ROLE_CLAIM_UNTRUSTED
const r34 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'user-007',
    signInProvider: 'password',
    tokenClaims: { ...validTokenClaims, role: 'admin' },
    // contextValidated not set → undefined (not true)
  },
});
expect('role=admin without contextValidated → ROLE_CLAIM_UNTRUSTED', r34.blockedReasons.includes('REAL_EXEC_ROLE_CLAIM_UNTRUSTED'));
expect('role=admin without contextValidated → blocked', r34.allowed === false);

// 35. role=admin WITH contextValidated=true → role claim accepted (not blocked by ROLE_CLAIM_UNTRUSTED)
const r35 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { ...validTokenClaims, role: 'admin' },
    contextValidated: true,
  },
});
expect('role=admin with contextValidated=true → no ROLE_CLAIM_UNTRUSTED', !r35.blockedReasons.includes('REAL_EXEC_ROLE_CLAIM_UNTRUSTED'));
expect('role=admin with contextValidated=true → allowed', r35.allowed === true);

// 36. malicious injected override=true claim → TOKEN_CLAIMS_SPOOFED
const r36 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { ...validTokenClaims, override: true },
  },
});
expect('override=true injected claim → TOKEN_CLAIMS_SPOOFED', r36.blockedReasons.includes('REAL_EXEC_TOKEN_CLAIMS_SPOOFED'));

// 37. malicious bypass=true injected → TOKEN_CLAIMS_SPOOFED
const r37 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    ...validRequest.callerContext,
    tokenClaims: { ...validTokenClaims, bypass: true },
  },
});
expect('bypass=true injected claim → TOKEN_CLAIMS_SPOOFED', r37.blockedReasons.includes('REAL_EXEC_TOKEN_CLAIMS_SPOOFED'));

// 38. uid looks like service account but provider says google.com → PROVIDER_USER_MISMATCH
const r38 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'svc@project.iam.gserviceaccount.com',
    signInProvider: 'google.com',
    tokenClaims: {
      uid: 'svc@project.iam.gserviceaccount.com',
      iss: 'https://securetoken.google.com/project',
      aud: 'project',
      iat: 1000000,
      exp: 1003600,
    },
    contextValidated: true,
  },
});
expect('gserviceaccount uid with google.com provider → PROVIDER_USER_MISMATCH', r38.blockedReasons.includes('REAL_EXEC_PROVIDER_USER_MISMATCH'));

// 39. partial valid claims + malicious admin=true without contextValidated → ROLE_CLAIM_UNTRUSTED
const r39 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: {
    callerType: 'HUMAN',
    callerUserId: 'user-007',
    signInProvider: 'password',
    tokenClaims: { ...validTokenClaims, admin: true },
    contextValidated: false,
  },
});
expect('admin=true + contextValidated=false → CALLER_CONTEXT_MALFORMED', r39.blockedReasons.includes('REAL_EXEC_CALLER_CONTEXT_MALFORMED'));
expect('admin=true without contextValidated → ROLE_CLAIM_UNTRUSTED', r39.blockedReasons.includes('REAL_EXEC_ROLE_CLAIM_UNTRUSTED'));

// 40. default deny — completely missing request fields stay DENY
const r40 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  approvalId: asModelConfigApprovalId(''),
  applyToken: asApplyToken(''),
  auditTrailId: '' as AuditTrailId,
});
expect('multiple missing fields → default deny', r40.allowed === false);
expect('multiple missing fields → at least 3 reasons', r40.blockedReasons.length >= 3);

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1+2+3 Guard (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
