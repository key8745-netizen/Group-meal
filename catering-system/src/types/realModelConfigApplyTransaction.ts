/**
 * realModelConfigApplyTransaction.ts
 *
 * Feature 009 Phase 1: Real Model Config Apply Transaction — Pure Contract Types
 *
 * All contract types for the real model config apply transaction executor.
 * Phase 1 is pure logic / contract definition — no Firestore reads or writes.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - All write-set and transaction contracts: executable: false, aiCanExecute: false
 */

import type { TenantId, AuditTrailId, BlockedReason } from './aiBoundary';
import type {
  ApplyToken,
  ConfigVersion,
  DiffHash,
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
} from './modelConfigApply';
import type { TokenVerificationSource } from './realApplyTransactionExecution';

// ─── Caller types ─────────────────────────────────────────────────────────────

export type F009CallerType = 'HUMAN' | 'AI' | 'SERVICE_ACCOUNT' | 'ADMIN_SDK' | 'UNKNOWN';

// ─── Verified human caller context ───────────────────────────────────────────

/**
 * A human caller context verified by a trusted server-side authority.
 * Phase 1: structural contract — no actual Firebase SDK call.
 * Phase 2+ must populate from real Admin SDK verifyIdToken result.
 */
export interface VerifiedHumanCallerContext {
  readonly _kind: 'verified_human_caller_context';
  callerType: F009CallerType;
  callerUserId: string;
  tenantId: TenantId;
  signInProvider: string;
  tokenVerificationSource: TokenVerificationSource;
  tokenVerificationStatus: 'verified' | 'unverified' | 'forged' | string;
  verifiedAt: string;
  tokenIat: number;
  tokenExp: number;
  tokenSubject?: string;
  isServiceAccount?: boolean;
  upstreamVerificationConfirmed?: boolean;
}

// ─── Persisted model config approval ─────────────────────────────────────────

export type ApprovalLifecycleStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONSUMED';

/**
 * A persisted approval record read from Firestore (simulated in Phase 1).
 * Phase 2+ will read this from real Firestore inside runTransaction.
 */
export interface PersistedModelConfigApproval {
  readonly _kind: 'persisted_model_config_approval';
  approvalId: ModelConfigApprovalId;
  tenantId: TenantId;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvedByUserId: string;
  status: ApprovalLifecycleStatus;
  expiresAt: string;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  appliedAt?: string; // set when status becomes CONSUMED
}

// ─── Idempotency lock ────────────────────────────────────────────────────────

export type LockStatus = 'PENDING' | 'CONSUMED' | 'ABANDONED';

export interface ModelConfigApplyIdempotencyLock {
  readonly _kind: 'model_config_apply_idempotency_lock';
  lockId: string; // {tenantId}:{applyToken}
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
  payloadHash: DiffHash; // canonical hash of configAfterHash
  expectedCurrentVersion: ConfigVersion;
  status: LockStatus;
  ttlSeconds: number;
  cleanupEligibleAfterSeconds: number;
  createdAt: string;
  consumedAt?: string;
  abandonedAt?: string;
  abandonReason?: string;
}

// ─── Request ─────────────────────────────────────────────────────────────────

export interface RealModelConfigApplyRequest {
  readonly _kind: 'real_model_config_apply_request';
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
}

// ─── Read-set contract ───────────────────────────────────────────────────────

export interface ModelConfigApplyReadSetContract {
  readonly _kind: 'model_config_apply_read_set_contract';
  readonly executable: false;
  /** Firestore path for the persisted approval */
  approvalPath: string;
  /** Firestore path for the settings document */
  settingsPath: string;
  /** Firestore path for the idempotency lock */
  lockPath: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
}

// ─── Write-set contract ──────────────────────────────────────────────────────

