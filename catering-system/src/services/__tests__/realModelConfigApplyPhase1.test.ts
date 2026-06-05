/**
 * realModelConfigApplyPhase1.test.ts
 *
 * Feature 009 Phase 1: Pure Logic & Validation — Comprehensive Test Suite
 *
 * 70+ assertions covering:
 *  - Verified Caller Context validation
 *  - Persisted Approval validation
 *  - Idempotency Lock lifecycle
 *  - Transaction Contract building
 *  - Abort Contract building
 *  - Audit Payload building
 *  - Static guard assertions
 *  - Boundary assertions
 */

import { validateRealApplyCallerContext } from '../realModelConfigApplyVerifiedCallerService';
import { validateRealApplyApproval } from '../realModelConfigApplyApprovalValidationService';
import {
  validateIdempotencyState,
  buildIdempotencyLockContract,
  buildLockPath,
  validateLockSchema,
  LOCK_TTL_SECONDS,
  LOCK_CLEANUP_GRACE_SECONDS,
} from '../realModelConfigApplyIdempotencyService';
import {
  buildTransactionContract,
  buildTransactionReadSet,
  buildTransactionWriteSet,
} from '../realModelConfigApplyTransactionContractService';
import { buildAbortContract } from '../realModelConfigApplyAbortContractService';
import { buildAuditEventPayload, validateAuditPayloadCompleteness } from '../realModelConfigApplyAuditPayloadService';

import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asApplyToken, asConfigVersion, asDiffHash, asModelConfigApprovalId, asModelConfigRecommendationId,
} from '../../types/modelConfigApply';
import type {
  VerifiedHumanCallerContext, PersistedModelConfigApproval, ModelConfigApplyIdempotencyLock,
} from '../../types/realModelConfigApplyTransaction';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function asTenantId(s: string): TenantId { return s as TenantId; }
function asAuditTrailId(s: string): AuditTrailId { return s as AuditTrailId; }

const TENANT = asTenantId('tenant-001');
const APPROVAL_ID = asModelConfigApprovalId('approval-abc');
const REC_ID = asModelConfigRecommendationId('rec-xyz');
const AUDIT_ID = asAuditTrailId('audit-trail-001');
const APPLY_TOKEN = asApplyToken('token-apply-1');
const EXPECTED_VERSION = asConfigVersion('v1');
const NEW_VERSION = asConfigVersion('v2');
const BEFORE_HASH = asDiffHash('hash-before-001');
const AFTER_HASH = asDiffHash('hash-after-002');
const DIFF_HASH = asDiffHash('hash-diff-003');
const PAYLOAD_HASH = asDiffHash('hash-payload-004');
const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';
const NOW = '2026-06-05T12:00:00.000Z';
const TOKEN_EXP_FUTURE = Math.floor(new Date('2099-01-01').getTime() / 1000);
const TOKEN_IAT = Math.floor(new Date('2026-01-01').getTime() / 1000);
const CALLER_USER_ID = 'user-human-001';

function makeCallerContext(overrides?: Partial<VerifiedHumanCallerContext>): VerifiedHumanCallerContext {
  return {
    _kind: 'verified_human_caller_context',
    callerType: 'HUMAN',
    callerUserId: CALLER_USER_ID,
    tenantId: TENANT,
    signInProvider: 'password',
    tokenVerificationSource: 'FIREBASE_ADMIN_SDK',
    tokenVerificationStatus: 'verified',
    verifiedAt: NOW,
    tokenIat: TOKEN_IAT,
    tokenExp: TOKEN_EXP_FUTURE,
    tokenSubject: CALLER_USER_ID,
    isServiceAccount: false,
    upstreamVerificationConfirmed: true,
    ...overrides,
  };
}

