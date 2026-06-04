import type { TenantId, AuditTrailId, BlockedReason, CallerType } from './aiBoundary';
import type {
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  RollbackToken,
} from './modelConfigApply';

// ─── Lock Schema Constants ────────────────────────────────────────────────────

/** Firestore collection path for idempotency locks (documented, not used in Phase 1). */
export const IDEMPOTENCY_LOCK_COLLECTION = 'modelConfigIdempotencyLocks' as const;

/** Default TTL for an idempotency lock in seconds. Released on transaction commit. */
export const LOCK_TTL_SECONDS = 300 as const;

// ─── Lock Status ──────────────────────────────────────────────────────────────

export type LockStatus =
  | 'PLANNED'
  | 'ACTIVE'
  | 'RELEASED'
  | 'EXPIRED';

/**
 * Documents who is responsible for releasing an idempotency lock.
 *
 * TRANSACTION_COMMIT_RELEASES: The Firestore transaction that acquires
 *   the lock also deletes it on commit. Preferred path.
 * TTL_EXPIRES: If the transaction never commits (crash/timeout), Firestore
 *   TTL policy expires the document after LOCK_TTL_SECONDS.
 * MANUAL_ADMIN_RELEASE: Reserved for ops intervention when a lock is
 *   stuck beyond TTL (e.g., Firestore TTL delay in production).
 */
export type LockCleanupResponsibility =
  | 'TRANSACTION_COMMIT_RELEASES'
  | 'TTL_EXPIRES'
  | 'MANUAL_ADMIN_RELEASE';

// ─── Idempotency Lock Document Schema ────────────────────────────────────────

/**
 * Schema for a Firestore idempotency lock document.
 * Collection: `modelConfigIdempotencyLocks`
 * Document ID: `{tenantId}:{token}`
 *
 * Phase 1: this is a pure schema definition — no Firestore read/write.
 * Phase 2 (future): a real Firestore transaction will acquire this lock.
 */
export interface IdempotencyLockDocument {
  readonly _kind: 'idempotency_lock_document';
  lockId: string;
  token: ApplyToken | RollbackToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  rollbackTargetVersion?: ConfigVersion;
  rollbackReasonHash?: string;
  status: LockStatus;
  cleanupResponsibility: LockCleanupResponsibility;
  ttlSeconds: typeof LOCK_TTL_SECONDS;
  createdAt: Date;
  expiresAt: Date;
  releasedAt?: Date;
  createdByHumanUserId: string;
}

// ─── Lock Acquisition Plan ────────────────────────────────────────────────────

/**
 * Phase 1 plan-only representation of a lock acquisition intent.
 * Phase 2 will execute this against Firestore.
 */
export interface LockAcquisitionPlan {
  readonly _kind: 'lock_acquisition_plan';
  readonly planOnly: true;
  readonly executable: false;
  lockId: string;
  collection: typeof IDEMPOTENCY_LOCK_COLLECTION;
  documentPath: string;
  lockDocument: IdempotencyLockDocument;
  cleanupResponsibility: LockCleanupResponsibility;
  cleanupNote: string;
}

// ─── Historical Config Hash Verification ─────────────────────────────────────

/**
 * Verifies that the config content at a given version matches a stored hash.
 * Used in rollback to confirm the target version's content is unchanged.
 *
 * Phase 1: pure hash comparison — no Firestore read.
 */
export interface HistoricalConfigHashVerification {
  readonly _kind: 'historical_config_hash_verification';
  tenantId: TenantId;
  targetVersion: ConfigVersion;
  expectedHash: DiffHash;
  actualHash: DiffHash;
  verified: boolean;
  mismatch: boolean;
}

// ─── Real Apply Transaction Contract ─────────────────────────────────────────

/**
 * The validated gate contract that must be satisfied before a real apply
 * transaction may be initiated.
 *
 * Phase 1: produced by pure validation — no Firestore interaction.
 * Phase 2: this contract will be the entrance condition for runTransaction.
 *
 * Invariants:
 *   - executable is always false in Phase 1
 *   - aiCanExecute is always false (permanent hard invariant)
 *   - requiresHumanApproval is always true (permanent hard invariant)
 */
export interface RealApplyTransactionContract {
  readonly _kind: 'real_apply_transaction_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly requiresHumanApproval: true;
  contractId: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  applyToken: ApplyToken;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  callerType: CallerType;
  callerUserId: string;
  lockAcquisitionPlan: LockAcquisitionPlan;
  contractValid: boolean;
  blockedReasons: BlockedReason[];
  createdAt: Date;
}

// ─── Real Rollback Transaction Contract ──────────────────────────────────────

/**
 * The validated gate contract for a real rollback transaction.
 * Rollback is modeled as creating a new config version whose content
 * equals the rollbackTargetVersion config — it never deletes history.
 *
 * Phase 1: produced by pure validation — no Firestore interaction.
 */
export interface RealRollbackTransactionContract {
  readonly _kind: 'real_rollback_transaction_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly requiresHumanApproval: true;
  contractId: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  rollbackToken: RollbackToken;
  rollbackReason: string;
  rollbackReasonHash: string;
  historicalConfigHashVerification: HistoricalConfigHashVerification;
  callerType: CallerType;
  callerUserId: string;
  lockAcquisitionPlan: LockAcquisitionPlan;
  contractValid: boolean;
  blockedReasons: BlockedReason[];
  createdAt: Date;
}

// ─── Contract Validation Results ─────────────────────────────────────────────

export interface RealApplyContractResult {
  contractValid: boolean;
  blockedReasons: BlockedReason[];
  contract: RealApplyTransactionContract | null;
}

export interface RealRollbackContractResult {
  contractValid: boolean;
  blockedReasons: BlockedReason[];
  contract: RealRollbackTransactionContract | null;
}

// ─── Lock Schema Validation Result ───────────────────────────────────────────

export interface LockSchemaValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}
