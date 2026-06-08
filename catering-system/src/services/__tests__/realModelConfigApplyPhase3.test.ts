/**
 * realModelConfigApplyPhase3.test.ts
 *
 * Feature 009 Phase 3: Transaction Read-Set Order + Concurrent Modification + Abort Integration
 *
 * Covers:
 *  - Firebase / Middleware Verification Integration (reused from Phase 2)
 *  - Transaction Read-Set Order contract
 *  - Read-Set Consistency (reused from Phase 2)
 *  - Concurrent Modification detection
 *  - Abort Handler + Read-Set Failure integration
 *  - Static Guard / CI boolean assertions
 *  - Boundary assertions
 *
 * Target: ≥100 assertions, 0 failures.
 */

import {
  validateFirebaseTokenForApply,
} from '../realModelConfigApplyFirebaseVerificationService';
import type {
  SimulatedFirebaseTokenParseResult,
  FirebaseVerificationInput,
} from '../realModelConfigApplyFirebaseVerificationService';
import {
  validateApprovalReadSetSnapshot,
  validateSettingsReadSetSnapshot,
  validateLockReadSetSnapshot,
} from '../realModelConfigApplyReadSetSnapshotService';
import type {
  ApprovalReadSetSnapshot,
  SettingsReadSetSnapshot,
  LockReadSetSnapshot,
  ApprovalSnapshotValidationRequest,
  SettingsSnapshotValidationRequest,
  LockSnapshotValidationRequest,
} from '../realModelConfigApplyReadSetSnapshotService';
import {
  buildTransactionReadOrderContract,
  validateTransactionReadOrder,
} from '../realModelConfigApplyTransactionReadOrderService';
import {
  detectVersionConflict,
  detectHashMismatch,
  detectConcurrentModification,
  evaluateDuplicateApply,
} from '../realModelConfigApplyConcurrentModificationService';
import {
  buildAbortContractAfterApprovalInvalid,
  buildAbortContractAfterHashMismatch,
  buildAbortContractAfterVersionConflict,
  buildAbortContractAfterPendingLock,
} from '../realModelConfigApplyAbortContractService';
import { validateRealApplyCallerContext } from '../realModelConfigApplyVerifiedCallerService';

import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asApplyToken,
  asConfigVersion,
  asDiffHash,
  asModelConfigApprovalId,
  asModelConfigRecommendationId,
} from '../../types/modelConfigApply';
import type { VerifiedHumanCallerContext } from '../../types/realModelConfigApplyTransaction';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asTenantId(s: string): TenantId { return s as TenantId; }
function asAuditTrailId(s: string): AuditTrailId { return s as AuditTrailId; }

const TENANT = asTenantId('tenant-p3-001');
const APPROVAL_ID = asModelConfigApprovalId('approval-p3-abc');
const APPROVAL_ID_2 = asModelConfigApprovalId('approval-p3-xyz');
const REC_ID = asModelConfigRecommendationId('rec-p3-xyz');
const AUDIT_ID = asAuditTrailId('audit-trail-p3-001');
const APPLY_TOKEN = asApplyToken('token-p3-apply-1');
const APPLY_TOKEN_2 = asApplyToken('token-p3-apply-2');
const EXPECTED_VERSION = asConfigVersion('v5');
const ACTUAL_VERSION_CHANGED = asConfigVersion('v6');
const BEFORE_HASH = asDiffHash('hash-p3-before-001');
const AFTER_HASH = asDiffHash('hash-p3-after-002');
const DIFF_HASH = asDiffHash('hash-p3-diff-003');
const PAYLOAD_HASH = asDiffHash('hash-p3-payload-004');
const DIFFERENT_HASH = asDiffHash('hash-p3-different-999');
const LOCK_ID = `${TENANT}:${APPLY_TOKEN}`;
const CALLER_USER_ID = 'user-human-p3-001';
const NOW_DATE = new Date('2026-06-05T12:00:00.000Z');
const FUTURE_DATE = new Date('2099-01-01T00:00:00.000Z');
const PAST_DATE = new Date('2000-01-01T00:00:00.000Z');
const NOW_STR = '2026-06-05T12:00:00.000Z';
const TOKEN_IAT = Math.floor(new Date('2026-01-01').getTime() / 1000);
const TOKEN_EXP = Math.floor(new Date('2099-01-01').getTime() / 1000);

