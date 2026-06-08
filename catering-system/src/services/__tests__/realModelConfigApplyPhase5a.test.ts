/**
 * realModelConfigApplyPhase5a.test.ts
 *
 * Feature 009 Phase 5A: Production Environment Guard + Real Transaction
 * Executor — pure / in-memory unit tests (no real Firestore emulator needed).
 *
 * Covers:
 *  - ProductionEnvironmentGuard: all combinations of the four conditions
 *  - default-deny on unknown environments
 *  - production project id hard-block (cannot be bypassed by other flags)
 *  - guard-first contract: runTransaction is never invoked when guard blocks
 *  - successful in-memory transaction simulation (happy path)
 *  - duplicate apply / idempotent replay / lock conflict behaviors
 *  - AI / Service Account / Admin SDK caller hard-block
 *  - abort path leaves no partial settings/settingsHistory mutation
 *
 * Run via: npx tsx src/services/__tests__/realModelConfigApplyPhase5a.test.ts
 * Pure runner — no test framework, no process.exit (throws on failure).
 */

import {
  evaluateProductionEnvironmentGuard,
  classifyProjectId,
  assertProductionEnvironmentGuardAllowed,
  FORBIDDEN_PRODUCTION_PROJECT_IDS,
  ALLOWED_EMULATOR_PROJECT_IDS,
  type ProductionEnvironmentGuardResult,
} from '../realModelConfigApplyProductionEnvironmentGuard';

import {
  executeRealModelConfigApplyTransaction,
  approvalDocPath,
  settingsDocPath,
  settingsHistoryDocPath,
  lockDocPath,
  auditEventDocPath,
  type RealTransactionApplyRequest,
  type RealFirestoreLike,
  type RealFirestoreTransactionLike,
  type RealFirestoreDocRefLike,
  type RunTransactionFn,
} from '../realModelConfigApplyTransactionExecutorService';

import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import type { VerifiedHumanCallerContext } from '../../types/realModelConfigApplyTransaction';
import {
  asApplyToken,
  asConfigVersion,
  asDiffHash,
  asModelConfigApprovalId,
  asModelConfigRecommendationId,
} from '../../types/modelConfigApply';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asTenantId(s: string): TenantId { return s as TenantId; }
function asAuditTrailId(s: string): AuditTrailId { return s as AuditTrailId; }

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

const TENANT = asTenantId('tenant-p5a-001');
const APPROVAL_ID = asModelConfigApprovalId('approval-p5a-abc');
const REC_ID = asModelConfigRecommendationId('rec-p5a-xyz');
const AUDIT_ID = asAuditTrailId('audit-trail-p5a-001');
const APPLY_TOKEN = asApplyToken('token-p5a-apply-1');
const APPLY_TOKEN_2 = asApplyToken('token-p5a-apply-2');
const EXPECTED_VERSION = asConfigVersion('v20');
const NEW_VERSION = asConfigVersion('v21');
const BEFORE_HASH = asDiffHash('hash-p5a-before-001');
const AFTER_HASH = asDiffHash('hash-p5a-after-001');
const DIFF_HASH = asDiffHash('hash-p5a-diff-001');
const USER_ID = 'user-p5a-human';
const NOW = new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Production Environment Guard
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== Section 1: Production Environment Guard ===');

const FULL_VALID_ENV = {
  nodeEnv: 'test',
  firestoreEmulatorHost: 'localhost:8080',
  projectId: ALLOWED_EMULATOR_PROJECT_IDS[0],
  allowEmulatorOnlyFlag: 'true',
};

