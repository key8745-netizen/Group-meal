/**
 * realModelConfigApplyReadSetSnapshotService.ts
 *
 * Feature 009 Phase 2: Read-Set Snapshot Validators
 *
 * Pure validators for Firestore read-set snapshots (approval, settings, lock).
 * All inputs are plain TypeScript objects — no real Firestore reads.
 *
 * HARD RULES:
 *  - No firebase-admin import
 *  - No @google-cloud/firestore import
 *  - No runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { TenantId, AuditTrailId, BlockedReason } from '../types/aiBoundary';
import type {
  ApplyToken,
  ConfigVersion,
  DiffHash,
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
} from '../types/modelConfigApply';
import type {
  ApprovalLifecycleStatus,
  LockStatus,
  F009ValidationResult,
} from '../types/realModelConfigApplyTransaction';

// ─── Snapshot types ───────────────────────────────────────────────────────────

export interface ApprovalReadSetSnapshot {
  readonly _kind: 'approval_read_set_snapshot';
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  approvedBy: string;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  status: ApprovalLifecycleStatus;
  expiresAt: Date;
  configBeforeHash: DiffHash;
  applyToken: ApplyToken;
}

export interface SettingsReadSetSnapshot {
  readonly _kind: 'settings_read_set_snapshot';
  tenantId: TenantId;
  currentVersion: ConfigVersion;
  currentConfig: Record<string, unknown> | null;
  currentConfigHash: DiffHash;
}

export interface LockReadSetSnapshot {
  readonly _kind: 'lock_read_set_snapshot';
  lockId: string;
  tenantId: TenantId;
  applyToken: ApplyToken;
  approvalId: ModelConfigApprovalId;
  status: LockStatus;
  payloadHash: DiffHash;
  createdAt: Date;
  expiresAt: Date;
}

// ─── Request types ────────────────────────────────────────────────────────────

export interface ApprovalSnapshotValidationRequest {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  callerUserId: string;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  configBeforeHash: DiffHash;
  applyToken: ApplyToken;
  now: Date;
}

export interface SettingsSnapshotValidationRequest {
  tenantId: TenantId;
  expectedCurrentVersion: ConfigVersion;
  configBeforeHash: DiffHash; // from approval — must match settings hash
}

export interface LockSnapshotValidationRequest {
  applyToken: ApplyToken;
  approvalId: ModelConfigApprovalId;
  payloadHash: DiffHash;
}

// ─── Lock check result ────────────────────────────────────────────────────────

export type LockCheckResult =
  | { outcome: 'ALLOW_NEW' }
  | { outcome: 'IDEMPOTENT_REPLAY'; lockSnapshot: LockReadSetSnapshot }
  | { outcome: 'BLOCKED'; blockedReasons: BlockedReason[] };

// ─── Validators ───────────────────────────────────────────────────────────────

/**
 * Validates an approval read-set snapshot against the current request.
 * Checks for null, tenant match, id match, approvedBy, rec id, audit trail,
 * status, and expiry.
 */
export function validateApprovalReadSetSnapshot(
  snapshot: ApprovalReadSetSnapshot | null | undefined,
  request: ApprovalSnapshotValidationRequest,
): F009ValidationResult {
  const blockedReasons: BlockedReason[] = [];

  if (snapshot == null) {
    blockedReasons.push('F009_READSET_APPROVAL_MISSING');
    return { valid: false, blockedReasons };
  }

  if (snapshot.tenantId !== request.tenantId) {
    blockedReasons.push('F009_READSET_APPROVAL_TENANT_MISMATCH');
  }

  if (snapshot.approvalId !== request.approvalId) {
    blockedReasons.push('F009_READSET_APPROVAL_ID_MISMATCH');
  }

  if (snapshot.approvedBy !== request.callerUserId) {
    blockedReasons.push('F009_READSET_APPROVAL_APPROVED_BY_MISMATCH');
  }

  if (snapshot.sourceRecommendationId !== request.sourceRecommendationId) {
    blockedReasons.push('F009_READSET_APPROVAL_REC_MISMATCH');
  }

  if (snapshot.auditTrailId !== request.auditTrailId) {
    blockedReasons.push('F009_READSET_APPROVAL_AUDIT_TRAIL_MISMATCH');
  }

  if (snapshot.status !== 'APPROVED') {
    blockedReasons.push('F009_READSET_APPROVAL_NOT_APPROVED');
  }

  if (snapshot.expiresAt <= request.now) {
    blockedReasons.push('F009_READSET_APPROVAL_EXPIRED');
  }

  return { valid: blockedReasons.length === 0, blockedReasons };
}