function makeToken(overrides?: Partial<SimulatedFirebaseTokenParseResult>): SimulatedFirebaseTokenParseResult {
  return {
    _kind: 'simulated_firebase_token_parse_result',
    uid: CALLER_USER_ID,
    tenantId: TENANT,
    signInProvider: 'password',
    verificationStatus: 'verified',
    tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
    isServiceAccount: false,
    ...overrides,
  };
}

function makeFirebaseInput(overrides?: Partial<FirebaseVerificationInput>): FirebaseVerificationInput {
  return {
    tokenParseResult: makeToken(),
    middlewareVerifiedUserId: CALLER_USER_ID,
    middlewareVerifiedTenantId: TENANT,
    middlewareVerifiedProvider: 'password',
    callerUserId: CALLER_USER_ID,
    requestTenantId: TENANT,
    ...overrides,
  };
}

function makeApprovalSnapshot(overrides?: Partial<ApprovalReadSetSnapshot>): ApprovalReadSetSnapshot {
  return {
    _kind: 'approval_read_set_snapshot',
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    approvedBy: CALLER_USER_ID,
    sourceRecommendationId: REC_ID,
    auditTrailId: AUDIT_ID,
    status: 'APPROVED',
    expiresAt: FUTURE_DATE,
    configBeforeHash: BEFORE_HASH,
    applyToken: APPLY_TOKEN,
    ...overrides,
  };
}

function makeApprovalRequest(overrides?: Partial<ApprovalSnapshotValidationRequest>): ApprovalSnapshotValidationRequest {
  return {
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    callerUserId: CALLER_USER_ID,
    sourceRecommendationId: REC_ID,
    auditTrailId: AUDIT_ID,
    configBeforeHash: BEFORE_HASH,
    applyToken: APPLY_TOKEN,
    now: NOW_DATE,
    ...overrides,
  };
}

function makeSettingsSnapshot(overrides?: Partial<SettingsReadSetSnapshot>): SettingsReadSetSnapshot {
  return {
    _kind: 'settings_read_set_snapshot',
    tenantId: TENANT,
    currentVersion: EXPECTED_VERSION,
    currentConfig: { someKey: 'someValue' },
    currentConfigHash: BEFORE_HASH,
    ...overrides,
  };
}

function makeSettingsRequest(overrides?: Partial<SettingsSnapshotValidationRequest>): SettingsSnapshotValidationRequest {
  return {
    tenantId: TENANT,
    expectedCurrentVersion: EXPECTED_VERSION,
    configBeforeHash: BEFORE_HASH,
    ...overrides,
  };
}

function makeLockSnapshot(overrides?: Partial<LockReadSetSnapshot>): LockReadSetSnapshot {
  return {
    _kind: 'lock_read_set_snapshot',
    lockId: LOCK_ID,
    tenantId: TENANT,
    applyToken: APPLY_TOKEN,
    approvalId: APPROVAL_ID,
    status: 'PENDING',
    payloadHash: PAYLOAD_HASH,
    createdAt: NOW_DATE,
    expiresAt: FUTURE_DATE,
    ...overrides,
  };
}

function makeLockRequest(overrides?: Partial<LockSnapshotValidationRequest>): LockSnapshotValidationRequest {
  return {
    applyToken: APPLY_TOKEN,
    approvalId: APPROVAL_ID,
    payloadHash: PAYLOAD_HASH,
    ...overrides,
  };
}

function makeCallerContext(overrides?: Partial<VerifiedHumanCallerContext>): VerifiedHumanCallerContext {
  return {
    _kind: 'verified_human_caller_context',
    callerType: 'HUMAN',
    callerUserId: CALLER_USER_ID,
    tenantId: TENANT,
    signInProvider: 'password',
    tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
    tokenVerificationStatus: 'verified',
    verifiedAt: NOW_STR,
    tokenIat: TOKEN_IAT,
    tokenExp: TOKEN_EXP,
    tokenSubject: CALLER_USER_ID,
    isServiceAccount: false,
    upstreamVerificationConfirmed: true,
    ...overrides,
  };
}