{
  const r = evaluateProductionEnvironmentGuard(FULL_VALID_ENV);
  assert(r.allowed === true, 'all four conditions satisfied → ALLOWED');
  assert(r.blocked === false, 'all four conditions satisfied → not blocked');
  assert(r.blockedReasons.length === 0, 'no blocked reasons when fully valid');
  assert(r.projectIdClassification === 'EMULATOR_TEST', 'classification = EMULATOR_TEST');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, nodeEnv: 'production' });
  assert(r.allowed === false, 'NODE_ENV != test → BLOCKED');
  assert(r.blockedReasons.includes('F009_PHASE5A_NOT_TEST_ENV'), 'reason = F009_PHASE5A_NOT_TEST_ENV');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, nodeEnv: undefined });
  assert(r.allowed === false, 'NODE_ENV missing → BLOCKED');
  assert(r.blockedReasons.includes('F009_PHASE5A_NOT_TEST_ENV'), 'missing NODE_ENV → F009_PHASE5A_NOT_TEST_ENV');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, firestoreEmulatorHost: undefined });
  assert(r.allowed === false, 'missing FIRESTORE_EMULATOR_HOST → BLOCKED');
  assert(r.blockedReasons.includes('F009_PHASE5A_MISSING_EMULATOR_HOST'), 'reason = F009_PHASE5A_MISSING_EMULATOR_HOST');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, firestoreEmulatorHost: '   ' });
  assert(r.allowed === false, 'blank FIRESTORE_EMULATOR_HOST → BLOCKED');
  assert(r.blockedReasons.includes('F009_PHASE5A_MISSING_EMULATOR_HOST'), 'blank emulator host → missing reason');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, allowEmulatorOnlyFlag: undefined });
  assert(r.allowed === false, 'missing opt-in flag → BLOCKED');
  assert(r.blockedReasons.includes('F009_PHASE5A_MISSING_OPT_IN_FLAG'), 'reason = F009_PHASE5A_MISSING_OPT_IN_FLAG');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, allowEmulatorOnlyFlag: 'TRUE' });
  assert(r.allowed === false, 'opt-in flag wrong case → BLOCKED');
  assert(r.blockedReasons.includes('F009_PHASE5A_OPT_IN_FLAG_INVALID'), 'reason = F009_PHASE5A_OPT_IN_FLAG_INVALID (case sensitive)');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, allowEmulatorOnlyFlag: 'yes' });
  assert(r.allowed === false, 'opt-in flag arbitrary string → BLOCKED');
  assert(r.blockedReasons.includes('F009_PHASE5A_OPT_IN_FLAG_INVALID'), 'reason = F009_PHASE5A_OPT_IN_FLAG_INVALID');
}

// ── Project id classification + hard production block ──

for (const prodId of FORBIDDEN_PRODUCTION_PROJECT_IDS) {
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, projectId: prodId });
  assert(r.allowed === false, `production project id "${prodId}" → BLOCKED even with all other flags valid`);
  assert(r.blockedReasons.includes('F009_PHASE5A_PRODUCTION_PROJECT_ID_BLOCKED'), `"${prodId}" → F009_PHASE5A_PRODUCTION_PROJECT_ID_BLOCKED`);
  assert(r.projectIdClassification === 'PRODUCTION', `"${prodId}" classified as PRODUCTION`);
}

{
  // Hard block cannot be bypassed even if somehow all string checks "look" fine
  const r = evaluateProductionEnvironmentGuard({
    nodeEnv: 'test',
    firestoreEmulatorHost: 'localhost:8080',
    projectId: 'umas-booking-manager',
    allowEmulatorOnlyFlag: 'true',
  });
  assert(r.allowed === false, 'production project id physically cannot be allowed regardless of other flags');
  assert(r.blocked === true, 'production project id → blocked=true (hard block)');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, projectId: undefined });
  assert(r.allowed === false, 'missing project id → BLOCKED (default-deny)');
  assert(r.blockedReasons.includes('F009_PHASE5A_UNKNOWN_PROJECT_ID'), 'missing project id → F009_PHASE5A_UNKNOWN_PROJECT_ID');
  assert(r.blockedReasons.includes('F009_PHASE5A_UNKNOWN_ENVIRONMENT_DEFAULT_DENY'), 'missing project id → default-deny reason present');
  assert(r.projectIdClassification === 'UNKNOWN', 'missing project id classified UNKNOWN');
}

{
  const r = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, projectId: 'some-random-unrelated-project' });
  assert(r.allowed === false, 'unknown/unrecognized project id → BLOCKED (default-deny)');
  assert(r.blockedReasons.includes('F009_PHASE5A_UNKNOWN_PROJECT_ID'), 'unknown project id → F009_PHASE5A_UNKNOWN_PROJECT_ID');
  assert(r.blockedReasons.includes('F009_PHASE5A_UNKNOWN_ENVIRONMENT_DEFAULT_DENY'), 'unknown project id → default-deny reason');
  assert(classifyProjectId('some-random-unrelated-project') === 'UNKNOWN', 'classifyProjectId → UNKNOWN for unrecognized id');
}