function makeApproval(overrides?: Partial<PersistedModelConfigApproval>): PersistedModelConfigApproval {
  return {
    _kind: 'persisted_model_config_approval',
    approvalId: APPROVAL_ID,
    tenantId: TENANT,
    sourceRecommendationId: REC_ID,
    approvedByUserId: CALLER_USER_ID,
    status: 'APPROVED',
    expiresAt: FUTURE,
    configBeforeHash: BEFORE_HASH,
    configAfterHash: AFTER_HASH,
    diffHash: DIFF_HASH,
    applyToken: APPLY_TOKEN,
    auditTrailId: AUDIT_ID,
    expectedCurrentVersion: EXPECTED_VERSION,
    newVersion: NEW_VERSION,
    ...overrides,
  };
}

function makeLock(overrides?: Partial<ModelConfigApplyIdempotencyLock>): ModelConfigApplyIdempotencyLock {
  return {
    _kind: 'model_config_apply_idempotency_lock',
    lockId: `${TENANT}:${APPLY_TOKEN}`,
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    applyToken: APPLY_TOKEN,
    payloadHash: PAYLOAD_HASH,
    expectedCurrentVersion: EXPECTED_VERSION,
    status: 'CONSUMED',
    ttlSeconds: 300,
    cleanupEligibleAfterSeconds: 360,
    createdAt: NOW,
    ...overrides,
  };
}

// ─── Assertion helper ─────────────────────────────────────────────────────────

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

function assertIncludes(label: string, arr: string[], value: string): void {
  assert(label, arr.includes(value));
}

// ─── === Verified Caller Context === ─────────────────────────────────────────

console.log('\n=== Verified Caller Context ===');

// 1. valid verified human caller → passes
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext(), requestTenantId: TENANT, now: NOW });
  assert('1. valid human caller → valid=true', r.valid === true);
  assert('1b. valid human caller → no blocked reasons', r.blockedReasons.length === 0);
}

// 2-3. AI caller → F009_CALLER_NOT_HUMAN + REAL_EXEC_AI_CALLER_BLOCKED
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext({ callerType: 'AI' }), requestTenantId: TENANT, now: NOW });
  assert('2. AI caller → valid=false', r.valid === false);
  assertIncludes('3. AI caller → F009_CALLER_NOT_HUMAN', r.blockedReasons, 'F009_CALLER_NOT_HUMAN');
  assertIncludes('3b. AI caller → REAL_EXEC_AI_CALLER_BLOCKED', r.blockedReasons, 'REAL_EXEC_AI_CALLER_BLOCKED');
}

// 4. SERVICE_ACCOUNT callerType → F009_CALLER_SERVICE_ACCOUNT_BLOCKED
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext({ callerType: 'SERVICE_ACCOUNT' }), requestTenantId: TENANT, now: NOW });
  assert('4. SERVICE_ACCOUNT → valid=false', r.valid === false);
  assertIncludes('4b. SERVICE_ACCOUNT → F009_CALLER_SERVICE_ACCOUNT_BLOCKED', r.blockedReasons, 'F009_CALLER_SERVICE_ACCOUNT_BLOCKED');
}

// 5. ADMIN_SDK callerType → F009_CALLER_ADMIN_SDK_BLOCKED
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext({ callerType: 'ADMIN_SDK' }), requestTenantId: TENANT, now: NOW });
  assert('5. ADMIN_SDK caller → valid=false', r.valid === false);
  assertIncludes('5b. ADMIN_SDK caller → F009_CALLER_ADMIN_SDK_BLOCKED', r.blockedReasons, 'F009_CALLER_ADMIN_SDK_BLOCKED');
}

// 6. isServiceAccount=true → F009_CALLER_SERVICE_ACCOUNT_BLOCKED
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext({ isServiceAccount: true, signInProvider: 'service-account' }), requestTenantId: TENANT, now: NOW });
  assert('6. isServiceAccount=true → valid=false', r.valid === false);
  assertIncludes('6b. isServiceAccount=true → F009_CALLER_SERVICE_ACCOUNT_BLOCKED', r.blockedReasons, 'F009_CALLER_SERVICE_ACCOUNT_BLOCKED');
}