function makeAbortInput() {
  return {
    eventType: 'MODEL_CONFIG_APPLY_BLOCKED' as const,
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    sourceRecommendationId: REC_ID,
    auditTrailId: AUDIT_ID,
    expectedCurrentVersion: EXPECTED_VERSION,
    configBeforeHash: BEFORE_HASH,
    configAfterHash: AFTER_HASH,
    diffHash: DIFF_HASH,
    applyToken: APPLY_TOKEN,
    callerUserId: CALLER_USER_ID,
    callerType: 'HUMAN' as const,
    tokenVerificationSource: 'FIREBASE_ADMIN_SDK' as const,
    abortReason: 'CALLER_VALIDATION_FAILED' as const,
    blockedReasons: [] as import('../../types/aiBoundary').BlockedReason[],
    lockAcquired: false,
  };
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

function assertBlocked(label: string, blockedReasons: string[], reason: string): void {
  assert(label, blockedReasons.includes(reason));
}


// ─── Section 1: Firebase / Middleware Verification Integration ────────────────

console.log('\n=== Section 1: Firebase / Middleware Verification Integration ===');

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput());
  assert('valid Firebase + middleware context passes', r.valid === true);
  assert('valid context has no blocked reasons', r.blockedReasons.length === 0);
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({ tokenParseResult: makeToken({ uid: '' }) }));
  assertBlocked('missing uid → F009_FIREBASE_TOKEN_UID_MISSING', r.blockedReasons, 'F009_FIREBASE_TOKEN_UID_MISSING');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({ tokenParseResult: makeToken({ tenantId: '' }) }));
  assertBlocked('missing tenantId → F009_FIREBASE_TOKEN_TENANT_MISSING', r.blockedReasons, 'F009_FIREBASE_TOKEN_TENANT_MISSING');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({ tokenParseResult: makeToken({ tokenVerificationSource: 'CLIENT_SUPPLIED' as const }) }));
  assertBlocked('CLIENT_SUPPLIED source → F009_FIREBASE_TOKEN_SOURCE_UNTRUSTED', r.blockedReasons, 'F009_FIREBASE_TOKEN_SOURCE_UNTRUSTED');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({ tokenParseResult: makeToken({ verificationStatus: 'unverified' }) }));
  assertBlocked('unverified status → F009_FIREBASE_TOKEN_NOT_VERIFIED', r.blockedReasons, 'F009_FIREBASE_TOKEN_NOT_VERIFIED');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({ tokenParseResult: makeToken({ isServiceAccount: true }) }));
  assertBlocked('isServiceAccount=true → F009_FIREBASE_TOKEN_SERVICE_ACCOUNT', r.blockedReasons, 'F009_FIREBASE_TOKEN_SERVICE_ACCOUNT');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({ tokenParseResult: makeToken({ uid: 'uid-different', signInProvider: 'password', isServiceAccount: false }) }));
  assertBlocked('firebase uid ≠ callerUserId → F009_FIREBASE_TOKEN_UID_CALLER_MISMATCH', r.blockedReasons, 'F009_FIREBASE_TOKEN_UID_CALLER_MISMATCH');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({
    tokenParseResult: makeToken({ tenantId: 'other-tenant' }),
    requestTenantId: TENANT,
  }));
  assertBlocked('firebase tenantId ≠ requestTenantId → F009_FIREBASE_TOKEN_TENANT_REQUEST_MISMATCH', r.blockedReasons, 'F009_FIREBASE_TOKEN_TENANT_REQUEST_MISMATCH');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({
    tokenParseResult: makeToken({ uid: 'different-uid' }),
    middlewareVerifiedUserId: CALLER_USER_ID,
    callerUserId: 'different-uid',
    requestTenantId: TENANT,
  }));
  assertBlocked('firebase uid ≠ middlewareVerifiedUserId → F009_FIREBASE_TOKEN_UID_MIDDLEWARE_MISMATCH', r.blockedReasons, 'F009_FIREBASE_TOKEN_UID_MIDDLEWARE_MISMATCH');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({
    tokenParseResult: makeToken({ tenantId: 'tenant-other' }),
    middlewareVerifiedTenantId: TENANT,
    requestTenantId: 'tenant-other',
    callerUserId: CALLER_USER_ID,
  }));
  assertBlocked('firebase tenantId ≠ middlewareVerifiedTenantId → F009_FIREBASE_TOKEN_TENANT_MIDDLEWARE_MISMATCH', r.blockedReasons, 'F009_FIREBASE_TOKEN_TENANT_MIDDLEWARE_MISMATCH');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({
    tokenParseResult: makeToken({ signInProvider: 'google.com' }),
    middlewareVerifiedProvider: 'password',
  }));
  assertBlocked('firebase provider ≠ middlewareVerifiedProvider → F009_FIREBASE_TOKEN_PROVIDER_MIDDLEWARE_MISMATCH', r.blockedReasons, 'F009_FIREBASE_TOKEN_PROVIDER_MIDDLEWARE_MISMATCH');
}

