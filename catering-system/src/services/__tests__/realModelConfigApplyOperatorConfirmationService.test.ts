/**
 * Feature 009 Phase 5B: Operator Confirmation + Allowlist tests
 * Pure runner — no test framework. npx tsx from repo root.
 */
import {
  validateOperatorConfirmation,
  validateTenantAllowlist,
  validateOperatorAllowlist,
} from '../realModelConfigApplyOperatorConfirmationService';
import type {
  OperatorConfirmation, OperatorConfirmationExpectation, TenantAllowlist, OperatorAllowlist,
} from '../realModelConfigApplyOperatorConfirmationService';
import type { TenantId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId, asConfigVersion, asDiffHash, asApplyToken,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5B: Operator Confirmation + Allowlist ===\n');

const tenantId = 'tenant-5b' as TenantId;
const otherTenant = 'tenant-other' as TenantId;
const approvalId = asModelConfigApprovalId('approval-5b');
const otherApprovalId = asModelConfigApprovalId('approval-other');
const applyToken = asApplyToken('token-5b');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const hashBefore = asDiffHash('hash-before');
const hashAfter = asDiffHash('hash-after');
const hashDiff = asDiffHash('hash-diff');

const expectation: OperatorConfirmationExpectation = {
  tenantId, approvalId, applyToken,
  expectedCurrentVersion: v1,
  configBeforeHash: hashBefore,
  configAfterHash: hashAfter,
  diffHash: hashDiff,
  operatorUserId: 'operator-1',
};

const validConfirmation: OperatorConfirmation = {
  _kind: 'f009_phase5b_operator_confirmation',
  tenantId, approvalId, applyToken,
  expectedCurrentVersion: v1,
  configBeforeHash: hashBefore,
  configAfterHash: hashAfter,
  diffHash: hashDiff,
  operatorUserId: 'operator-1',
  timestamp: '2026-06-08T12:00:00Z',
};

console.log('[Operator Confirmation]\n');

const c1 = validateOperatorConfirmation(validConfirmation, expectation);
expect('valid confirmation passes', c1.valid === true);
expect('valid confirmation → no blocked reasons', c1.blockedReasons.length === 0);

const c2 = validateOperatorConfirmation(null, expectation);
expect('missing confirmation BLOCKED', c2.blockedReasons.includes('F009_PHASE5B_OPERATOR_CONFIRMATION_MISSING'));
expect('missing confirmation → invalid', c2.valid === false);

const c3 = validateOperatorConfirmation({ ...validConfirmation, tenantId: '' as unknown as TenantId }, expectation);
expect('malformed confirmation (blank tenantId) BLOCKED', c3.blockedReasons.includes('F009_PHASE5B_OPERATOR_CONFIRMATION_MALFORMED'));

const c4 = validateOperatorConfirmation({ ...validConfirmation, timestamp: 'not-a-date' }, expectation);
expect('malformed confirmation (bad timestamp) BLOCKED', c4.blockedReasons.includes('F009_PHASE5B_OPERATOR_CONFIRMATION_MALFORMED'));

const c5 = validateOperatorConfirmation({ ...validConfirmation, _kind: 'wrong_kind' as unknown as 'f009_phase5b_operator_confirmation' }, expectation);
expect('malformed confirmation (wrong _kind) BLOCKED', c5.blockedReasons.includes('F009_PHASE5B_OPERATOR_CONFIRMATION_MALFORMED'));

// field-by-field mismatches
const m1 = validateOperatorConfirmation({ ...validConfirmation, tenantId: otherTenant }, expectation);
expect('tenant mismatch BLOCKED', m1.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_TENANT_MISMATCH'));

const m2 = validateOperatorConfirmation({ ...validConfirmation, approvalId: otherApprovalId }, expectation);
expect('approvalId mismatch BLOCKED', m2.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_APPROVAL_MISMATCH'));

const m3 = validateOperatorConfirmation({ ...validConfirmation, applyToken: asApplyToken('different-token') }, expectation);
expect('applyToken mismatch BLOCKED', m3.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_APPLY_TOKEN_MISMATCH'));

const m4 = validateOperatorConfirmation({ ...validConfirmation, expectedCurrentVersion: v2 }, expectation);
expect('expectedCurrentVersion mismatch BLOCKED', m4.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_VERSION_MISMATCH'));

const m5 = validateOperatorConfirmation({ ...validConfirmation, configBeforeHash: asDiffHash('different') }, expectation);
expect('configBeforeHash mismatch BLOCKED', m5.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_BEFORE_HASH_MISMATCH'));

const m6 = validateOperatorConfirmation({ ...validConfirmation, configAfterHash: asDiffHash('different') }, expectation);
expect('configAfterHash mismatch BLOCKED', m6.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_AFTER_HASH_MISMATCH'));

const m7 = validateOperatorConfirmation({ ...validConfirmation, diffHash: asDiffHash('different') }, expectation);
expect('diffHash mismatch BLOCKED', m7.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_DIFF_HASH_MISMATCH'));

const m8 = validateOperatorConfirmation({ ...validConfirmation, operatorUserId: 'operator-2' }, expectation);
expect('operatorUserId mismatch BLOCKED', m8.blockedReasons.includes('F009_PHASE5B_CONFIRMATION_OPERATOR_MISMATCH'));

// multiple mismatches collected
const m9 = validateOperatorConfirmation({ ...validConfirmation, tenantId: otherTenant, operatorUserId: 'operator-2' }, expectation);
expect('multiple mismatches collected (>= 2 reasons)', m9.blockedReasons.length >= 2);
expect('multiple mismatches → invalid', m9.valid === false);

console.log('\n[Tenant Allowlist]\n');

const tenantAllowlist: TenantAllowlist = {
  _kind: 'f009_phase5b_tenant_allowlist',
  present: true,
  loadedSuccessfully: true,
  tenantIds: [tenantId],
};

const t1 = validateTenantAllowlist(tenantAllowlist, tenantId);
expect('tenant allowlisted passes', t1.allowed === true);

const t2 = validateTenantAllowlist(tenantAllowlist, otherTenant);
expect('tenant not allowlisted BLOCKED', t2.blockedReasons.includes('F009_PHASE5B_TENANT_NOT_ALLOWLISTED'));

const t3 = validateTenantAllowlist(null, tenantId);
expect('missing tenant allowlist BLOCKED', t3.blockedReasons.includes('F009_PHASE5B_TENANT_ALLOWLIST_MISSING'));

const t4 = validateTenantAllowlist({ ...tenantAllowlist, present: false }, tenantId);
expect('tenant allowlist present=false → missing BLOCKED', t4.blockedReasons.includes('F009_PHASE5B_TENANT_ALLOWLIST_MISSING'));

const t5 = validateTenantAllowlist({ ...tenantAllowlist, loadedSuccessfully: false }, tenantId);
expect('tenant allowlist failed to load BLOCKED', t5.blockedReasons.includes('F009_PHASE5B_TENANT_ALLOWLIST_FAILED'));

console.log('\n[Operator Allowlist]\n');

const operatorAllowlist: OperatorAllowlist = {
  _kind: 'f009_phase5b_operator_allowlist',
  present: true,
  loadedSuccessfully: true,
  operatorUserIds: ['operator-1'],
};

const o1 = validateOperatorAllowlist(operatorAllowlist, 'operator-1');
expect('operator allowlisted passes', o1.allowed === true);

const o2 = validateOperatorAllowlist(operatorAllowlist, 'operator-2');
expect('operator not allowlisted BLOCKED', o2.blockedReasons.includes('F009_PHASE5B_OPERATOR_NOT_ALLOWLISTED'));

const o3 = validateOperatorAllowlist(null, 'operator-1');
expect('missing operator allowlist BLOCKED', o3.blockedReasons.includes('F009_PHASE5B_OPERATOR_ALLOWLIST_MISSING'));

const o4 = validateOperatorAllowlist({ ...operatorAllowlist, present: false }, 'operator-1');
expect('operator allowlist present=false → missing BLOCKED', o4.blockedReasons.includes('F009_PHASE5B_OPERATOR_ALLOWLIST_MISSING'));

const o5 = validateOperatorAllowlist({ ...operatorAllowlist, loadedSuccessfully: false }, 'operator-1');
expect('operator allowlist failed to load BLOCKED', o5.blockedReasons.includes('F009_PHASE5B_OPERATOR_ALLOWLIST_FAILED'));

// admin/service role never substitutes — allowlist driven purely by ID list
const o6 = validateOperatorAllowlist({ ...operatorAllowlist, operatorUserIds: [] }, 'operator-1');
expect('empty allowlist → operator not allowlisted BLOCKED (no implicit admin grant)', o6.blockedReasons.includes('F009_PHASE5B_OPERATOR_NOT_ALLOWLISTED'));

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5B Operator Confirmation + Allowlist (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