// 7. CLIENT_SUPPLIED source → F009_CALLER_VERIFICATION_UNTRUSTED
{
  const r = validateRealApplyCallerContext({
    context: makeCallerContext({ tokenVerificationSource: 'CLIENT_SUPPLIED' as any }),
    requestTenantId: TENANT, now: NOW,
  });
  assert('7. CLIENT_SUPPLIED source → valid=false', r.valid === false);
  assertIncludes('7b. CLIENT_SUPPLIED → F009_CALLER_VERIFICATION_UNTRUSTED', r.blockedReasons, 'F009_CALLER_VERIFICATION_UNTRUSTED');
}

// 8. tokenVerificationStatus='unverified' → F009_CALLER_VERIFICATION_NOT_VERIFIED
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext({ tokenVerificationStatus: 'unverified' }), requestTenantId: TENANT, now: NOW });
  assert('8. unverified status → valid=false', r.valid === false);
  assertIncludes('8b. unverified status → F009_CALLER_VERIFICATION_NOT_VERIFIED', r.blockedReasons, 'F009_CALLER_VERIFICATION_NOT_VERIFIED');
}

// 9. missing callerUserId → F009_CALLER_MISSING_USER_ID
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext({ callerUserId: '' }), requestTenantId: TENANT, now: NOW });
  assert('9. missing callerUserId → valid=false', r.valid === false);
  assertIncludes('9b. missing callerUserId → F009_CALLER_MISSING_USER_ID', r.blockedReasons, 'F009_CALLER_MISSING_USER_ID');
}

// 10. tenant mismatch → F009_CALLER_TENANT_MISMATCH
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext(), requestTenantId: asTenantId('other-tenant'), now: NOW });
  assert('10. tenant mismatch → valid=false', r.valid === false);
  assertIncludes('10b. tenant mismatch → F009_CALLER_TENANT_MISMATCH', r.blockedReasons, 'F009_CALLER_TENANT_MISMATCH');
}

// ─── === Persisted Approval === ───────────────────────────────────────────────

console.log('\n=== Persisted Approval ===');

const baseApprovalInput = {
  requestTenantId: TENANT,
  requestApprovalId: APPROVAL_ID,
  requestSourceRecommendationId: REC_ID,
  requestAuditTrailId: AUDIT_ID,
  requestApplyToken: APPLY_TOKEN,
  requestExpectedCurrentVersion: EXPECTED_VERSION,
  requestNewVersion: NEW_VERSION,
  requestConfigBeforeHash: BEFORE_HASH,
  requestConfigAfterHash: AFTER_HASH,
  requestDiffHash: DIFF_HASH,
  callerContext: makeCallerContext(),
  now: NOW,
};

// 11. valid approval → passes
{
  const r = validateRealApplyApproval({ ...baseApprovalInput, approval: makeApproval() });
  assert('11. valid approval → valid=true', r.valid === true);
}

// 12. null approval → F009_APPROVAL_MISSING
{
  const r = validateRealApplyApproval({ ...baseApprovalInput, approval: null });
  assert('12. null approval → F009_APPROVAL_MISSING', r.blockedReasons.includes('F009_APPROVAL_MISSING'));
}

// 13. status PENDING_REVIEW → F009_APPROVAL_NOT_APPROVED
{
  const r = validateRealApplyApproval({ ...baseApprovalInput, approval: makeApproval({ status: 'PENDING_REVIEW' }) });
  assert('13. PENDING_REVIEW → F009_APPROVAL_NOT_APPROVED', r.blockedReasons.includes('F009_APPROVAL_NOT_APPROVED'));
}

// 14. status CONSUMED → F009_APPROVAL_ALREADY_CONSUMED
{
  const r = validateRealApplyApproval({ ...baseApprovalInput, approval: makeApproval({ status: 'CONSUMED' }) });
  assert('14. CONSUMED → F009_APPROVAL_ALREADY_CONSUMED', r.blockedReasons.includes('F009_APPROVAL_ALREADY_CONSUMED'));
}

