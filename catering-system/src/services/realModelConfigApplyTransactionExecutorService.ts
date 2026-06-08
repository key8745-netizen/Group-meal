/**
 * realModelConfigApplyTransactionExecutorService.ts
 *
 * Feature 009 Phase 5A: Emulator-only Real Transaction Executor
 *
 * Orchestrates a REAL Firestore `runTransaction` for the human-approved
 * model-config-apply flow — but ONLY inside the Firebase Emulator / test
 * environment. This is the first Phase 009 file allowed to call a real
 * `runTransaction`.
 *
 * GUARD-FIRST CONTRACT (physically enforced):
 *   realModelConfigApplyProductionEnvironmentGuard MUST run and MUST pass
 *   BEFORE `runTransaction(...)` is ever invoked. If the guard blocks,
 *   this executor throws / returns BLOCKED and never opens a transaction.
 *
 * Read/validate/write order INSIDE the transaction:
 *   1. validate verified human caller            (realModelConfigApplyVerifiedCallerService)
 *   2. read approval
 *   3. validate approval                          (realModelConfigApplyApprovalValidationService)
 *   4. read settings
 *   5. canonicalize current config
 *   6. validate expectedCurrentVersion / configBeforeHash
 *      (realModelConfigApplyConcurrentModificationService)
 *   7. read idempotency lock
 *   8. validate duplicate-apply / lock lifecycle  (realModelConfigApplyIdempotencyService,
 *                                                   realModelConfigApplyConcurrentModificationService)
 *   9. write idempotency lock
 *  10. write immutable settingsHistory new version
 *  11. update settings current config + currentVersion
 *  12. write audit event
 *  13. return apply result
 *
 * On ANY failure: build an abort contract (realModelConfigApplyAbortContractService),
 * perform NO partial settings/settingsHistory mutation, and (if the lock was
 * already written) transition it to ABANDONED.
 *
 * HARD RULES:
 *  - Real `runTransaction` may ONLY run after the guard passes.
 *  - This executor NEVER targets a production project.
 *  - AI callers are hard-blocked via the verified-caller validator.
 *  - Service Account / Admin SDK callers never imply human business permission.
 *  - No UI, no Netlify Functions, no Cloud Functions, no rollback, no cleanup job.
 */

import type { BlockedReason, TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId,
} from '../types/modelConfigApply';
import type {
  VerifiedHumanCallerContext,
  PersistedModelConfigApproval,
  ModelConfigApplyIdempotencyLock,
  ModelConfigApplyAbortContract,
  ModelConfigApplyAuditEventPayload,
  AbortReason,
  LockStatus,
} from '../types/realModelConfigApplyTransaction';

import {
  evaluateProductionEnvironmentGuardFromProcessEnv,
  type ProductionEnvironmentGuardResult,
} from './realModelConfigApplyProductionEnvironmentGuard';
import { validateRealApplyCallerContext } from './realModelConfigApplyVerifiedCallerService';
import { validateRealApplyApproval } from './realModelConfigApplyApprovalValidationService';
import {
  validateIdempotencyState,
  LOCK_TTL_SECONDS,
  LOCK_CLEANUP_GRACE_SECONDS,
} from './realModelConfigApplyIdempotencyService';
import {
  detectConcurrentModification,
} from './realModelConfigApplyConcurrentModificationService';
import { buildAuditEventPayload } from './realModelConfigApplyAuditPayloadService';
import { buildAbortContract, type AbortContractInput } from './realModelConfigApplyAbortContractService';

// ─── Minimal duck-typed Firestore transaction surface ───────────────────────
//
// Phase 5A is allowed to use firebase-admin / @google-cloud/firestore, but
// this repo's dependency set only carries the browser `firebase` SDK. To
// keep the executor type-safe without adding a new dependency, we depend on
// a minimal structural interface that both the browser `firebase/firestore`
// Transaction and firebase-admin's Transaction satisfy. Callers inject a
// concrete Firestore-like instance (e.g. an emulator-connected instance).