{
  // NODE_ENV=test alone is not sufficient
  const r = evaluateProductionEnvironmentGuard({
    nodeEnv: 'test',
    firestoreEmulatorHost: undefined,
    projectId: undefined,
    allowEmulatorOnlyFlag: undefined,
  });
  assert(r.allowed === false, 'NODE_ENV=test alone is NOT sufficient');
  assert(r.blockedReasons.length >= 3, 'NODE_ENV=test alone → multiple other reasons still present');
}

{
  const r = evaluateProductionEnvironmentGuard({
    nodeEnv: undefined,
    firestoreEmulatorHost: undefined,
    projectId: undefined,
    allowEmulatorOnlyFlag: undefined,
  });
  assert(r.allowed === false, 'completely empty/unknown environment → BLOCKED');
  assert(r.blocked === true, 'completely unknown environment → default-deny');
}

{
  assert(classifyProjectId('demo-group-meal-emulator') === 'EMULATOR_TEST', 'allow-listed emulator project id classified EMULATOR_TEST');
  assert(classifyProjectId('emulator-foo-test') === 'EMULATOR_TEST', 'heuristically-named emulator project id classified EMULATOR_TEST');
  assert(classifyProjectId(undefined) === 'UNKNOWN', 'undefined project id classified UNKNOWN');
  assert(classifyProjectId('') === 'UNKNOWN', 'empty project id classified UNKNOWN');
}

