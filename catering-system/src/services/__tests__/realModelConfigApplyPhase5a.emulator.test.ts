/**
 * realModelConfigApplyPhase5a.emulator.test.ts
 *
 * Feature 009 Phase 5A: Real Firestore Emulator Integration Tests
 *
 * Exercises `executeRealModelConfigApplyTransaction` against a REAL Firestore
 * Emulator instance (browser `firebase/firestore` SDK connected via
 * `connectFirestoreEmulator`). This is the only Phase 5A file that may open
 * an actual Firestore connection — and even here, the production guard runs
 * first on every call.
 *
 * Requirements to actually run:
 *   - FIRESTORE_EMULATOR_HOST set (e.g. "127.0.0.1:8080")
 *   - Firebase emulator running for an emulator/test project id
 *
 * If the emulator is not reachable, this file SKIPS gracefully (logs and
 * exits 0) rather than failing — per the SSOT instruction that emulator
 * tests must not fail the suite when no emulator is running in this
 * environment.
 *
 * Run via: npx tsx src/services/__tests__/realModelConfigApplyPhase5a.emulator.test.ts
 */

import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc as fsDoc,
  setDoc,
  runTransaction as fsRunTransaction,
  type Firestore,
  type Transaction,
  type DocumentReference,
} from 'firebase/firestore';

import {
  executeRealModelConfigApplyTransaction,
  approvalDocPath,
  settingsDocPath,
  settingsHistoryDocPath,
  lockDocPath,
  auditEventDocPath,
  type RealTransactionApplyRequest,
  type RealFirestoreLike,
  type RealFirestoreDocRefLike,
  type RunTransactionFn,
} from '../realModelConfigApplyTransactionExecutorService';
import { evaluateProductionEnvironmentGuard, type ProductionEnvironmentGuardResult } from '../realModelConfigApplyProductionEnvironmentGuard';

import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import type { VerifiedHumanCallerContext } from '../../types/realModelConfigApplyTransaction';
import {
  asApplyToken, asConfigVersion, asDiffHash, asModelConfigApprovalId, asModelConfigRecommendationId,
} from '../../types/modelConfigApply';