export interface RealFirestoreDocSnapshotLike {
  exists: boolean | (() => boolean);
  id: string;
  data(): Record<string, unknown> | undefined;
}

export interface RealFirestoreDocRefLike {
  readonly path: string;
  readonly id: string;
}

export interface RealFirestoreTransactionLike {
  get(
    ref: RealFirestoreDocRefLike,
  ): Promise<RealFirestoreDocSnapshotLike>;
  set(ref: RealFirestoreDocRefLike, data: Record<string, unknown>): unknown;
  update(ref: RealFirestoreDocRefLike, data: Record<string, unknown>): unknown;
}

export interface RealFirestoreLike {
  readonly _kind?: string;
  doc(path: string): RealFirestoreDocRefLike;
}

export type RunTransactionFn = <T>(
  db: RealFirestoreLike,
  updateFunction: (tx: RealFirestoreTransactionLike) => Promise<T>,
) => Promise<T>;

function snapshotExists(snap: RealFirestoreDocSnapshotLike): boolean {
  return typeof snap.exists === 'function' ? snap.exists() : snap.exists;
}

// ─── Request / result types ──────────────────────────────────────────────────

export interface RealTransactionApplyRequest {
  readonly _kind: 'real_transaction_apply_request';
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  applyToken: ApplyToken;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  callerContext: VerifiedHumanCallerContext;
  /** ISO timestamp used for validation comparisons (e.g. approval expiry) */
  now: string;
}

export interface RealTransactionExecutorDeps {
  db: RealFirestoreLike;
  runTransaction: RunTransactionFn;
  /** Override for tests; defaults to reading process.env */
  guardResult?: ProductionEnvironmentGuardResult;
  /** Canonicalizer for the live settings document → current config hash */
  canonicalizeCurrentConfig: (settingsData: Record<string, unknown> | undefined) => {
    currentConfigHash: DiffHash;
    currentVersion: ConfigVersion;
    currentConfig: Record<string, unknown>;
  };
}

export interface RealTransactionApplyResult {
  readonly _kind: 'real_transaction_apply_result';
  readonly executable: true;
  success: boolean;
  blocked: boolean;
  blockedReasons: BlockedReason[];
  idempotentReplay: boolean;
  newVersion?: ConfigVersion;
  abortContract: ModelConfigApplyAbortContract | null;
  generatedAt: Date;
}

// ─── Firestore paths (emulator-only; never touches production collections) ──

