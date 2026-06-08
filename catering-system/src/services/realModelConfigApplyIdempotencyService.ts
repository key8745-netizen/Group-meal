/**
 * realModelConfigApplyIdempotencyService.ts
 *
 * Feature 009 Phase 1: Idempotency Lock Lifecycle Validator
 *
 * Models the idempotency lock lifecycle for a real apply transaction.
 * Phase 1: pure contract validation — no Firestore reads or writes.
 *
 * Lock ID format: {tenantId}:{applyToken}
 * TTL: 300s, cleanup eligible after 360s
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId } from '../types/modelConfigApply';
import type {
  ModelConfigApplyIdempotencyLock, LockStatus, F009ValidationResult,
} from '../types/realModelConfigApplyTransaction';

export const LOCK_TTL_SECONDS = 300 as const;
export const LOCK_CLEANUP_GRACE_SECONDS = 60 as const;

export type IdempotencyCheckOutcome =
  | 'ALLOW_NEW'          // no existing lock — may proceed to create
  | 'IDEMPOTENT_REPLAY'  // same token + same payloadHash — treat as already applied
  | 'BLOCKED';           // blocked for any reason

export interface IdempotencyCheckInput {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
  payloadHash: DiffHash; // canonical hash of configAfterHash
  expectedCurrentVersion: ConfigVersion;
  /** Existing lock from simulated store — null means no lock exists yet */
  existingLock: ModelConfigApplyIdempotencyLock | null | undefined;
}

export interface IdempotencyCheckResult {
  outcome: IdempotencyCheckOutcome;
  valid: boolean;
  blockedReasons: BlockedReason[];
}

function str(v: unknown): string { return v as string; }

/**
 * Validates idempotency state for a real apply request.
 *
 * Behavior:
 *  - No existing lock → ALLOW_NEW
 *  - Existing CONSUMED lock, same token + same payloadHash → IDEMPOTENT_REPLAY
 *  - Existing CONSUMED lock, different payloadHash → BLOCKED (LOCK_PAYLOAD_MISMATCH)
 *  - Existing PENDING lock → BLOCKED (LOCK_PENDING_CONFLICT)
 *  - Existing ABANDONED lock → BLOCKED (F009_ABORT_REQUIRED; retry requires new token)
 *  - Same approvalId + different token → BLOCKED (LOCK_APPROVALID_TOKEN_CONFLICT)
 *  - Stale expectedCurrentVersion → BLOCKED
 */
export function validateIdempotencyState(input: IdempotencyCheckInput): IdempotencyCheckResult {
  if (!input.existingLock) {
    return { outcome: 'ALLOW_NEW', valid: true, blockedReasons: [] };
  }

  const lock = input.existingLock;
  const blocked: BlockedReason[] = [];

  // same approvalId + different token → conflict
  if (
    str(lock.approvalId) === str(input.approvalId) &&
    str(lock.applyToken) !== str(input.applyToken)
  ) {
    blocked.push('F009_LOCK_APPROVALID_TOKEN_CONFLICT');
    return { outcome: 'BLOCKED', valid: false, blockedReasons: blocked };
  }

  // stale expectedCurrentVersion
  if (str(lock.expectedCurrentVersion) !== str(input.expectedCurrentVersion)) {
    blocked.push('F009_LOCK_STALE_VERSION');
    return { outcome: 'BLOCKED', valid: false, blockedReasons: blocked };
  }

  switch (lock.status) {
    case 'CONSUMED':
      if (str(lock.payloadHash) !== str(input.payloadHash)) {
        blocked.push('F009_LOCK_ALREADY_CONSUMED', 'F009_LOCK_PAYLOAD_MISMATCH');
        return { outcome: 'BLOCKED', valid: false, blockedReasons: blocked };
      }
      // same token + same payload → idempotent replay
      return { outcome: 'IDEMPOTENT_REPLAY', valid: true, blockedReasons: [] };

    case 'PENDING':
      blocked.push('F009_LOCK_PENDING_CONFLICT');
      return { outcome: 'BLOCKED', valid: false, blockedReasons: blocked };

    case 'ABANDONED':
      blocked.push('F009_ABORT_REQUIRED');
      return { outcome: 'BLOCKED', valid: false, blockedReasons: blocked };

    default:
      blocked.push('F009_ABORT_REQUIRED');
      return { outcome: 'BLOCKED', valid: false, blockedReasons: blocked };
  }
}

/** Builds a new idempotency lock contract (not written to Firestore in Phase 1). */
export function buildIdempotencyLockContract(
  input: Omit<ModelConfigApplyIdempotencyLock, '_kind' | 'ttlSeconds' | 'cleanupEligibleAfterSeconds' | 'status'>,
): ModelConfigApplyIdempotencyLock {
  return {
    ...input,
    _kind: 'model_config_apply_idempotency_lock',
    status: 'PENDING' as LockStatus,
    ttlSeconds: LOCK_TTL_SECONDS,
    cleanupEligibleAfterSeconds: LOCK_TTL_SECONDS + LOCK_CLEANUP_GRACE_SECONDS,
  };
}

/** Returns the Firestore path for an idempotency lock. */
export function buildLockPath(tenantId: TenantId, applyToken: ApplyToken): string {
  return `modelConfigIdempotencyLocks/${str(tenantId)}:${str(applyToken)}`;
}

/** Validates idempotency lock schema completeness. */
export function validateLockSchema(lock: unknown): F009ValidationResult {
  const blocked: BlockedReason[] = [];
  if (!lock || typeof lock !== 'object') {
    return { valid: false, blockedReasons: ['F009_ABORT_REQUIRED'] };
  }
  const l = lock as Partial<ModelConfigApplyIdempotencyLock>;
  if (!l.lockId || !l.tenantId || !l.approvalId || !l.applyToken || !l.payloadHash) {
    blocked.push('F009_ABORT_REQUIRED');
  }
  if (!l.expectedCurrentVersion) blocked.push('F009_LOCK_STALE_VERSION');
  if (!l.ttlSeconds || !l.cleanupEligibleAfterSeconds) blocked.push('F009_ABORT_REQUIRED');
  const unique = [...new Set(blocked)] as BlockedReason[];
  return { valid: unique.length === 0, blockedReasons: unique };
}