{
  const allowed = evaluateProductionEnvironmentGuard(FULL_VALID_ENV);
  let threw = false;
  try { assertProductionEnvironmentGuardAllowed(allowed); } catch { threw = true; }
  assert(threw === false, 'assertProductionEnvironmentGuardAllowed does not throw when allowed');

  const blocked = evaluateProductionEnvironmentGuard({ ...FULL_VALID_ENV, nodeEnv: 'production', projectId: 'umas-booking-manager' });
  let threwBlocked = false;
  try { assertProductionEnvironmentGuardAllowed(blocked); } catch (e) {
    threwBlocked = true;
    assert(e instanceof Error && e.message.includes('F009_PHASE5A_GUARD_BLOCKED'), 'thrown error mentions F009_PHASE5A_GUARD_BLOCKED');
  }
  assert(threwBlocked === true, 'assertProductionEnvironmentGuardAllowed throws when blocked');
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: In-memory Firestore-like fake — guard-first contract + happy path
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== Section 2: Real Transaction Executor (in-memory fake Firestore) ===');

class FakeStore {
  data = new Map<string, Record<string, unknown>>();
  snapshot(): Map<string, Record<string, unknown>> {
    return new Map(this.data);
  }
}

function makeFakeDb(_store: FakeStore): RealFirestoreLike {
  return {
    _kind: 'fake_firestore',
    doc(path: string): RealFirestoreDocRefLike {
      const id = path.split('/').pop() ?? path;
      return { path, id };
    },
  };
}

async function runSection2(): Promise<void> {
let runTransactionCallCount = 0;

function makeFakeRunTransaction(store: FakeStore): RunTransactionFn {
  return (async <T,>(_db: RealFirestoreLike, fn: (tx: RealFirestoreTransactionLike) => Promise<T>): Promise<T> => {
    runTransactionCallCount++;
    // Snapshot-isolated "transaction": stage writes, commit at the end if fn resolves.
    const staged = new Map<string, Record<string, unknown>>(store.data);
    const tx: RealFirestoreTransactionLike = {
      get: async (ref: RealFirestoreDocRefLike) => {
        const d = staged.get(ref.path);
        return {
          exists: d !== undefined,
          id: ref.id,
          data: () => d,
        };
      },
      set: (ref: RealFirestoreDocRefLike, data: Record<string, unknown>) => {
        staged.set(ref.path, { ...data });
        return undefined;
      },
      update: (ref: RealFirestoreDocRefLike, data: Record<string, unknown>) => {
        const existing = staged.get(ref.path) ?? {};
        staged.set(ref.path, { ...existing, ...data });
        return undefined;
      },
    };
    const result = await fn(tx);
    // commit
    store.data = staged;
    return result;
  }) as RunTransactionFn;
}

function makeHumanCaller(overrides?: Partial<VerifiedHumanCallerContext>): VerifiedHumanCallerContext {
  return {
    _kind: 'verified_human_caller_context',
    callerType: 'HUMAN',
    callerUserId: USER_ID,
    tenantId: TENANT,
    signInProvider: 'google.com',
    tokenVerificationSource: 'MIDDLEWARE_SERVER',
    tokenVerificationStatus: 'verified',
    verifiedAt: NOW,
    tokenIat: Math.floor(Date.now() / 1000) - 100,
    tokenExp: Math.floor(Date.now() / 1000) + 3600,
    tokenSubject: USER_ID,
    isServiceAccount: false,
    upstreamVerificationConfirmed: true,
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RealTransactionApplyRequest>): RealTransactionApplyRequest {
  return {
    _kind: 'real_transaction_apply_request',
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
    callerContext: makeHumanCaller(),
    now: NOW,
    ...overrides,
  };
}

function seedApproval(store: FakeStore, overrides?: Record<string, unknown>) {
  store.data.set(approvalDocPath(TENANT, APPROVAL_ID), {
    approvalId: APPROVAL_ID,
    tenantId: TENANT,
    sourceRecommendationId: REC_ID,
    approvedByUserId: USER_ID,
    status: 'APPROVED',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    configBeforeHash: BEFORE_HASH,
    configAfterHash: AFTER_HASH,
    diffHash: DIFF_HASH,
    applyToken: APPLY_TOKEN,
    auditTrailId: AUDIT_ID,
    expectedCurrentVersion: EXPECTED_VERSION,
    newVersion: NEW_VERSION,
    ...overrides,
  });
}

function seedSettings(store: FakeStore, overrides?: Record<string, unknown>) {
  store.data.set(settingsDocPath(TENANT), {
    tenantId: TENANT,
    currentVersion: EXPECTED_VERSION,
    currentConfigHash: BEFORE_HASH,
    currentConfig: { sample: 'config' },
    ...overrides,
  });
}

const canonicalizeCurrentConfig = (settingsData: Record<string, unknown> | undefined) => {
  const data = settingsData ?? {};
  return {
    currentConfigHash: (data.currentConfigHash as ReturnType<typeof asDiffHash>) ?? BEFORE_HASH,
    currentVersion: (data.currentVersion as ReturnType<typeof asConfigVersion>) ?? EXPECTED_VERSION,
    currentConfig: (data.currentConfig as Record<string, unknown>) ?? {},
  };
};

const ALLOWED_GUARD: ProductionEnvironmentGuardResult = {
  _kind: 'real_model_config_apply_production_environment_guard_result',
  allowed: true,
  blocked: false,
  blockedReasons: [],
  projectIdClassification: 'EMULATOR_TEST',
  evaluatedAt: new Date(),
};

const BLOCKED_GUARD: ProductionEnvironmentGuardResult = {
  _kind: 'real_model_config_apply_production_environment_guard_result',
  allowed: false,
  blocked: true,
  blockedReasons: ['F009_PHASE5A_NOT_TEST_ENV', 'F009_PHASE5A_PRODUCTION_PROJECT_ID_BLOCKED'],
  projectIdClassification: 'PRODUCTION',
  evaluatedAt: new Date(),
};

// ── Guard-first contract: blocked guard → runTransaction never invoked ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  runTransactionCallCount = 0;
  const runTransaction = makeFakeRunTransaction(store);

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store),
    runTransaction,
    guardResult: BLOCKED_GUARD,
    canonicalizeCurrentConfig,
  });

  assert(result.blocked === true, 'guard BLOCKED → result.blocked = true');
  assert(result.success === false, 'guard BLOCKED → result.success = false');
  assert(result.blockedReasons.includes('F009_PHASE5A_TRANSACTION_BLOCKED_BY_GUARD'), 'guard BLOCKED → F009_PHASE5A_TRANSACTION_BLOCKED_BY_GUARD present');
  assert(result.blockedReasons.includes('F009_PHASE5A_PRODUCTION_PROJECT_ID_BLOCKED'), 'guard blocked reasons propagated');
  assert(runTransactionCallCount === 0, 'runTransaction is NEVER invoked when guard blocks (physical hard-block)');
  assert(store.data.size === 2, 'no writes occurred — store unchanged (only seeded docs present)');
}