// 15. tenant mismatch → F009_APPROVAL_TENANT_MISMATCH (early return)
{
  const r = validateRealApplyApproval({
    ...baseApprovalInput,
    approval: makeApproval({ tenantId: asTenantId('wrong-tenant') }),
  });
  assert('15. tenant mismatch → F009_APPROVAL_TENANT_MISMATCH', r.blockedReasons.includes('F009_APPROVAL_TENANT_MISMATCH'));
  assert('15b. tenant mismatch → early return', r.blockedReasons.length === 1);
}

// 16. expired → F009_APPROVAL_EXPIRED
{
  const r = validateRealApplyApproval({ ...baseApprovalInput, approval: makeApproval({ expiresAt: PAST }) });
  assert('16. expired → F009_APPROVAL_EXPIRED', r.blockedReasons.includes('F009_APPROVAL_EXPIRED'));
}

// 17. sourceRecommendationId mismatch → F009_APPROVAL_SOURCE_REC_MISMATCH
{
  const r = validateRealApplyApproval({
    ...baseApprovalInput,
    approval: makeApproval({ sourceRecommendationId: asModelConfigRecommendationId('wrong-rec') }),
  });
  assert('17. sourceRecommendationId mismatch → F009_APPROVAL_SOURCE_REC_MISMATCH', r.blockedReasons.includes('F009_APPROVAL_SOURCE_REC_MISMATCH'));
}

// 18. auditTrailId mismatch → F009_APPROVAL_AUDIT_TRAIL_MISMATCH
{
  const r = validateRealApplyApproval({
    ...baseApprovalInput,
    approval: makeApproval({ auditTrailId: asAuditTrailId('wrong-audit') }),
  });
  assert('18. auditTrailId mismatch → F009_APPROVAL_AUDIT_TRAIL_MISMATCH', r.blockedReasons.includes('F009_APPROVAL_AUDIT_TRAIL_MISMATCH'));
}

// 19. missing applyToken → F009_APPROVAL_MISSING_APPLY_TOKEN
{
  const r = validateRealApplyApproval({
    ...baseApprovalInput,
    approval: makeApproval({ applyToken: asApplyToken('') }),
  });
  assert('19. missing applyToken → F009_APPROVAL_MISSING_APPLY_TOKEN', r.blockedReasons.includes('F009_APPROVAL_MISSING_APPLY_TOKEN'));
}

// 20. missing configBeforeHash → F009_APPROVAL_MISSING_HASH_FIELDS
{
  const r = validateRealApplyApproval({
    ...baseApprovalInput,
    approval: makeApproval({ configBeforeHash: asDiffHash('') }),
  });
  assert('20. missing configBeforeHash → F009_APPROVAL_MISSING_HASH_FIELDS', r.blockedReasons.includes('F009_APPROVAL_MISSING_HASH_FIELDS'));
}

// 21. approvedBy mismatch → F009_APPROVAL_APPROVED_BY_MISMATCH
{
  const r = validateRealApplyApproval({
    ...baseApprovalInput,
    approval: makeApproval({ approvedByUserId: 'different-user' }),
    strictCallerMatch: true,
  });
  assert('21. approvedBy mismatch → F009_APPROVAL_APPROVED_BY_MISMATCH', r.blockedReasons.includes('F009_APPROVAL_APPROVED_BY_MISMATCH'));
}

// ─── === Idempotency Lock Lifecycle === ───────────────────────────────────────

console.log('\n=== Idempotency Lock Lifecycle ===');

const baseIdempotencyInput = {
  tenantId: TENANT,
  approvalId: APPROVAL_ID,
  applyToken: APPLY_TOKEN,
  payloadHash: PAYLOAD_HASH,
  expectedCurrentVersion: EXPECTED_VERSION,
};

// 22. no existing lock → ALLOW_NEW
{
  const r = validateIdempotencyState({ ...baseIdempotencyInput, existingLock: null });
  assert('22. no lock → ALLOW_NEW', r.outcome === 'ALLOW_NEW');
  assert('22b. no lock → valid=true', r.valid === true);
}