/**
 * Validates a settings read-set snapshot against the current request.
 * Checks for null, tenant match, version, config presence, and hash.
 */
export function validateSettingsReadSetSnapshot(
  snapshot: SettingsReadSetSnapshot | null | undefined,
  request: SettingsSnapshotValidationRequest,
): F009ValidationResult {
  const blockedReasons: BlockedReason[] = [];

  if (snapshot == null) {
    blockedReasons.push('F009_READSET_SETTINGS_MISSING');
    return { valid: false, blockedReasons };
  }

  if (snapshot.tenantId !== request.tenantId) {
    blockedReasons.push('F009_READSET_SETTINGS_TENANT_MISMATCH');
  }

  if (snapshot.currentVersion !== request.expectedCurrentVersion) {
    blockedReasons.push('F009_READSET_SETTINGS_VERSION_MISMATCH');
  }

  if (snapshot.currentConfig == null) {
    blockedReasons.push('F009_READSET_SETTINGS_CONFIG_MISSING');
  }

  if (snapshot.currentConfigHash !== request.configBeforeHash) {
    blockedReasons.push('F009_READSET_SETTINGS_HASH_MISMATCH');
  }

  return { valid: blockedReasons.length === 0, blockedReasons };
}

/**
 * Validates/classifies an idempotency lock read-set snapshot.
 *
 * Outcomes:
 *  - null lock → ALLOW_NEW
 *  - same token + same payloadHash → IDEMPOTENT_REPLAY
 *  - same token + different payloadHash → BLOCKED (payload mismatch)
 *  - different token + same approvalId → BLOCKED (approval reuse conflict)
 *  - CONSUMED lock → BLOCKED
 *  - PENDING lock (different token) → BLOCKED
 *  - ABANDONED lock → ALLOW_NEW (clean retry)
 */
export function validateLockReadSetSnapshot(
  lockSnapshot: LockReadSetSnapshot | null | undefined,
  request: LockSnapshotValidationRequest,
): LockCheckResult {
  if (lockSnapshot == null) {
    return { outcome: 'ALLOW_NEW' };
  }

  const sameToken = lockSnapshot.applyToken === request.applyToken;
  const sameApproval = lockSnapshot.approvalId === request.approvalId;

  // ABANDONED — clean retry allowed regardless of token
  if (lockSnapshot.status === 'ABANDONED') {
    return { outcome: 'ALLOW_NEW' };
  }

  if (sameToken) {
    if (lockSnapshot.payloadHash === request.payloadHash) {
      // Idempotent replay
      return { outcome: 'IDEMPOTENT_REPLAY', lockSnapshot };
    } else {
      // Same token but different payload — conflict
      return { outcome: 'BLOCKED', blockedReasons: ['F009_READSET_LOCK_PAYLOAD_MISMATCH'] };
    }
  }

  // Different token
  if (sameApproval) {
    return { outcome: 'BLOCKED', blockedReasons: ['F009_READSET_LOCK_APPROVALID_TOKEN_CONFLICT'] };
  }

  if (lockSnapshot.status === 'CONSUMED') {
    return { outcome: 'BLOCKED', blockedReasons: ['F009_READSET_LOCK_CONSUMED'] };
  }

  if (lockSnapshot.status === 'PENDING') {
    return { outcome: 'BLOCKED', blockedReasons: ['F009_READSET_LOCK_PENDING_CONFLICT'] };
  }

  // Default: allow
  return { outcome: 'ALLOW_NEW' };
}