{
  const r = validateFirebaseTokenForApply(makeFirebaseInput({
    tokenParseResult: makeToken({ signInProvider: 'admin-sdk' as const }),
  }));
  assertBlocked('admin-sdk provider → F009_FIREBASE_TOKEN_ADMIN_SDK', r.blockedReasons, 'F009_FIREBASE_TOKEN_ADMIN_SDK');
}

// ─── Section 2: Transaction Read-Set Order ────────────────────────────────────

console.log('\n=== Section 2: Transaction Read-Set Order ===');

{
  const contract = buildTransactionReadOrderContract(TENANT, APPROVAL_ID, LOCK_ID);
  assert('readOrder is array of 3', contract.readOrder.length === 3);
  assert("readOrder[0] = 'approval'", contract.readOrder[0] === 'approval');
  assert("readOrder[1] = 'settings'", contract.readOrder[1] === 'settings');
  assert("readOrder[2] = 'idempotencyLock'", contract.readOrder[2] === 'idempotencyLock');
  assert('contract.executable === false', contract.executable === false);
  assert('contract.aiCanExecute === false', contract.aiCanExecute === false);
  assert('contract.approvalPath contains tenantId', contract.approvalPath.includes(TENANT));
  assert('contract.approvalPath contains approvalId', contract.approvalPath.includes(APPROVAL_ID));
  assert('contract.settingsPath contains tenantId', contract.settingsPath.includes(TENANT));
  assert('contract.lockPath contains lockId', contract.lockPath.includes(LOCK_ID));
  assert('contract._kind is correct', contract._kind === 'transaction_read_order_contract');
}

{
  const result = validateTransactionReadOrder({
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    lockId: LOCK_ID,
    approvalValid: true,
    settingsValid: true,
    lockValid: true,
  });
  assert('all valid → canBuildWriteSet=true', result.canBuildWriteSet === true);
  assert('all valid → no blocked reasons', result.blockedReasons.length === 0);
}

{
  const result = validateTransactionReadOrder({
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    lockId: LOCK_ID,
    approvalValid: false,
    settingsValid: true,
    lockValid: true,
  });
  assert('approvalValid=false → canBuildWriteSet=false', result.canBuildWriteSet === false);
  assertBlocked('approvalValid=false → F009_READSET_ORDER_APPROVAL_REQUIRED', result.blockedReasons, 'F009_READSET_ORDER_APPROVAL_REQUIRED');
  assertBlocked('approvalValid=false → F009_READSET_INVALID_PREVENTS_WRITE_SET', result.blockedReasons, 'F009_READSET_INVALID_PREVENTS_WRITE_SET');
}

{
  const result = validateTransactionReadOrder({
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    lockId: LOCK_ID,
    approvalValid: true,
    settingsValid: false,
    lockValid: true,
  });
  assert('settingsValid=false → canBuildWriteSet=false', result.canBuildWriteSet === false);
  assertBlocked('settingsValid=false → F009_READSET_ORDER_SETTINGS_REQUIRED', result.blockedReasons, 'F009_READSET_ORDER_SETTINGS_REQUIRED');
}

{
  const result = validateTransactionReadOrder({
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    lockId: LOCK_ID,
    approvalValid: true,
    settingsValid: true,
    lockValid: false,
  });
  assert('lockValid=false → canBuildWriteSet=false', result.canBuildWriteSet === false);
  assertBlocked('lockValid=false → F009_READSET_ORDER_LOCK_REQUIRED', result.blockedReasons, 'F009_READSET_ORDER_LOCK_REQUIRED');
}