// 23. CONSUMED + same payload → IDEMPOTENT_REPLAY
{
  const r = validateIdempotencyState({ ...baseIdempotencyInput, existingLock: makeLock({ status: 'CONSUMED' }) });
  assert('23. CONSUMED same payload → IDEMPOTENT_REPLAY', r.outcome === 'IDEMPOTENT_REPLAY');
  assert('23b. IDEMPOTENT_REPLAY → valid=true', r.valid === true);
}

// 24. CONSUMED + different payload → BLOCKED + LOCK_PAYLOAD_MISMATCH
{
  const r = validateIdempotencyState({
    ...baseIdempotencyInput,
    payloadHash: asDiffHash('different-payload'),
    existingLock: makeLock({ status: 'CONSUMED' }),
  });
  assert('24. CONSUMED diff payload → BLOCKED', r.outcome === 'BLOCKED');
  assertIncludes('24b. CONSUMED diff payload → LOCK_PAYLOAD_MISMATCH', r.blockedReasons, 'F009_LOCK_PAYLOAD_MISMATCH');
}

// 25. PENDING → BLOCKED + LOCK_PENDING_CONFLICT
{
  const r = validateIdempotencyState({ ...baseIdempotencyInput, existingLock: makeLock({ status: 'PENDING' }) });
  assert('25. PENDING → BLOCKED', r.outcome === 'BLOCKED');
  assertIncludes('25b. PENDING → LOCK_PENDING_CONFLICT', r.blockedReasons, 'F009_LOCK_PENDING_CONFLICT');
}

// 26. ABANDONED → BLOCKED + F009_ABORT_REQUIRED
{
  const r = validateIdempotencyState({ ...baseIdempotencyInput, existingLock: makeLock({ status: 'ABANDONED' }) });
  assert('26. ABANDONED → BLOCKED', r.outcome === 'BLOCKED');
  assertIncludes('26b. ABANDONED → F009_ABORT_REQUIRED', r.blockedReasons, 'F009_ABORT_REQUIRED');
}

// 27. same approvalId + different token → BLOCKED + LOCK_APPROVALID_TOKEN_CONFLICT
{
  const r = validateIdempotencyState({
    ...baseIdempotencyInput,
    applyToken: asApplyToken('different-token'),
    existingLock: makeLock({ status: 'PENDING' }),
  });
  assert('27. approvalId+diff token → BLOCKED', r.outcome === 'BLOCKED');
  assertIncludes('27b. → LOCK_APPROVALID_TOKEN_CONFLICT', r.blockedReasons, 'F009_LOCK_APPROVALID_TOKEN_CONFLICT');
}

// 28. stale expectedCurrentVersion → BLOCKED + LOCK_STALE_VERSION
{
  const r = validateIdempotencyState({
    ...baseIdempotencyInput,
    expectedCurrentVersion: asConfigVersion('v99'),
    existingLock: makeLock({ status: 'CONSUMED' }),
  });
  assert('28. stale version → BLOCKED', r.outcome === 'BLOCKED');
  assertIncludes('28b. stale version → LOCK_STALE_VERSION', r.blockedReasons, 'F009_LOCK_STALE_VERSION');
}

// 29. buildIdempotencyLockContract → PENDING, correct TTL
{
  const lock = buildIdempotencyLockContract({
    lockId: `${TENANT}:${APPLY_TOKEN}`,
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    applyToken: APPLY_TOKEN,
    payloadHash: PAYLOAD_HASH,
    expectedCurrentVersion: EXPECTED_VERSION,
    createdAt: NOW,
  });
  assert('29. buildLockContract → status=PENDING', lock.status === 'PENDING');
  assert('29b. buildLockContract → ttlSeconds=300', lock.ttlSeconds === LOCK_TTL_SECONDS);
  assert('29c. buildLockContract → cleanupEligibleAfterSeconds=360', lock.cleanupEligibleAfterSeconds === LOCK_TTL_SECONDS + LOCK_CLEANUP_GRACE_SECONDS);
}