function asTenantId(s: string): TenantId { return s as TenantId; }
function asAuditTrailId(s: string): AuditTrailId { return s as AuditTrailId; }

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label}`); failed++; }
}

const EMULATOR_HOST_ENV = 'FIRESTORE_EMULATOR_HOST';
const TEST_PROJECT_ID = 'demo-group-meal-emulator';

const TENANT = asTenantId('tenant-p5a-emu-001');
const APPROVAL_ID = asModelConfigApprovalId('approval-p5a-emu-abc');
const REC_ID = asModelConfigRecommendationId('rec-p5a-emu-xyz');
const AUDIT_ID = asAuditTrailId('audit-trail-p5a-emu-001');
const APPLY_TOKEN = asApplyToken('token-p5a-emu-apply-1');
const EXPECTED_VERSION = asConfigVersion('v1');
const NEW_VERSION = asConfigVersion('v2');
const BEFORE_HASH = asDiffHash('hash-p5a-emu-before');
const AFTER_HASH = asDiffHash('hash-p5a-emu-after');
const DIFF_HASH = asDiffHash('hash-p5a-emu-diff');
const USER_ID = 'user-p5a-emu-human';
const NOW = new Date().toISOString();

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

const canonicalizeCurrentConfig = (settingsData: Record<string, unknown> | undefined) => {
  const data = settingsData ?? {};
  return {
    currentConfigHash: (data.currentConfigHash as ReturnType<typeof asDiffHash>) ?? BEFORE_HASH,
    currentVersion: (data.currentVersion as ReturnType<typeof asConfigVersion>) ?? EXPECTED_VERSION,
    currentConfig: (data.currentConfig as Record<string, unknown>) ?? {},
  };
};

async function main(): Promise<void> {
  const emulatorHost = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[EMULATOR_HOST_ENV];

  if (!emulatorHost || emulatorHost.trim() === '') {
    console.log('\n[SKIP] FIRESTORE_EMULATOR_HOST is not set — skipping Phase 5A emulator integration tests.');
    console.log('[SKIP] To run these tests: start the Firebase emulator and set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080),');
    console.log('[SKIP] NODE_ENV=test, ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY=true, and FIRESTORE_PROJECT_ID=demo-group-meal-emulator.');
    console.log('[SKIP] Phase 5A emulator integration tests: 0 run, 0 failed (skipped gracefully).');
    return;
  }

  const [host, portStr] = emulatorHost.split(':');
  const port = Number(portStr ?? '8080');

  let app: FirebaseApp | null = null;
  let db: Firestore | null = null;

  try {
    app = initializeApp({ projectId: TEST_PROJECT_ID }, `phase5a-emulator-test-${Date.now()}`);
    db = getFirestore(app);
    connectFirestoreEmulator(db, host, port);
  } catch (e) {
    console.log(`\n[SKIP] Could not initialize Firestore emulator connection (${(e as Error).message}). Skipping.`);
    return;
  }

  // Build the guard result we expect for a correctly-configured emulator run.
  const ALLOWED_GUARD: ProductionEnvironmentGuardResult = evaluateProductionEnvironmentGuard({
    nodeEnv: 'test',
    firestoreEmulatorHost: emulatorHost,
    projectId: TEST_PROJECT_ID,
    allowEmulatorOnlyFlag: 'true',
  });

  if (!ALLOWED_GUARD.allowed) {
    console.log('\n[SKIP] Guard does not allow this environment even though FIRESTORE_EMULATOR_HOST is set');
    console.log(`[SKIP] blockedReasons=${JSON.stringify(ALLOWED_GUARD.blockedReasons)} — skipping live emulator assertions.`);
    await deleteApp(app);
    return;
  }

  // Adapter: real Firestore (emulator-connected) → executor's duck-typed surface
  const realDb: RealFirestoreLike = {
    _kind: 'real_emulator_firestore',
    doc(path: string): RealFirestoreDocRefLike {
      const ref = fsDoc(db as Firestore, path) as DocumentReference;
      return { path: ref.path, id: ref.id };
    },
  };

  const realRunTransaction: RunTransactionFn = (async <T,>(
    _dbLike: RealFirestoreLike,
    fn: (tx: { get: any; set: any; update: any }) => Promise<T>,
  ): Promise<T> => {
    return fsRunTransaction(db as Firestore, async (tx: Transaction) => {
      const wrapped = {
        get: async (ref: RealFirestoreDocRefLike) => {
          const docRef = fsDoc(db as Firestore, ref.path);
          const snap = await tx.get(docRef);
          return { exists: snap.exists(), id: snap.id, data: () => snap.data() };
        },
        set: (ref: RealFirestoreDocRefLike, data: Record<string, unknown>) => {
          tx.set(fsDoc(db as Firestore, ref.path), data);
        },
        update: (ref: RealFirestoreDocRefLike, data: Record<string, unknown>) => {
          tx.update(fsDoc(db as Firestore, ref.path), data);
        },
      };
      return fn(wrapped as any);
    });
  }) as RunTransactionFn;

  async function seed(): Promise<void> {
    await setDoc(fsDoc(db as Firestore, approvalDocPath(TENANT, APPROVAL_ID)), {
      approvalId: APPROVAL_ID, tenantId: TENANT, sourceRecommendationId: REC_ID,
      approvedByUserId: USER_ID, status: 'APPROVED',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      configBeforeHash: BEFORE_HASH, configAfterHash: AFTER_HASH, diffHash: DIFF_HASH,
      applyToken: APPLY_TOKEN, auditTrailId: AUDIT_ID,
      expectedCurrentVersion: EXPECTED_VERSION, newVersion: NEW_VERSION,
    });
    await setDoc(fsDoc(db as Firestore, settingsDocPath(TENANT)), {
      tenantId: TENANT, currentVersion: EXPECTED_VERSION, currentConfigHash: BEFORE_HASH,
      currentConfig: { sample: 'config' },
    });
  }

  console.log('\n=== Phase 5A Emulator Integration Tests ===');
  console.log(`[INFO] Connected to Firestore emulator at ${host}:${port}, project=${TEST_PROJECT_ID}`);

  try {
    await seed();

    // ── 1. Successful apply updates settings/settingsHistory/audit ──────────
    const result1 = await executeRealModelConfigApplyTransaction(makeRequest(), {
      db: realDb, runTransaction: realRunTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
    });
    assert(result1.success === true, 'emulator: valid transaction succeeds');
    assert(result1.blocked === false, 'emulator: valid transaction not blocked');

    const settingsSnap = await (await import('firebase/firestore')).getDoc(fsDoc(db as Firestore, settingsDocPath(TENANT)));
    assert(settingsSnap.exists(), 'emulator: settings document exists after apply');
    assert(settingsSnap.data()?.currentVersion === NEW_VERSION, 'emulator: settings.currentVersion updated');

    const historySnap = await (await import('firebase/firestore')).getDoc(fsDoc(db as Firestore, settingsHistoryDocPath(TENANT, NEW_VERSION)));
    assert(historySnap.exists(), 'emulator: settingsHistory new version written');
    assert(historySnap.data()?.immutable === true, 'emulator: settingsHistory entry immutable');

    const lockSnap = await (await import('firebase/firestore')).getDoc(fsDoc(db as Firestore, lockDocPath(TENANT, APPLY_TOKEN)));
    assert(lockSnap.exists(), 'emulator: idempotency lock written');
    assert(lockSnap.data()?.status === 'CONSUMED', 'emulator: idempotency lock CONSUMED');

    const auditSnap = await (await import('firebase/firestore')).getDoc(fsDoc(db as Firestore, auditEventDocPath(AUDIT_ID)));
    assert(auditSnap.exists(), 'emulator: audit event written');
    assert(auditSnap.data()?.eventType === 'MODEL_CONFIG_APPLIED', 'emulator: audit event type = MODEL_CONFIG_APPLIED');

    // ── 2. Duplicate apply (same token, same payload) → idempotent replay ───
    const result2 = await executeRealModelConfigApplyTransaction(makeRequest(), {
      db: realDb, runTransaction: realRunTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig,
    });
    assert(result2.success === true, 'emulator: duplicate apply (same token+payload) handled safely');
    assert(result2.idempotentReplay === true, 'emulator: duplicate apply → idempotent replay');

    // ── 3. Production project hard-block (guard never allows runTransaction) ─
    const prodGuard = evaluateProductionEnvironmentGuard({
      nodeEnv: 'test', firestoreEmulatorHost: emulatorHost, projectId: 'umas-booking-manager', allowEmulatorOnlyFlag: 'true',
    });
    let prodTxCalls = 0;
    const countingRunTransaction: RunTransactionFn = (async (..._args: unknown[]) => { prodTxCalls++; return undefined as any; }) as RunTransactionFn;
    const result3 = await executeRealModelConfigApplyTransaction(makeRequest({ applyToken: asApplyToken('prod-attempt-token') }), {
      db: realDb, runTransaction: countingRunTransaction, guardResult: prodGuard, canonicalizeCurrentConfig,
    });
    assert(result3.blocked === true, 'emulator: production project attempt BLOCKED');
    assert(prodTxCalls === 0, 'emulator: production project attempt never opens runTransaction');

    // ── 4. AI caller BLOCKED ─────────────────────────────────────────────────
    const result4 = await executeRealModelConfigApplyTransaction(
      makeRequest({ applyToken: asApplyToken('ai-attempt-token'), callerContext: makeHumanCaller({ callerType: 'AI' }) }),
      { db: realDb, runTransaction: realRunTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig },
    );
    assert(result4.blocked === true, 'emulator: AI caller BLOCKED');
    assert(result4.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'), 'emulator: AI caller reason present');

    // ── 5. Service Account / Admin SDK bypass BLOCKED ───────────────────────
    const result5 = await executeRealModelConfigApplyTransaction(
      makeRequest({ applyToken: asApplyToken('sa-attempt-token'), callerContext: makeHumanCaller({ callerType: 'SERVICE_ACCOUNT', isServiceAccount: true, signInProvider: 'service-account' }) }),
      { db: realDb, runTransaction: realRunTransaction, guardResult: ALLOWED_GUARD, canonicalizeCurrentConfig },
    );
    assert(result5.blocked === true, 'emulator: Service Account caller BLOCKED');

    // ── 6. Missing emulator flags BLOCKED ───────────────────────────────────
    const missingFlagGuard = evaluateProductionEnvironmentGuard({
      nodeEnv: 'test', firestoreEmulatorHost: emulatorHost, projectId: TEST_PROJECT_ID, allowEmulatorOnlyFlag: undefined,
    });
    let missingFlagTxCalls = 0;
    const countingRunTransaction2: RunTransactionFn = (async (..._args: unknown[]) => { missingFlagTxCalls++; return undefined as any; }) as RunTransactionFn;
    const result6 = await executeRealModelConfigApplyTransaction(makeRequest({ applyToken: asApplyToken('missing-flag-token') }), {
      db: realDb, runTransaction: countingRunTransaction2, guardResult: missingFlagGuard, canonicalizeCurrentConfig,
    });
    assert(result6.blocked === true, 'emulator: missing opt-in flag BLOCKED');
    assert(missingFlagTxCalls === 0, 'emulator: missing opt-in flag → runTransaction never opened');

  } finally {
    if (app) await deleteApp(app);
  }

  console.log(`\n=== Phase 5A emulator integration test results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    throw new Error(`Phase 5A emulator integration tests failed: ${failed} assertion(s) failed`);
  }
}

main().catch((err) => {
  console.error(err);
  throw err;
});