// ── Happy path: guard allowed → full successful apply ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  runTransactionCallCount = 0;
  const runTransaction = makeFakeRunTransaction(store);

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store),
    runTransaction,
    guardResult: ALLOWED_GUARD,
    canonicalizeCurrentConfig,
  });

  assert(result.success === true, 'valid emulator transaction → success');
  assert(result.blocked === false, 'valid emulator transaction → not blocked');
  assert(result.idempotentReplay === false, 'first apply is not an idempotent replay');
  assert(result.newVersion === NEW_VERSION, 'result carries newVersion');
  assert(runTransactionCallCount === 1, 'runTransaction invoked exactly once on success');

  const settings = store.data.get(settingsDocPath(TENANT));
  assert(settings !== undefined, 'settings document exists after apply');
  assert(settings?.currentVersion === NEW_VERSION, 'settings.currentVersion updated to newVersion');
  assert(settings?.currentConfigHash === AFTER_HASH, 'settings.currentConfigHash updated to configAfterHash');

  const history = store.data.get(settingsHistoryDocPath(TENANT, NEW_VERSION));
  assert(history !== undefined, 'settingsHistory new version document written');
  assert(history?.immutable === true, 'settingsHistory entry marked immutable');
  assert(history?.previousVersion === EXPECTED_VERSION, 'settingsHistory.previousVersion = expectedCurrentVersion');

  const lock = store.data.get(lockDocPath(TENANT, APPLY_TOKEN));
  assert(lock !== undefined, 'idempotency lock document written');
  assert(lock?.status === 'CONSUMED', 'idempotency lock transitioned to CONSUMED within the same transaction');

  const audit = store.data.get(auditEventDocPath(AUDIT_ID));
  assert(audit !== undefined, 'audit event document written');
  assert(audit?.eventType === 'MODEL_CONFIG_APPLIED', 'audit event eventType = MODEL_CONFIG_APPLIED');
}

// ── Same token + same payload → idempotent replay, no double mutation ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  const runTransaction = makeFakeRunTransaction(store);
  const deps = { db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig };

  const first = await executeRealModelConfigApplyTransaction(makeRequest(), deps);
  assert(first.success === true, 'duplicate-apply setup: first apply succeeds');

  const settingsAfterFirst = { ...store.data.get(settingsDocPath(TENANT)) };

  const second = await executeRealModelConfigApplyTransaction(makeRequest(), deps);
  assert(second.success === true, 'same token + same payload → treated as success (idempotent replay)');
  assert(second.idempotentReplay === true, 'same token + same payload → idempotentReplay = true');
  assert(second.blocked === false, 'idempotent replay is not a block');

  const settingsAfterSecond = store.data.get(settingsDocPath(TENANT));
  assert(JSON.stringify(settingsAfterFirst) === JSON.stringify(settingsAfterSecond), 'idempotent replay does not mutate settings again');
}

// ── Same token + different payload → BLOCKED ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  const runTransaction = makeFakeRunTransaction(store);
  const deps = { db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig };

  const first = await executeRealModelConfigApplyTransaction(makeRequest(), deps);
  assert(first.success === true, 'same-token-different-payload setup: first apply succeeds');

  // Replay with a different configAfterHash (different payload) but same token —
  // approval must also be re-seeded to match new hashes for a realistic scenario,
  // but the lock payloadHash mismatch should trip first.
  const differentPayloadReq = makeRequest({ configAfterHash: asDiffHash('hash-p5a-after-DIFFERENT') });
  const second = await executeRealModelConfigApplyTransaction(differentPayloadReq, deps);

  assert(second.success === false, 'same token + different payload → BLOCKED');
  assert(second.blocked === true, 'same token + different payload → blocked = true');
  assert(
    second.blockedReasons.some(r => r === 'F009_LOCK_ALREADY_CONSUMED' || r === 'F009_LOCK_PAYLOAD_MISMATCH' || r === 'F009_APPROVAL_AUDIT_TRAIL_MISMATCH' || r.startsWith('F008_APPROVAL') || r.startsWith('F009_APPROVAL')),
    'same token + different payload → blocked for payload/approval mismatch reason',
  );
}