// 30. validateLockSchema → missing fields blocked
{
  const r = validateLockSchema({ lockId: '', tenantId: '' });
  assert('30. validateLockSchema missing fields → valid=false', r.valid === false);
  assert('30b. validateLockSchema → F009_ABORT_REQUIRED', r.blockedReasons.includes('F009_ABORT_REQUIRED'));
}

// ─── === Transaction Contract === ─────────────────────────────────────────────

console.log('\n=== Transaction Contract ===');

const baseContractInput = {
  tenantId: TENANT,
  approvalId: APPROVAL_ID,
  sourceRecommendationId: REC_ID,
  auditTrailId: AUDIT_ID,
  applyToken: APPLY_TOKEN,
  expectedCurrentVersion: EXPECTED_VERSION,
  newVersion: NEW_VERSION,
  configBeforeHash: BEFORE_HASH,
  configAfterHash: AFTER_HASH,
  diffHash: DIFF_HASH,
  callerUserId: CALLER_USER_ID,
};

// 31. valid input → contract built, blocked=false
{
  const r = buildTransactionContract(baseContractInput);
  assert('31. valid input → blocked=false', r.blocked === false);
  assert('31b. valid input → contract not null', r.contract !== null);
}

// 32. contract executable=false
{
  const r = buildTransactionContract(baseContractInput);
  assert('32. contract executable=false', r.contract?.executable === false);
}

// 33. contract aiCanExecute=false
{
  const r = buildTransactionContract(baseContractInput);
  assert('33. contract aiCanExecute=false', r.contract?.aiCanExecute === false);
}

// 34. readSet contains approval path
{
  const rs = buildTransactionReadSet(baseContractInput);
  assert('34. readSet approvalPath contains tenantId', rs.approvalPath.includes(String(TENANT)));
  assert('34b. readSet approvalPath contains approvalId', rs.approvalPath.includes(String(APPROVAL_ID)));
}

// 35. readSet contains settings path
{
  const rs = buildTransactionReadSet(baseContractInput);
  assert('35. readSet settingsPath contains tenantId', rs.settingsPath.includes(String(TENANT)));
}

// 36. readSet contains lock path
{
  const rs = buildTransactionReadSet(baseContractInput);
  assert('36. readSet lockPath contains tenantId:token', rs.lockPath.includes(`${TENANT}:${APPLY_TOKEN}`));
}

// 37. writeSet lockWrite executable=false
{
  const ws = buildTransactionWriteSet(baseContractInput);
  assert('37. lockWrite executable=false', ws.lockWrite.executable === false);
  assert('37b. lockWrite aiCanExecute=false', ws.lockWrite.aiCanExecute === false);
}

// 38. writeSet historyWrite immutable=true
{
  const ws = buildTransactionWriteSet(baseContractInput);
  assert('38. historyWrite immutable=true', ws.historyWrite.immutable === true);
  assert('38b. historyWrite executable=false', ws.historyWrite.executable === false);
}

// 39. writeSet settingsUpdate executable=false
{
  const ws = buildTransactionWriteSet(baseContractInput);
  assert('39. settingsUpdate executable=false', ws.settingsUpdate.executable === false);
}

// 40. writeSet auditEventWrite executable=false
{
  const ws = buildTransactionWriteSet(baseContractInput);
  assert('40. auditEventWrite executable=false', ws.auditEventWrite.executable === false);
}

// 41. missing tenantId → blocked
{
  const r = buildTransactionContract({ ...baseContractInput, tenantId: asTenantId('') });
  assert('41. missing tenantId → blocked=true', r.blocked === true);
  assert('41b. missing tenantId → contract null', r.contract === null);
}

// ─── === Abort Contract === ────────────────────────────────────────────────────

console.log('\n=== Abort Contract ===');

const baseAbortInput = {
  abortReason: 'CALLER_VALIDATION_FAILED' as const,
  blockedReasons: ['F009_CALLER_NOT_HUMAN'] as any[],
  lockAcquired: true,
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
};