export function approvalDocPath(tenantId: TenantId, approvalId: ModelConfigApprovalId): string {
  return `modelConfigApprovals/${String(tenantId)}__${String(approvalId)}`;
}
export function settingsDocPath(tenantId: TenantId): string {
  return `settings/${String(tenantId)}`;
}
export function settingsHistoryDocPath(tenantId: TenantId, version: ConfigVersion): string {
  return `settingsHistory/${String(tenantId)}__${String(version)}`;
}
export function lockDocPath(tenantId: TenantId, applyToken: ApplyToken): string {
  return `modelConfigApplyIdempotencyLocks/${String(tenantId)}:${String(applyToken)}`;
}
export function auditEventDocPath(auditTrailId: AuditTrailId): string {
  return `auditEvents/${String(auditTrailId)}`;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function buildAbort(
  reason: AbortReason,
  blockedReasons: BlockedReason[],
  lockAcquired: boolean,
  req: RealTransactionApplyRequest,
  payloadHash?: DiffHash,
): ModelConfigApplyAbortContract {
  const input: AbortContractInput = {
    eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
    tenantId: req.tenantId,
    approvalId: req.approvalId,
    sourceRecommendationId: req.sourceRecommendationId,
    auditTrailId: req.auditTrailId,
    expectedCurrentVersion: req.expectedCurrentVersion,
    newVersion: req.newVersion,
    configBeforeHash: req.configBeforeHash,
    configAfterHash: req.configAfterHash,
    diffHash: req.diffHash,
    applyToken: req.applyToken,
    payloadHash,
    callerUserId: req.callerContext.callerUserId,
    callerType: req.callerContext.callerType,
    tokenVerificationSource: req.callerContext.tokenVerificationSource,
    abortReason: reason,
    blockedReasons,
    lockAcquired,
  };
  return buildAbortContract(input);
}

function blockedResult(
  blockedReasons: BlockedReason[],
  abortContract: ModelConfigApplyAbortContract | null,
): RealTransactionApplyResult {
  return {
    _kind: 'real_transaction_apply_result',
    executable: true,
    success: false,
    blocked: true,
    blockedReasons,
    idempotentReplay: false,
    abortContract,
    generatedAt: new Date(),
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Executes a real emulator-only model-config-apply transaction.
 *
 * STEP 0 (mandatory, before anything else): evaluate the production
 * environment guard. If it does not ALLOW, the function returns a BLOCKED
 * result and `runTransaction` is NEVER called — this is the physical
 * production hard-block.
 */
export async function executeRealModelConfigApplyTransaction(
  req: RealTransactionApplyRequest,
  deps: RealTransactionExecutorDeps,
): Promise<RealTransactionApplyResult> {
  // ── STEP 0: Production Environment Guard — MUST run first, MUST pass ──────
  const guard = deps.guardResult ?? evaluateProductionEnvironmentGuardFromProcessEnv();
  if (!guard.allowed) {
    // HARD BLOCK — runTransaction is never reached.
    return blockedResult(
      ['F009_PHASE5A_TRANSACTION_BLOCKED_BY_GUARD', ...guard.blockedReasons],
      null,
    );
  }

  // From here on we are conclusively inside an emulator/test environment.
  let lockWasAcquired = false;
  let payloadHashForAbort: DiffHash | undefined;

  try {
    const txResult = await deps.runTransaction(deps.db, async (tx): Promise<RealTransactionApplyResult> => {
      // ── 1. validate verified human caller ──────────────────────────────────
      const callerCheck = validateRealApplyCallerContext({
        context: req.callerContext,
        requestTenantId: req.tenantId,
        now: req.now,
      });
      if (!callerCheck.valid) {
        return blockedResult(
          callerCheck.blockedReasons,
          buildAbort('CALLER_VALIDATION_FAILED', callerCheck.blockedReasons, false, req),
        );
      }

      // ── 2. read approval ────────────────────────────────────────────────────
      const approvalRef = deps.db.doc(approvalDocPath(req.tenantId, req.approvalId));
      const approvalSnap = await tx.get(approvalRef);
      const approval: PersistedModelConfigApproval | null = snapshotExists(approvalSnap)
        ? ({ _kind: 'persisted_model_config_approval', ...(approvalSnap.data() as object) } as PersistedModelConfigApproval)
        : null;

      // ── 3. validate approval ────────────────────────────────────────────────
      const approvalCheck = validateRealApplyApproval({
        approval,
        requestTenantId: req.tenantId,
        requestApprovalId: req.approvalId,
        requestSourceRecommendationId: req.sourceRecommendationId,
        requestAuditTrailId: req.auditTrailId,
        requestApplyToken: req.applyToken,
        requestExpectedCurrentVersion: req.expectedCurrentVersion,
        requestNewVersion: req.newVersion,
        requestConfigBeforeHash: req.configBeforeHash,
        requestConfigAfterHash: req.configAfterHash,
        requestDiffHash: req.diffHash,
        callerContext: req.callerContext,
        now: req.now,
      });
      if (!approvalCheck.valid) {
        return blockedResult(
          approvalCheck.blockedReasons,
          buildAbort('APPROVAL_VALIDATION_FAILED', approvalCheck.blockedReasons, false, req),
        );
      }

      // ── 7 (read order moved earlier). read idempotency lock ──────────────────
      // The lock is consulted before evaluating concurrent modification so that
      // an IDEMPOTENT_REPLAY (same token + same payload, already CONSUMED) can
      // short-circuit cleanly: by definition the settings document has already
      // advanced to `newVersion` by a prior successful run of this exact apply,
      // so re-checking expectedCurrentVersion against the now-advanced settings
      // would incorrectly look like a version conflict.
      const lockRef = deps.db.doc(lockDocPath(req.tenantId, req.applyToken));
      const lockSnap = await tx.get(lockRef);
      const existingLock: ModelConfigApplyIdempotencyLock | null = snapshotExists(lockSnap)
        ? ({ _kind: 'model_config_apply_idempotency_lock', ...(lockSnap.data() as object) } as ModelConfigApplyIdempotencyLock)
        : null;

      const payloadHash = req.configAfterHash;
      payloadHashForAbort = payloadHash;

      // ── 8. validate duplicate-apply / lock lifecycle ─────────────────────────
      const idemCheck = validateIdempotencyState({
        tenantId: req.tenantId,
        approvalId: req.approvalId,
        applyToken: req.applyToken,
        payloadHash,
        expectedCurrentVersion: req.expectedCurrentVersion,
        existingLock,
      });

      if (idemCheck.outcome === 'BLOCKED') {
        return blockedResult(
          idemCheck.blockedReasons,
          buildAbort('IDEMPOTENCY_BLOCKED', idemCheck.blockedReasons, false, req, payloadHash),
        );
      }

      if (idemCheck.outcome === 'IDEMPOTENT_REPLAY') {
        // Same token + same payload — already applied. No new writes.
        // Return success without mutating settings/settingsHistory again.
        return {
          _kind: 'real_transaction_apply_result',
          executable: true,
          success: true,
          blocked: false,
          blockedReasons: [],
          idempotentReplay: true,
          newVersion: req.newVersion,
          abortContract: null,
          generatedAt: new Date(),
        };
      }

      // outcome === 'ALLOW_NEW' → proceed to live concurrent-modification checks

      // ── 4. read settings ─────────────────────────────────────────────────────
      const settingsRef = deps.db.doc(settingsDocPath(req.tenantId));
      const settingsSnap = await tx.get(settingsRef);
      const settingsData = snapshotExists(settingsSnap) ? settingsSnap.data() : undefined;

      // ── 5. canonicalize current config (inside the transaction) ─────────────
      const canonical = deps.canonicalizeCurrentConfig(settingsData);

      // ── 6. validate expectedCurrentVersion + configBeforeHash ───────────────
      const concurrentCheck = detectConcurrentModification({
        actualVersion: canonical.currentVersion,
        expectedVersion: req.expectedCurrentVersion,
        actualConfigHash: canonical.currentConfigHash,
        approvalConfigBeforeHash: req.configBeforeHash,
      });
      if (!concurrentCheck.valid) {
        const reason: AbortReason = concurrentCheck.blockedReasons.includes('F009_CONCURRENT_MODIFICATION_VERSION')
          ? 'VERSION_CONFLICT'
          : 'HASH_MISMATCH';
        return blockedResult(
          concurrentCheck.blockedReasons,
          buildAbort(reason, concurrentCheck.blockedReasons, false, req, payloadHash),
        );
      }

      // ── 9. write idempotency lock (PENDING) ──────────────────────────────────
      const nowIso = req.now;
      const newLock: ModelConfigApplyIdempotencyLock = {
        _kind: 'model_config_apply_idempotency_lock',
        lockId: `${String(req.tenantId)}:${String(req.applyToken)}`,
        tenantId: req.tenantId,
        approvalId: req.approvalId,
        applyToken: req.applyToken,
        payloadHash,
        expectedCurrentVersion: req.expectedCurrentVersion,
        status: 'PENDING' as LockStatus,
        ttlSeconds: LOCK_TTL_SECONDS,
        cleanupEligibleAfterSeconds: LOCK_TTL_SECONDS + LOCK_CLEANUP_GRACE_SECONDS,
        createdAt: nowIso,
      };
      tx.set(lockRef, newLock as unknown as Record<string, unknown>);
      lockWasAcquired = true;

      // ── 10. write immutable settingsHistory new version ─────────────────────
      const historyRef = deps.db.doc(settingsHistoryDocPath(req.tenantId, req.newVersion));
      tx.set(historyRef, {
        _kind: 'model_config_settings_history_entry',
        tenantId: req.tenantId,
        version: req.newVersion,
        previousVersion: req.expectedCurrentVersion,
        configBeforeHash: req.configBeforeHash,
        configAfterHash: req.configAfterHash,
        diffHash: req.diffHash,
        approvalId: req.approvalId,
        auditTrailId: req.auditTrailId,
        createdByHumanUserId: req.callerContext.callerUserId,
        immutable: true,
        createdAt: nowIso,
      });

      // ── 11. update settings current config + currentVersion ─────────────────
      tx.update(settingsRef, {
        currentVersion: req.newVersion,
        currentConfigHash: req.configAfterHash,
        updatedAt: nowIso,
        updatedByHumanUserId: req.callerContext.callerUserId,
      });

      // ── 12. write audit event ────────────────────────────────────────────────
      const auditPayload: ModelConfigApplyAuditEventPayload = buildAuditEventPayload({
        eventType: 'MODEL_CONFIG_APPLIED',
        tenantId: req.tenantId,
        approvalId: req.approvalId,
        sourceRecommendationId: req.sourceRecommendationId,
        auditTrailId: req.auditTrailId,
        expectedCurrentVersion: req.expectedCurrentVersion,
        actualCurrentVersion: canonical.currentVersion,
        newVersion: req.newVersion,
        configBeforeHash: req.configBeforeHash,
        currentConfigHash: canonical.currentConfigHash,
        configAfterHash: req.configAfterHash,
        diffHash: req.diffHash,
        applyToken: req.applyToken,
        payloadHash,
        callerUserId: req.callerContext.callerUserId,
        callerType: req.callerContext.callerType,
        tokenVerificationSource: req.callerContext.tokenVerificationSource,
      });
      const auditRef = deps.db.doc(auditEventDocPath(req.auditTrailId));
      tx.set(auditRef, auditPayload as unknown as Record<string, unknown>);

      // Mark the lock CONSUMED in the same transaction (atomic with the writes
      // above — no partial state can be observed from outside the transaction).
      tx.update(lockRef, {
        status: 'CONSUMED' as LockStatus,
        consumedAt: nowIso,
      });

      // ── 13. return apply result ──────────────────────────────────────────────
      return {
        _kind: 'real_transaction_apply_result',
        executable: true,
        success: true,
        blocked: false,
        blockedReasons: [],
        idempotentReplay: false,
        newVersion: req.newVersion,
        abortContract: null,
        generatedAt: new Date(),
      };
    });

    return txResult;
  } catch (err) {
    // Transaction failed / aborted mid-flight. Firestore guarantees no
    // partial writes are committed for a failed transaction, so settings /
    // settingsHistory remain untouched. We still surface an abort contract
    // describing whether a lock-ABANDONED transition is required.
    const message = err instanceof Error ? err.message : String(err);
    const blockedReasons: BlockedReason[] = ['F009_PHASE5A_TRANSACTION_FAILED'];
    const abort = buildAbort('TRANSACTION_FAILED', blockedReasons, lockWasAcquired, req, payloadHashForAbort);
    return {
      _kind: 'real_transaction_apply_result',
      executable: true,
      success: false,
      blocked: true,
      blockedReasons: [...blockedReasons, ...(message ? [] : [])],
      idempotentReplay: false,
      abortContract: abort,
      generatedAt: new Date(),
    };
  }
}