// ── Same approvalId + different token → BLOCKED ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  const runTransaction = makeFakeRunTransaction(store);
  const deps = { db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig };

  const first = await executeRealModelConfigApplyTransaction(makeRequest(), deps);
  assert(first.success === true, 'same-approval-different-token setup: first apply succeeds');

  // Re-seed an approval row addressed by a different token but same approvalId.
  // The lock for APPLY_TOKEN_2 doesn't exist yet, but the existing lock for
  // APPLY_TOKEN references the same approvalId — our validator keys off the
  // lock read for the *requested* token, so to exercise the approvalId+token
  // conflict we simulate a pre-existing lock entry under the new token path
  // that itself records the original approvalId with a different token value
  // (representing a forged / reused approval-id replay).
  store.data.set(lockDocPath(TENANT, APPLY_TOKEN_2), {
    _kind: 'model_config_apply_idempotency_lock',
    lockId: `${TENANT}:${APPLY_TOKEN_2}`,
    tenantId: TENANT,
    approvalId: APPROVAL_ID, // same approvalId as original
    applyToken: APPLY_TOKEN, // but a DIFFERENT token recorded on the lock
    payloadHash: AFTER_HASH,
    expectedCurrentVersion: EXPECTED_VERSION,
    status: 'PENDING',
    ttlSeconds: 300,
    cleanupEligibleAfterSeconds: 360,
    createdAt: NOW,
  });

  const conflictingReq = makeRequest({ applyToken: APPLY_TOKEN_2 });
  const result = await executeRealModelConfigApplyTransaction(conflictingReq, deps);

  assert(result.success === false, 'same approvalId + different token → BLOCKED');
  assert(result.blocked === true, 'same approvalId + different token → blocked = true');
  assert(
    result.blockedReasons.includes('F009_LOCK_APPROVALID_TOKEN_CONFLICT')
      || result.blockedReasons.some(r => r.includes('TOKEN_MISMATCH') || r.includes('APPROVAL')),
    'same approvalId + different token → conflict reason present',
  );
}

// ── AI caller → hard-blocked ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  runTransactionCallCount = 0;
  const runTransaction = makeFakeRunTransaction(store);

  const aiReq = makeRequest({ callerContext: makeHumanCaller({ callerType: 'AI' }) });
  const result = await executeRealModelConfigApplyTransaction(aiReq, {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });

  assert(result.success === false, 'AI caller → BLOCKED');
  assert(result.blocked === true, 'AI caller → blocked = true');
  assert(result.blockedReasons.includes('F009_CALLER_NOT_HUMAN'), 'AI caller → F009_CALLER_NOT_HUMAN');
  assert(result.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'), 'AI caller → REAL_EXEC_AI_CALLER_BLOCKED');
  assert(result.abortContract !== null, 'AI caller block produces an abort contract');
  assert(result.abortContract?.abortReason === 'CALLER_VALIDATION_FAILED', 'abort contract reason = CALLER_VALIDATION_FAILED');
  assert(result.abortContract?.lockTransitionRequired === false, 'AI caller block — no lock acquired, no ABANDONED transition required');

  const settingsAfter = store.data.get(settingsDocPath(TENANT));
  assert(settingsAfter?.currentVersion === EXPECTED_VERSION, 'AI caller block → settings currentVersion unchanged (no mutation)');
  assert(store.data.get(settingsHistoryDocPath(TENANT, NEW_VERSION)) === undefined, 'AI caller block → no settingsHistory write');
}