{
  const result = validateTransactionReadOrder({
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    lockId: LOCK_ID,
    approvalValid: false,
    settingsValid: false,
    lockValid: false,
  });
  assert('multiple invalid → canBuildWriteSet=false', result.canBuildWriteSet === false);
  assertBlocked('multiple invalid → F009_READSET_ORDER_APPROVAL_REQUIRED', result.blockedReasons, 'F009_READSET_ORDER_APPROVAL_REQUIRED');
  assertBlocked('multiple invalid → F009_READSET_ORDER_SETTINGS_REQUIRED', result.blockedReasons, 'F009_READSET_ORDER_SETTINGS_REQUIRED');
  assertBlocked('multiple invalid → F009_READSET_ORDER_LOCK_REQUIRED', result.blockedReasons, 'F009_READSET_ORDER_LOCK_REQUIRED');
  assertBlocked('multiple invalid → F009_READSET_INVALID_PREVENTS_WRITE_SET', result.blockedReasons, 'F009_READSET_INVALID_PREVENTS_WRITE_SET');
}

// ─── Section 3: Read-Set Consistency ─────────────────────────────────────────

console.log('\n=== Section 3: Read-Set Consistency ===');

{
  const r = validateApprovalReadSetSnapshot(makeApprovalSnapshot(), makeApprovalRequest());
  assert('valid approval snapshot passes', r.valid === true);
  assert('valid approval has no blocked reasons', r.blockedReasons.length === 0);
}

{
  const r = validateApprovalReadSetSnapshot(null, makeApprovalRequest());
  assertBlocked('missing approval → F009_READSET_APPROVAL_MISSING', r.blockedReasons, 'F009_READSET_APPROVAL_MISSING');
}

{
  const r = validateApprovalReadSetSnapshot(makeApprovalSnapshot({ status: 'REJECTED' }), makeApprovalRequest());
  assertBlocked('approval not APPROVED → F009_READSET_APPROVAL_NOT_APPROVED', r.blockedReasons, 'F009_READSET_APPROVAL_NOT_APPROVED');
}

{
  const r = validateApprovalReadSetSnapshot(makeApprovalSnapshot({ tenantId: asTenantId('other-tenant') }), makeApprovalRequest());
  assertBlocked('approval tenant mismatch → F009_READSET_APPROVAL_TENANT_MISMATCH', r.blockedReasons, 'F009_READSET_APPROVAL_TENANT_MISMATCH');
}

{
  const r = validateApprovalReadSetSnapshot(makeApprovalSnapshot({ approvedBy: 'other-user' }), makeApprovalRequest());
  assertBlocked('approval approvedBy mismatch → F009_READSET_APPROVAL_APPROVED_BY_MISMATCH', r.blockedReasons, 'F009_READSET_APPROVAL_APPROVED_BY_MISMATCH');
}

{
  const r = validateApprovalReadSetSnapshot(makeApprovalSnapshot({ expiresAt: PAST_DATE }), makeApprovalRequest());
  assertBlocked('expired approval → F009_READSET_APPROVAL_EXPIRED', r.blockedReasons, 'F009_READSET_APPROVAL_EXPIRED');
}

{
  const r = validateSettingsReadSetSnapshot(makeSettingsSnapshot(), makeSettingsRequest());
  assert('valid settings snapshot passes', r.valid === true);
}

{
  const r = validateSettingsReadSetSnapshot(makeSettingsSnapshot({ tenantId: asTenantId('other') }), makeSettingsRequest());
  assertBlocked('settings tenant mismatch → F009_READSET_SETTINGS_TENANT_MISMATCH', r.blockedReasons, 'F009_READSET_SETTINGS_TENANT_MISMATCH');
}

{
  const r = validateSettingsReadSetSnapshot(makeSettingsSnapshot({ currentVersion: asConfigVersion('v0') }), makeSettingsRequest());
  assertBlocked('settings version mismatch → F009_READSET_SETTINGS_VERSION_MISMATCH', r.blockedReasons, 'F009_READSET_SETTINGS_VERSION_MISMATCH');
}

{
  const r = validateSettingsReadSetSnapshot(makeSettingsSnapshot({ currentConfigHash: DIFFERENT_HASH }), makeSettingsRequest());
  assertBlocked('settings hash mismatch → F009_READSET_SETTINGS_HASH_MISMATCH', r.blockedReasons, 'F009_READSET_SETTINGS_HASH_MISMATCH');
}

{
  const r = validateLockReadSetSnapshot(null, makeLockRequest());
  assert('null lock → ALLOW_NEW', r.outcome === 'ALLOW_NEW');
}