export interface ModelConfigApplyWriteSetContract {
  readonly _kind: 'model_config_apply_write_set_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** modelConfigIdempotencyLocks/{lockId} */
  lockWrite: {
    path: string;
    lockId: string;
    ttlSeconds: number;
    cleanupEligibleAfterSeconds: number;
    executable: false;
    aiCanExecute: false;
  };
  /** settingsHistory/{tenantId}/versions/{newVersion} — immutable */
  historyWrite: {
    path: string;
    immutable: true;
    executable: false;
    aiCanExecute: false;
    version: ConfigVersion;
    previousVersion: ConfigVersion;
    configBeforeHash: DiffHash;
    configAfterHash: DiffHash;
    diffHash: DiffHash;
    approvalId: ModelConfigApprovalId;
    auditTrailId: AuditTrailId;
    createdByHumanUserId: string;
  };
  /** settings/{tenantId} — currentVersion + currentConfig update */
  settingsUpdate: {
    path: string;
    executable: false;
    aiCanExecute: false;
    newVersion: ConfigVersion;
    expectedCurrentVersion: ConfigVersion;
    configAfterHash: DiffHash;
  };
  /** auditEvents/{auditTrailId} */
  auditEventWrite: {
    path: string;
    executable: false;
    aiCanExecute: false;
  };
  generatedAt: Date;
}

// ─── Transaction contract ─────────────────────────────────────────────────────

export interface ModelConfigApplyTransactionContract {
  readonly _kind: 'model_config_apply_transaction_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readSet: ModelConfigApplyReadSetContract;
  writeSet: ModelConfigApplyWriteSetContract;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  generatedAt: Date;
}

// ─── Abort contract ──────────────────────────────────────────────────────────

export type AbortReason =
  | 'CALLER_VALIDATION_FAILED'
  | 'APPROVAL_VALIDATION_FAILED'
  | 'IDEMPOTENCY_BLOCKED'
  | 'HASH_MISMATCH'
  | 'VERSION_CONFLICT'
  | 'TRANSACTION_FAILED'
  | 'AUDIT_WRITE_FAILED';

export interface ModelConfigApplyAbortContract {
  readonly _kind: 'model_config_apply_abort_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  abortReason: AbortReason;
  blockedReasons: BlockedReason[];
  /** Lock must transition to ABANDONED when abort occurs after lock acquisition */
  lockTransitionRequired: boolean;
  lockTransitionTarget: 'ABANDONED' | null;
  /** Audit payload for the failure event — generated but not yet written */
  failureAuditPayload: ModelConfigApplyAuditEventPayload;
  abortedAt: Date;
}

// ─── Audit event payload ─────────────────────────────────────────────────────

export type AuditEventType =
  | 'MODEL_CONFIG_APPLY_REQUESTED'
  | 'MODEL_CONFIG_APPLY_STARTED'
  | 'MODEL_CONFIG_APPLIED'
  | 'MODEL_CONFIG_APPLY_BLOCKED'
  | 'MODEL_CONFIG_IDEMPOTENCY_BLOCKED'
  | 'MODEL_CONFIG_VERSION_CONFLICT_BLOCKED'
  | 'MODEL_CONFIG_HASH_MISMATCH_BLOCKED'
  | 'MODEL_CONFIG_APPROVAL_INVALID_BLOCKED'
  | 'MODEL_CONFIG_AUDIT_WRITE_FAILED';

export interface ModelConfigApplyAuditEventPayload {
  readonly _kind: 'model_config_apply_audit_event_payload';
  eventType: AuditEventType;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  actualCurrentVersion?: ConfigVersion; // populated on version conflict
  newVersion?: ConfigVersion;
  configBeforeHash: DiffHash;
  currentConfigHash?: DiffHash; // populated when snapshot hash is known
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  payloadHash?: DiffHash; // idempotency lock payload hash
  callerUserId: string;
  callerType: F009CallerType;
  tokenVerificationSource: TokenVerificationSource;
  blockedReasons?: BlockedReason[];
  generatedAt: Date;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface ModelConfigApplyResult {
  readonly _kind: 'model_config_apply_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  success: boolean;
  blocked: boolean;
  blockedReasons: BlockedReason[];
  contract: ModelConfigApplyTransactionContract | null;
  abortContract: ModelConfigApplyAbortContract | null;
  generatedAt: Date;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface F009ValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}