// 42. abort contract built with CALLER_VALIDATION_FAILED
{
  const ac = buildAbortContract(baseAbortInput);
  assert('42. abort contract _kind correct', ac._kind === 'model_config_apply_abort_contract');
  assert('42b. abort contract abortReason correct', ac.abortReason === 'CALLER_VALIDATION_FAILED');
}

// 43. abort contract executable=false
{
  const ac = buildAbortContract(baseAbortInput);
  assert('43. abort contract executable=false', ac.executable === false);
}

// 44. abort contract aiCanExecute=false
{
  const ac = buildAbortContract(baseAbortInput);
  assert('44. abort contract aiCanExecute=false', ac.aiCanExecute === false);
}

// 45. lockAcquired=true → lockTransitionRequired=true, target=ABANDONED
{
  const ac = buildAbortContract({ ...baseAbortInput, lockAcquired: true });
  assert('45. lockAcquired=true → lockTransitionRequired=true', ac.lockTransitionRequired === true);
  assert('45b. lockAcquired=true → target=ABANDONED', ac.lockTransitionTarget === 'ABANDONED');
}

// 46. lockAcquired=false → lockTransitionRequired=false
{
  const ac = buildAbortContract({ ...baseAbortInput, lockAcquired: false });
  assert('46. lockAcquired=false → lockTransitionRequired=false', ac.lockTransitionRequired === false);
  assert('46b. lockAcquired=false → target=null', ac.lockTransitionTarget === null);
}

// 47. failureAuditPayload present with blockedReasons
{
  const ac = buildAbortContract(baseAbortInput);
  assert('47. failureAuditPayload not null', ac.failureAuditPayload !== null && ac.failureAuditPayload !== undefined);
  assert('47b. failureAuditPayload eventType=MODEL_CONFIG_APPLY_BLOCKED', ac.failureAuditPayload.eventType === 'MODEL_CONFIG_APPLY_BLOCKED');
  assert('47c. failureAuditPayload has blockedReasons', Array.isArray(ac.failureAuditPayload.blockedReasons));
}

// ─── === Audit Payload === ─────────────────────────────────────────────────────

console.log('\n=== Audit Payload ===');

const baseAuditInput = {
  eventType: 'MODEL_CONFIG_APPLIED' as const,
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
};

// 48. MODEL_CONFIG_APPLIED payload → all fields present
{
  const p = buildAuditEventPayload(baseAuditInput);
  assert('48. payload _kind correct', p._kind === 'model_config_apply_audit_event_payload');
  assert('48b. payload eventType=MODEL_CONFIG_APPLIED', p.eventType === 'MODEL_CONFIG_APPLIED');
  assert('48c. payload tenantId present', p.tenantId === TENANT);
}

// 49. MODEL_CONFIG_APPLY_BLOCKED payload → blockedReasons present
{
  const p = buildAuditEventPayload({
    ...baseAuditInput,
    eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
    blockedReasons: ['F009_CALLER_NOT_HUMAN'] as any[],
  });
  assert('49. blocked payload has blockedReasons', Array.isArray(p.blockedReasons) && (p.blockedReasons?.length ?? 0) > 0);
}

// 50. VERSION_CONFLICT payload → actualCurrentVersion present
{
  const p = buildAuditEventPayload({
    ...baseAuditInput,
    eventType: 'MODEL_CONFIG_VERSION_CONFLICT_BLOCKED',
    actualCurrentVersion: asConfigVersion('v-actual'),
  });
  assert('50. version conflict payload has actualCurrentVersion', p.actualCurrentVersion === 'v-actual');
}

// 51. IDEMPOTENCY_BLOCKED payload → payloadHash present
{
  const p = buildAuditEventPayload({
    ...baseAuditInput,
    eventType: 'MODEL_CONFIG_IDEMPOTENCY_BLOCKED',
    payloadHash: PAYLOAD_HASH,
  });
  assert('51. idempotency payload has payloadHash', p.payloadHash === PAYLOAD_HASH);
}