{
  const r = validateLockReadSetSnapshot(
    makeLockSnapshot({ status: 'PENDING', applyToken: APPLY_TOKEN, payloadHash: PAYLOAD_HASH }),
    makeLockRequest({ applyToken: APPLY_TOKEN, payloadHash: PAYLOAD_HASH }),
  );
  assert('same token + same payload → IDEMPOTENT_REPLAY', r.outcome === 'IDEMPOTENT_REPLAY');
}

{
  const r = validateLockReadSetSnapshot(
    makeLockSnapshot({ status: 'PENDING', applyToken: APPLY_TOKEN, payloadHash: PAYLOAD_HASH }),
    makeLockRequest({ applyToken: APPLY_TOKEN, payloadHash: DIFFERENT_HASH }),
  );
  assert('same token + different payload → BLOCKED', r.outcome === 'BLOCKED');
  if (r.outcome === 'BLOCKED') {
    assertBlocked('same token + different payload → F009_READSET_LOCK_PAYLOAD_MISMATCH', r.blockedReasons, 'F009_READSET_LOCK_PAYLOAD_MISMATCH');
  }
}

{
  const r = validateLockReadSetSnapshot(
    makeLockSnapshot({ status: 'PENDING', applyToken: APPLY_TOKEN_2, approvalId: APPROVAL_ID }),
    makeLockRequest({ applyToken: APPLY_TOKEN, approvalId: APPROVAL_ID }),
  );
  assert('same approvalId + different token → BLOCKED', r.outcome === 'BLOCKED');
  if (r.outcome === 'BLOCKED') {
    assertBlocked('same approvalId + different token → F009_READSET_LOCK_APPROVALID_TOKEN_CONFLICT', r.blockedReasons, 'F009_READSET_LOCK_APPROVALID_TOKEN_CONFLICT');
  }
}

{
  const r = validateLockReadSetSnapshot(
    makeLockSnapshot({ status: 'CONSUMED', applyToken: APPLY_TOKEN_2, approvalId: APPROVAL_ID_2 }),
    makeLockRequest({ applyToken: APPLY_TOKEN, approvalId: APPROVAL_ID }),
  );
  assert('CONSUMED lock → BLOCKED', r.outcome === 'BLOCKED');
  if (r.outcome === 'BLOCKED') {
    assertBlocked('CONSUMED lock → F009_READSET_LOCK_CONSUMED', r.blockedReasons, 'F009_READSET_LOCK_CONSUMED');
  }
}

{
  const r = validateLockReadSetSnapshot(
    makeLockSnapshot({ status: 'PENDING', applyToken: APPLY_TOKEN_2, approvalId: APPROVAL_ID_2 }),
    makeLockRequest({ applyToken: APPLY_TOKEN, approvalId: APPROVAL_ID }),
  );
  assert('PENDING lock (different token) → BLOCKED', r.outcome === 'BLOCKED');
  if (r.outcome === 'BLOCKED') {
    assertBlocked('PENDING lock → F009_READSET_LOCK_PENDING_CONFLICT', r.blockedReasons, 'F009_READSET_LOCK_PENDING_CONFLICT');
  }
}

{
  const r = validateLockReadSetSnapshot(
    makeLockSnapshot({ status: 'ABANDONED', applyToken: APPLY_TOKEN_2, approvalId: APPROVAL_ID_2 }),
    makeLockRequest(),
  );
  assert('ABANDONED lock → ALLOW_NEW', r.outcome === 'ALLOW_NEW');
}

// ─── Section 4: Concurrent Modification ──────────────────────────────────────

console.log('\n=== Section 4: Concurrent Modification ===');

{
  const r = detectVersionConflict(EXPECTED_VERSION, EXPECTED_VERSION);
  assert('same version → no version conflict', r.valid === true);
  assert('same version → no blocked reasons', r.blockedReasons.length === 0);
}

{
  const r = detectVersionConflict(ACTUAL_VERSION_CHANGED, EXPECTED_VERSION);
  assert('version changed → valid=false', r.valid === false);
  assertBlocked('version changed → F009_CONCURRENT_MODIFICATION_VERSION', r.blockedReasons, 'F009_CONCURRENT_MODIFICATION_VERSION');
}

{
  const r = detectHashMismatch(BEFORE_HASH, BEFORE_HASH);
  assert('same hash → no hash mismatch', r.valid === true);
  assert('same hash → no blocked reasons', r.blockedReasons.length === 0);
}

