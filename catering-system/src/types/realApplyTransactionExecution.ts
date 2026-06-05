/**
 * realApplyTransactionExecution.ts
 *
 * Feature 008 Phase 1: Real Apply Transaction Executor — Pure Types
 *
 * Defines interfaces for the real model config apply transaction executor.
 * Phase 1 is pure logic / contract definition — no Firestore reads or writes.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - All write-set contracts are non-executable (executable: false)
 *  - AI caller hard-blocked
 *  - Human approval required before any apply
 */

import type { TenantId, AuditTrailId, BlockedReason } from './aiBoundary';
import type {
  ApplyToken,
  ConfigVersion,
  DiffHash,
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
} from './modelConfigApply';
import type { RealApplyCallerType } from './realModelConfigApplyExecution';

// ─── Token verification source ───────────────────────────────────────────────

/**
 * Where token verification was performed.
 * 'FIREBASE_ADMIN_SDK' — server-side Admin SDK verification (trusted).
 * 'MIDDLEWARE_SERVER' — upstream server middleware verified token (trusted).
 * 'CLIENT_SUPPLIED' — caller claims verified but no server check (UNTRUSTED).
 * 'UNKNOWN' — source not declared (UNTRUSTED).
 */
export type TokenVerificationSource =
  | 'FIREBASE_ADMIN_SDK'
  | 'MIDDLEWARE_SERVER'
  | 'CLIENT_SUPPLIED'
  | 'UNKNOWN';

// ─── Verified caller context snapshot ────────────────────────────────────────

/**
 * A caller context that has been verified by a trusted server-side authority.
 * Phase 1: structural contract only — no actual Firebase SDK call.
 */
export interface VerifiedCallerContextSnapshot {
  readonly _kind: 'verified_caller_context_snapshot';
  callerType: RealApplyCallerType;
  callerUserId: string;
  tenantId: TenantId;
  signInProvider: string;
  /** Source of the token verification — must be a trusted server-side source */
  tokenVerificationSource: TokenVerificationSource;
  /** ISO 8601 timestamp when the token was verified */
  verifiedAt: string;
  /** Token issued-at (unix seconds) */
  tokenIat: number;
  /** Token expiry (unix seconds) */
  tokenExp: number;
  /**
   * Phase 2: token subject (Firebase uid from token).
   * When present, must match callerUserId.
   */
  tokenSubject?: string;
  /**
   * Phase 2: whether this caller is a service account / Admin SDK caller.
   * When true, callerType must NOT be 'HUMAN'.
   */
  isServiceAccount?: boolean;
  /**
   * Phase 2: upstream verification flag — must be set by server middleware.
   * When tokenVerificationSource is FIREBASE_ADMIN_SDK or MIDDLEWARE_SERVER,
   * this must be true.
   */
  upstreamVerificationConfirmed?: boolean;
}

// ─── Persisted approval snapshot ─────────────────────────────────────────────

export type PersistedApprovalStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONSUMED';

/**
 * A structural snapshot of a persisted approval record.
 * Phase 1: does not read from Firestore — structural contract only.
 * Phase 2+ will populate this from a real Firestore read inside runTransaction.
 */
export interface PersistedApprovalSnapshot {
  readonly _kind: 'persisted_approval_snapshot';
  approvalId: ModelConfigApprovalId;
  tenantId: TenantId;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvedByUserId: string;
  status: PersistedApprovalStatus;
  /** ISO 8601 expiry — approval must not be consumed after this time */
  expiresAt: string;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
}

// ─── Transaction write-set contract ──────────────────────────────────────────

/**
 * Structural contract describing the four writes in a real apply transaction.
 * All fields are non-executable in Phase 1.
 * Phase 2+ will execute these inside a real runTransaction.
 */
export interface TransactionWriteSetContract {
  readonly _kind: 'transaction_write_set_contract';
  readonly executable: false;
  readonly aiCanExecute: false;

  /** settings/{tenantId} — currentVersion + currentConfig update */
  settingsWrite: SettingsWriteContract;
  /** settingsHistory/{tenantId}/versions/{newVersion} — immutable append */
  settingsHistoryWrite: SettingsHistoryWriteContract;
  /** modelConfigIdempotencyLocks/{tenantId}:{applyToken} — lock acquire */
  idempotencyLockWrite: IdempotencyLockWriteContract;
  /** auditEvents/{auditTrailId} — event append */
  auditEventWrite: AuditEventWriteContract;

  generatedAt: Date;
}

export interface SettingsWriteContract {
  readonly _kind: 'settings_write_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  collectionPath: 'settings';
  documentPath: string;
  newVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  configAfterHash: DiffHash;
  tenantId: TenantId;
}

export interface SettingsHistoryWriteContract {
  readonly _kind: 'settings_history_write_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly immutable: true;
  collectionPath: string;
  documentPath: string;
  tenantId: TenantId;
  version: ConfigVersion;
  previousVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  createdByHumanUserId: string;
}

export interface IdempotencyLockWriteContract {
  readonly _kind: 'idempotency_lock_write_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly aiCanOwnLock: false;
  collectionPath: 'modelConfigIdempotencyLocks';
  lockId: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
  payloadHash: DiffHash;
  expectedCurrentVersion: ConfigVersion;
  ttlSeconds: number;
  cleanupEligibleAfterSeconds: number;
}

export interface AuditEventWriteContract {
  readonly _kind: 'audit_event_write_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  collectionPath: 'auditEvents';
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  callerUserId: string;
  callerType: RealApplyCallerType;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  newVersion: ConfigVersion;
  tokenVerificationSource: TokenVerificationSource;
}

// ─── Executor validation result ───────────────────────────────────────────────

export interface ExecutorValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}