// ── Service Account / Admin SDK bypass attempt → BLOCKED ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  const runTransaction = makeFakeRunTransaction(store);

  const saReq = makeRequest({
    callerContext: makeHumanCaller({
      callerType: 'SERVICE_ACCOUNT',
      isServiceAccount: true,
      signInProvider: 'service-account',
    }),
  });
  const result = await executeRealModelConfigApplyTransaction(saReq, {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });

  assert(result.success === false, 'Service Account caller → BLOCKED (cannot imply human business permission)');
  assert(result.blockedReasons.includes('F009_CALLER_SERVICE_ACCOUNT_BLOCKED'), 'Service Account → F009_CALLER_SERVICE_ACCOUNT_BLOCKED');

  const adminReq = makeRequest({
    callerContext: makeHumanCaller({
      callerType: 'ADMIN_SDK',
      isServiceAccount: true,
      signInProvider: 'admin-sdk',
    }),
  });
  const adminResult = await executeRealModelConfigApplyTransaction(adminReq, {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });
  assert(adminResult.success === false, 'Admin SDK caller → BLOCKED');
  assert(
    adminResult.blockedReasons.includes('F009_CALLER_ADMIN_SDK_BLOCKED') || adminResult.blockedReasons.includes('F009_CALLER_SERVICE_ACCOUNT_BLOCKED'),
    'Admin SDK → blocked with admin/service-account reason',
  );
}

// ── expectedCurrentVersion mismatch → BLOCKED, no partial mutation ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store, { currentVersion: asConfigVersion('v999-DIFFERENT') });
  const runTransaction = makeFakeRunTransaction(store);

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });

  assert(result.success === false, 'expectedCurrentVersion mismatch → BLOCKED');
  assert(result.blockedReasons.includes('F009_CONCURRENT_MODIFICATION_VERSION'), 'reason = F009_CONCURRENT_MODIFICATION_VERSION');
  assert(result.abortContract?.abortReason === 'VERSION_CONFLICT', 'abort contract reason = VERSION_CONFLICT');

  const settingsAfter = store.data.get(settingsDocPath(TENANT));
  assert(settingsAfter?.currentVersion === 'v999-DIFFERENT', 'abort path: settings left untouched (no partial mutation)');
  assert(store.data.get(settingsHistoryDocPath(TENANT, NEW_VERSION)) === undefined, 'abort path: no settingsHistory write');
  assert(store.data.get(lockDocPath(TENANT, APPLY_TOKEN)) === undefined, 'abort path before lock acquisition: no lock written');
}

// ── configBeforeHash / currentConfigHash mismatch → BLOCKED ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store, { currentConfigHash: asDiffHash('hash-DIFFERENT-CURRENT') });
  const runTransaction = makeFakeRunTransaction(store);

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });

  assert(result.success === false, 'currentConfig hash mismatch → BLOCKED');
  assert(result.blockedReasons.includes('F009_CONCURRENT_MODIFICATION_HASH'), 'reason = F009_CONCURRENT_MODIFICATION_HASH');
  assert(result.abortContract?.abortReason === 'HASH_MISMATCH', 'abort contract reason = HASH_MISMATCH');
}

// ── invalid approval / tenant mismatch / approvedBy mismatch → BLOCKED ──

{
  const store = new FakeStore();
  // approval missing entirely
  seedSettings(store);
  const runTransaction = makeFakeRunTransaction(store);

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });
  assert(result.success === false, 'missing approval → BLOCKED');
  assert(result.blockedReasons.includes('F009_APPROVAL_MISSING'), 'reason = F009_APPROVAL_MISSING');
  assert(result.abortContract?.abortReason === 'APPROVAL_VALIDATION_FAILED', 'abort contract reason = APPROVAL_VALIDATION_FAILED');
}

{
  const store = new FakeStore();
  seedApproval(store, { tenantId: asTenantId('OTHER_TENANT') });
  seedSettings(store);
  const runTransaction = makeFakeRunTransaction(store);

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });
  assert(result.success === false, 'approval tenant mismatch → BLOCKED');
  assert(result.blockedReasons.includes('F009_APPROVAL_TENANT_MISMATCH'), 'reason = F009_APPROVAL_TENANT_MISMATCH');
}