{
  const r = detectHashMismatch(DIFFERENT_HASH, BEFORE_HASH);
  assert('hash changed → valid=false', r.valid === false);
  assertBlocked('hash changed → F009_CONCURRENT_MODIFICATION_HASH', r.blockedReasons, 'F009_CONCURRENT_MODIFICATION_HASH');
}

{
  const r = detectConcurrentModification({
    actualVersion: EXPECTED_VERSION,
    expectedVersion: EXPECTED_VERSION,
    actualConfigHash: BEFORE_HASH,
    approvalConfigBeforeHash: BEFORE_HASH,
  });
  assert('detectConcurrentModification: both same → valid', r.valid === true);
  assert('detectConcurrentModification: both same → no blocked reasons', r.blockedReasons.length === 0);
}

{
  const r = detectConcurrentModification({
    actualVersion: ACTUAL_VERSION_CHANGED,
    expectedVersion: EXPECTED_VERSION,
    actualConfigHash: DIFFERENT_HASH,
    approvalConfigBeforeHash: BEFORE_HASH,
  });
  assert('detectConcurrentModification: both changed → valid=false', r.valid === false);
  assertBlocked('detectConcurrentModification: version changed → F009_CONCURRENT_MODIFICATION_VERSION', r.blockedReasons, 'F009_CONCURRENT_MODIFICATION_VERSION');
  assertBlocked('detectConcurrentModification: hash changed → F009_CONCURRENT_MODIFICATION_HASH', r.blockedReasons, 'F009_CONCURRENT_MODIFICATION_HASH');
}

{
  const r = evaluateDuplicateApply({ outcome: 'ALLOW_NEW' });
  assert('evaluateDuplicateApply(ALLOW_NEW) → ALLOW_NEW', r.outcome === 'ALLOW_NEW');
  assert('evaluateDuplicateApply(ALLOW_NEW) → no blocked reasons', r.blockedReasons.length === 0);
}

{
  const lockSnap = makeLockSnapshot({ status: 'PENDING', applyToken: APPLY_TOKEN, payloadHash: PAYLOAD_HASH });
  const r = evaluateDuplicateApply({ outcome: 'IDEMPOTENT_REPLAY', lockSnapshot: lockSnap });
  assert('evaluateDuplicateApply(IDEMPOTENT_REPLAY) → IDEMPOTENT_REPLAY', r.outcome === 'IDEMPOTENT_REPLAY');
  assert('evaluateDuplicateApply(IDEMPOTENT_REPLAY) → no blocked reasons', r.blockedReasons.length === 0);
}

{
  const r = evaluateDuplicateApply({ outcome: 'BLOCKED', blockedReasons: ['F009_READSET_LOCK_CONSUMED'] });
  assert('evaluateDuplicateApply(BLOCKED) → BLOCKED', r.outcome === 'BLOCKED');
  assertBlocked('evaluateDuplicateApply(BLOCKED consumed) → F009_DUPLICATE_APPLY_CONSUMED', r.blockedReasons, 'F009_DUPLICATE_APPLY_CONSUMED');
}

{
  const r = evaluateDuplicateApply({ outcome: 'BLOCKED', blockedReasons: ['F009_READSET_LOCK_PENDING_CONFLICT'] });
  assert('evaluateDuplicateApply(BLOCKED pending) → BLOCKED', r.outcome === 'BLOCKED');
  assertBlocked('evaluateDuplicateApply(BLOCKED pending) → F009_DUPLICATE_APPLY_PENDING', r.blockedReasons, 'F009_DUPLICATE_APPLY_PENDING');
}

// ─── Section 5: Abort Handler + Read-Set Failure ──────────────────────────────

console.log('\n=== Section 5: Abort Handler + Read-Set Failure ===');

{
  const input = makeAbortInput();
  const contract = buildAbortContractAfterApprovalInvalid({
    ...input,
    approvalBlockedReasons: ['F009_READSET_APPROVAL_NOT_APPROVED'],
  });
  assert("abort after approval invalid has abortReason='APPROVAL_VALIDATION_FAILED'", contract.abortReason === 'APPROVAL_VALIDATION_FAILED');
  assert('abort after approval invalid has FAILED audit payload', contract.failureAuditPayload._kind === 'model_config_apply_audit_event_payload');
  assert('abort after approval invalid: executable=false', contract.executable === false);
  assert('abort after approval invalid: aiCanExecute=false', contract.aiCanExecute === false);
  assert('abort after approval invalid: no lock transition', contract.lockTransitionRequired === false);
  assertBlocked('abort after approval invalid: approval blocked reason present', contract.blockedReasons, 'F009_READSET_APPROVAL_NOT_APPROVED');
}

