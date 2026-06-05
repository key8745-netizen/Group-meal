/**
 * Feature 007 Phase 1: Default-Deny Guard tests
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

console.log('\n=== Feature 007 Phase 1: Default-Deny Guard ===\n');

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
  },
};

// 1. Valid human caller passes
const r1 = validateRealModelConfigApplyEntrance(validRequest);
expect('valid human caller → allowed=true', r1.allowed === true);
expect('valid human caller → 0 blockedReasons', r1.blockedReasons.length === 0);

// 2. AI caller blocked
const r2 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { ...validRequest.callerContext, callerType: 'AI' },
});
expect('AI caller → REAL_EXEC_AI_CALLER_BLOCKED', r2.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'));
expect('AI caller → allowed=false', r2.allowed === false);

// 3. Unknown callerType blocked
const r3 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { ...validRequest.callerContext, callerType: 'UNKNOWN' },
});
expect('UNKNOWN callerType → REAL_EXEC_UNKNOWN_CALLER_TYPE', r3.blockedReasons.includes('REAL_EXEC_UNKNOWN_CALLER_TYPE'));

// 4. Missing caller context blocked
const r4 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: null as unknown as RealModelConfigApplyRequest['callerContext'],
});
expect('null callerContext → REAL_EXEC_MISSING_CALLER_CONTEXT', r4.blockedReasons.includes('REAL_EXEC_MISSING_CALLER_CONTEXT'));

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

// 7. Missing human userId blocked
const r7 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: '' },
});
expect('empty callerUserId → REAL_EXEC_MISSING_HUMAN_USER_ID', r7.blockedReasons.includes('REAL_EXEC_MISSING_HUMAN_USER_ID'));

// 8. Tenant mismatch blocks first (early exit)
const r8 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  tenantId: '' as TenantId,
});
expect('missing tenantId → REAL_EXEC_TENANT_MISMATCH', r8.blockedReasons.includes('REAL_EXEC_TENANT_MISMATCH'));
expect('missing tenantId → early exit (only 1 reason)', r8.blockedReasons.length === 1);

// 9. Missing approvalId blocked
const r9 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  approvalId: asModelConfigApprovalId(''),
});
expect('missing approvalId → REAL_EXEC_MISSING_APPROVAL_ID', r9.blockedReasons.includes('REAL_EXEC_MISSING_APPROVAL_ID'));

// 10. Missing auditTrailId blocked
const r10 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  auditTrailId: '' as AuditTrailId,
});
expect('missing auditTrailId → REAL_EXEC_MISSING_AUDIT_TRAIL_ID', r10.blockedReasons.includes('REAL_EXEC_MISSING_AUDIT_TRAIL_ID'));

// 11. Missing expectedCurrentVersion blocked
const r11 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  expectedCurrentVersion: asConfigVersion(''),
});
expect('missing expectedCurrentVersion → REAL_EXEC_MISSING_EXPECTED_VERSION', r11.blockedReasons.includes('REAL_EXEC_MISSING_EXPECTED_VERSION'));

// 12. Missing applyToken blocked
const r12 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  applyToken: asApplyToken(''),
});
expect('missing applyToken → REAL_EXEC_MISSING_APPLY_TOKEN', r12.blockedReasons.includes('REAL_EXEC_MISSING_APPLY_TOKEN'));

// 13. Admin SDK + human userId is allowed
const r13 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  callerContext: { callerType: 'HUMAN', callerUserId: 'user-007', isAdminSdk: true },
});
expect('AdminSdk + human userId → allowed=true', r13.allowed === true);

// 14. ServiceAccount + human userId is allowed
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
expect('AI + AdminSdk → REAL_EXEC_AI_CALLER_BLOCKED', r15.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'));
expect('AI + AdminSdk → allowed=false', r15.allowed === false);

// 16. Missing sourceRecommendationId blocked
const r16 = validateRealModelConfigApplyEntrance({
  ...validRequest,
  sourceRecommendationId: asModelConfigRecommendationId(''),
});
expect('missing sourceRecommendationId → REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID', r16.blockedReasons.includes('REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID'));

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1 Guard (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