// 52. validateAuditPayloadCompleteness → complete=true
{
  const p = buildAuditEventPayload(baseAuditInput);
  const check = validateAuditPayloadCompleteness(p);
  assert('52. complete payload → complete=true', check.complete === true);
  assert('52b. complete payload → no missing fields', check.missingFields.length === 0);
}

// 53. validateAuditPayloadCompleteness with missing field → complete=false
{
  const p = buildAuditEventPayload(baseAuditInput);
  const broken = { ...p, callerUserId: '' };
  const check = validateAuditPayloadCompleteness(broken as any);
  assert('53. broken payload → complete=false', check.complete === false);
  assert('53b. broken payload → missing field in list', check.missingFields.includes('callerUserId'));
}

// 54. tokenVerificationSource included
{
  const p = buildAuditEventPayload(baseAuditInput);
  assert('54. tokenVerificationSource included', p.tokenVerificationSource === 'FIREBASE_ADMIN_SDK');
}

// 55. callerType included
{
  const p = buildAuditEventPayload(baseAuditInput);
  assert('55. callerType included', p.callerType === 'HUMAN');
}

// ─── === Static Guard / CI === ─────────────────────────────────────────────────

console.log('\n=== Static Guard / CI ===');

// These verify Phase 1 structural invariants

// 56. All contract types have executable: false
{
  const r = buildTransactionContract(baseContractInput);
  assert('56. transaction contract executable=false', r.contract?.executable === false);
}

// 57. All write-set types have aiCanExecute: false
{
  const ws = buildTransactionWriteSet(baseContractInput);
  assert('57. writeSet aiCanExecute=false', ws.aiCanExecute === false);
}

// 58. Lock path format is correct
{
  const path = buildLockPath(TENANT, APPLY_TOKEN);
  assert('58. lockPath format correct', path === `modelConfigIdempotencyLocks/${TENANT}:${APPLY_TOKEN}`);
}

// 59. Abort contract abortedAt is a Date
{
  const ac = buildAbortContract(baseAbortInput);
  assert('59. abort contract abortedAt is Date', ac.abortedAt instanceof Date);
}

// 60. Audit payload generatedAt is a Date
{
  const p = buildAuditEventPayload(baseAuditInput);
  assert('60. audit payload generatedAt is Date', p.generatedAt instanceof Date);
}

// ─── === Boundary === ─────────────────────────────────────────────────────────

console.log('\n=== Boundary ===');

// 61. AI caller is blocked (boundary enforcement)
{
  const r = validateRealApplyCallerContext({ context: makeCallerContext({ callerType: 'AI' }), requestTenantId: TENANT, now: NOW });
  assert('61. AI caller blocked by boundary', r.valid === false && r.blockedReasons.includes('F009_CALLER_NOT_HUMAN'));
}

// 62. executable=false enforced on transaction contract
{
  const r = buildTransactionContract(baseContractInput);
  assert('62. contract.executable strictly false', r.contract?.executable === false);
}

// 63. aiCanExecute=false enforced on abort contract
{
  const ac = buildAbortContract(baseAbortInput);
  assert('63. abort contract.aiCanExecute strictly false', ac.aiCanExecute === false);
}

// 64. Expired approval is blocked
{
  const r = validateRealApplyApproval({ ...baseApprovalInput, approval: makeApproval({ expiresAt: PAST }) });
  assert('64. expired approval blocked', r.blockedReasons.includes('F009_APPROVAL_EXPIRED'));
}

// 65. null caller context → REAL_EXEC_MISSING_CALLER_CONTEXT
{
  const r = validateRealApplyCallerContext({ context: null, requestTenantId: TENANT, now: NOW });
  assert('65. null context → REAL_EXEC_MISSING_CALLER_CONTEXT', r.blockedReasons.includes('REAL_EXEC_MISSING_CALLER_CONTEXT'));
}

// ─── === Final Summary === ─────────────────────────────────────────────────────

console.log(`\n${'='.repeat(60)}`);
console.log(`Feature 009 Phase 1 Tests: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