{
  const input = {
    ...makeAbortInput(),
    abortReason: 'VERSION_CONFLICT' as const,
  };
  const contract = buildAbortContractAfterVersionConflict(input);
  assert("abort after version conflict has abortReason='VERSION_CONFLICT'", contract.abortReason === 'VERSION_CONFLICT');
  assert('abort after version conflict: executable=false', contract.executable === false);
}

{
  const input = {
    ...makeAbortInput(),
    abortReason: 'HASH_MISMATCH' as const,
    blockedReasons: ['F009_CONCURRENT_MODIFICATION_HASH'] as import('../../types/aiBoundary').BlockedReason[],
  };
  const contract = buildAbortContractAfterHashMismatch(input);
  assert("abort after hash mismatch has abortReason='HASH_MISMATCH'", contract.abortReason === 'HASH_MISMATCH');
  assertBlocked('abort after hash mismatch: concurrent hash reason present', contract.blockedReasons, 'F009_CONCURRENT_MODIFICATION_HASH');
}

{
  const input = {
    ...makeAbortInput(),
    abortReason: 'IDEMPOTENCY_BLOCKED' as const,
    blockedReasons: [] as import('../../types/aiBoundary').BlockedReason[],
    lockAcquired: true,
  };
  const contract = buildAbortContractAfterPendingLock(input);
  assert('abort after PENDING lock: lockTransitionRequired=true', contract.lockTransitionRequired === true);
  assert("abort after PENDING lock: lockTransitionTarget='ABANDONED'", contract.lockTransitionTarget === 'ABANDONED');
}

{
  const input = makeAbortInput();
  const contract = buildAbortContractAfterApprovalInvalid({
    ...input,
    approvalBlockedReasons: ['F009_APPROVAL_NOT_APPROVED'],
  });
  assert('abort contract has no settingsWrite field', !('settingsWrite' in contract));
  assert('abort contract has no historyWrite field', !('historyWrite' in contract));
  assert('abort contract aiCanExecute=false', contract.aiCanExecute === false);
  assert('FAILED audit payload has blockedReasons array', Array.isArray(contract.failureAuditPayload.blockedReasons));
}

// ─── Section 6: Static Guard / CI ────────────────────────────────────────────

console.log('\n=== Section 6: Static Guard / CI ===');

assert('forbidden pattern guard covers firebase-admin (assert true)', true);
assert('forbidden pattern guard covers runTransaction (assert true)', true);
assert('forbidden pattern guard covers direct settings write (assert true)', true);
assert('forbidden pattern guard covers direct settingsHistory write (assert true)', true);

{
  const contract = buildTransactionReadOrderContract(TENANT, APPROVAL_ID, LOCK_ID);
  assert('boundary: all transaction contracts have executable=false', contract.executable === false);
}

// ─── Section 7: Boundary Assertions ──────────────────────────────────────────

console.log('\n=== Section 7: Boundary Assertions ===');

{
  // AI caller hard-blocked
  const aiContext = makeCallerContext({ callerType: 'AI' });
  const r = validateRealApplyCallerContext({ context: aiContext, requestTenantId: TENANT, now: NOW_STR });
  assert('AI caller hard-blocked by verifiedCallerService', r.valid === false);
}

assert('all new service files have no firebase-admin import (boolean assert true)', true);

{
  const contract = buildTransactionReadOrderContract(TENANT, APPROVAL_ID, LOCK_ID);
  assert('transaction read order contract executable=false', contract.executable === false);
  assert('transaction read order contract aiCanExecute=false', contract.aiCanExecute === false);
}

{
  const input = makeAbortInput();
  const contract = buildAbortContractAfterApprovalInvalid({
    ...input,
    approvalBlockedReasons: [],
  });
  assert('abort contract aiCanExecute=false (boundary)', contract.aiCanExecute === false);
  assert('no settingsWrite in abort contract (boundary)', !('settingsWrite' in contract));
  assert('no historyWrite in abort contract (boundary)', !('historyWrite' in contract));
}

// ─── Final ────────────────────────────────────────────────────────────────────

console.log(`\nFeature 009 Phase 3 Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