// ── duplicate apply (PENDING lock conflict) → BLOCKED ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);
  store.data.set(lockDocPath(TENANT, APPLY_TOKEN), {
    _kind: 'model_config_apply_idempotency_lock',
    lockId: `${TENANT}:${APPLY_TOKEN}`,
    tenantId: TENANT,
    approvalId: APPROVAL_ID,
    applyToken: APPLY_TOKEN,
    payloadHash: AFTER_HASH,
    expectedCurrentVersion: EXPECTED_VERSION,
    status: 'PENDING',
    ttlSeconds: 300,
    cleanupEligibleAfterSeconds: 360,
    createdAt: NOW,
  });
  const runTransaction = makeFakeRunTransaction(store);

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store), runTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });

  assert(result.success === false, 'duplicate apply with PENDING lock → BLOCKED');
  assert(result.blockedReasons.includes('F009_LOCK_PENDING_CONFLICT'), 'reason = F009_LOCK_PENDING_CONFLICT');
  assert(result.abortContract?.abortReason === 'IDEMPOTENCY_BLOCKED', 'abort contract reason = IDEMPOTENCY_BLOCKED');
}

// ── transaction failure / abort path → no partial mutation, ABANDONED required ──

{
  const store = new FakeStore();
  seedApproval(store);
  seedSettings(store);

  // A run-transaction wrapper that throws after the lock has been "set" but
  // before the transaction commits — simulating a mid-flight failure. Since
  // real Firestore transactions are atomic, nothing should be persisted.
  const throwingRunTransaction: RunTransactionFn = (async <T,>(
    _db: RealFirestoreLike,
    fn: (tx: RealFirestoreTransactionLike) => Promise<T>,
  ): Promise<T> => {
    const staged = new Map<string, Record<string, unknown>>(store.data);
    const tx: RealFirestoreTransactionLike = {
      get: async (ref: RealFirestoreDocRefLike) => {
        const d = staged.get(ref.path);
        return { exists: d !== undefined, id: ref.id, data: () => d };
      },
      set: (ref: RealFirestoreDocRefLike, data: Record<string, unknown>) => {
        staged.set(ref.path, { ...data });
        return undefined;
      },
      update: (ref: RealFirestoreDocRefLike, data: Record<string, unknown>) => {
        const existing = staged.get(ref.path) ?? {};
        staged.set(ref.path, { ...existing, ...data });
        return undefined;
      },
    };
    await fn(tx);
    throw new Error('SIMULATED_MID_FLIGHT_FAILURE');
  }) as RunTransactionFn;

  const result = await executeRealModelConfigApplyTransaction(makeRequest(), {
    db: makeFakeDb(store), runTransaction: throwingRunTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
  });

  assert(result.success === false, 'mid-flight transaction failure → BLOCKED / not success');
  assert(result.blocked === true, 'mid-flight transaction failure → blocked = true');
  assert(result.blockedReasons.includes('F009_PHASE5A_TRANSACTION_FAILED'), 'reason = F009_PHASE5A_TRANSACTION_FAILED');
  assert(result.abortContract?.abortReason === 'TRANSACTION_FAILED', 'abort contract reason = TRANSACTION_FAILED');
  assert(result.abortContract?.lockTransitionRequired === true, 'mid-flight failure after lock acquisition → ABANDONED transition required');
  assert(result.abortContract?.lockTransitionTarget === 'ABANDONED', 'lock transition target = ABANDONED');

  // The fake store was never committed (we threw before `store.data = staged`),
  // so the original seeded state remains — proving atomicity (no partial writes
  // observable outside the transaction).
  const settingsAfter = store.data.get(settingsDocPath(TENANT));
  assert(settingsAfter?.currentVersion === EXPECTED_VERSION, 'transaction atomicity: settings unchanged after abort (no partial mutation)');
  assert(store.data.get(lockDocPath(TENANT, APPLY_TOKEN)) === undefined, 'transaction atomicity: lock not persisted after abort (uncommitted)');
  assert(store.data.get(settingsHistoryDocPath(TENANT, NEW_VERSION)) === undefined, 'transaction atomicity: settingsHistory not persisted after abort');
}

// ─────────────────────────────────────────────────────────────────────────────

}

void (async () => {
  await runSection2();
  console.log(`\n=== Phase 5A unit test results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    throw new Error(`Phase 5A unit tests failed: ${failed} assertion(s) failed`);
  }
})();
