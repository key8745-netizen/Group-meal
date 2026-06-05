/**
 * realModelConfigIdempotencySchemaService.ts
 *
 * Feature 007 Phase 1: Idempotency Lock Schema Validator
 *
 * Models and validates the idempotency lock schema for real model config apply.
 * Does NOT write, read, or acquire locks — pure schema validation only.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No real lock creation — pure schema validation only
 *  - AI cannot own a lock
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { TenantId } from '../types/aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId } from '../types/modelConfigApply';
import type {
  RealModelConfigIdempotencyLockSchema,
  RealApplyLockStatus,
} from '../types/realModelConfigApplyExecution';
import { asDiffHash } from '../types/modelConfigApply';

export const REAL_APPLY_LOCK_TTL_SECONDS = 300 as const;
export const REAL_APPLY_LOCK_GRACE_SECONDS = 60 as const;

// ─── Schema validation ────────────────────────────────────────────────────────

export interface LockSchemaValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

export type LockDuplicateBehavior =
  | 'SAME_TOKEN_SAME_PAYLOAD_IDEMPOTENT'
  | 'SAME_TOKEN_DIFFERENT_PAYLOAD_BLOCKED'
  | 'SAME_APPROVAL_DIFFERENT_TOKEN_BLOCKED'
  | 'STALE_EXPECTED_VERSION_BLOCKED'
  | 'NO_CONFLICT';

/**
 * Validates a RealModelConfigIdempotencyLockSchema for structural completeness.
 *
 * Does not write to Firestore — pure schema check.
 */
export function validateApplyIdempotencyLockSchema(
  schema: Partial<RealModelConfigIdempotencyLockSchema>,
): LockSchemaValidationResult {
  const blocked: BlockedReason[] = [];

  // tenantId required
  if (!schema.tenantId || (schema.tenantId as string).trim() === '') {
    blocked.push('REAL_EXEC_LOCK_MISSING_TENANT');
  }

  // applyToken required
  if (!schema.applyToken || (schema.applyToken as string).trim() === '') {
    blocked.push('REAL_EXEC_LOCK_MISSING_TOKEN');
  }

  // approvalId required
  if (!schema.approvalId || (schema.approvalId as string).trim() === '') {
    blocked.push('REAL_EXEC_LOCK_MISSING_APPROVAL');
  }

  // payloadHash required
  if (!schema.payloadHash || (schema.payloadHash as string).trim() === '') {
    blocked.push('REAL_EXEC_LOCK_MISSING_PAYLOAD_HASH');
  }

  // expectedCurrentVersion required
  if (!schema.expectedCurrentVersion || (schema.expectedCurrentVersion as string).trim() === '') {
    blocked.push('REAL_EXEC_LOCK_MISSING_EXPECTED_VERSION');
  }

  // status must be valid
  const validStatuses: RealApplyLockStatus[] = ['PENDING', 'CONSUMED', 'ABANDONED', 'EXPIRED'];
  if (!schema.status || !validStatuses.includes(schema.status)) {
    blocked.push('REAL_EXEC_LOCK_INVALID_STATUS');
  }

  // AI must not own a lock
  if (schema.aiCanOwnLock !== false) {
    blocked.push('REAL_EXEC_LOCK_AI_OWNER_BLOCKED');
  }

  // TTL must be valid
  if (schema.createdAt && schema.expiresAt) {
    if (schema.expiresAt.getTime() <= schema.createdAt.getTime()) {
      blocked.push('REAL_EXEC_LOCK_TTL_INVALID');
    }
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}

/**
 * Builds a valid lock schema document for a model config apply operation.
 * Does not write to Firestore — pure schema construction.
 */
export function buildApplyIdempotencyLockSchema(input: {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
  payloadHash: DiffHash;
  expectedCurrentVersion: ConfigVersion;
  now?: Date;
}): RealModelConfigIdempotencyLockSchema {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + REAL_APPLY_LOCK_TTL_SECONDS * 1000);
  const cleanupEligibleAt = new Date(expiresAt.getTime() + REAL_APPLY_LOCK_GRACE_SECONDS * 1000);

  return {
    _kind: 'real_model_config_idempotency_lock_schema',
    lockId: `${input.tenantId}:${input.applyToken}`,
    collectionPath: 'modelConfigIdempotencyLocks',
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    applyToken: input.applyToken,
    payloadHash: input.payloadHash,
    expectedCurrentVersion: input.expectedCurrentVersion,
    status: 'PENDING',
    createdAt: now,
    expiresAt,
    cleanupEligibleAt,
    aiCanOwnLock: false,
    cleanupOwner: 'SYSTEM_MAINTENANCE',
    cleanupTtlSeconds: REAL_APPLY_LOCK_TTL_SECONDS,
  };
}

/**
 * Determines the duplicate behavior for a candidate lock against an existing lock.
 * Pure logic — does not read Firestore.
 */
export function classifyLockDuplicateBehavior(
  candidate: { applyToken: ApplyToken; approvalId: ModelConfigApprovalId; payloadHash: DiffHash; expectedCurrentVersion: ConfigVersion },
  existing: { applyToken: ApplyToken; approvalId: ModelConfigApprovalId; payloadHash: DiffHash; expectedCurrentVersion: ConfigVersion },
): { behavior: LockDuplicateBehavior; blockedReasons: BlockedReason[] } {
  // Same token + same payload → idempotent replay (allowed)
  if (
    (candidate.applyToken as string) === (existing.applyToken as string) &&
    (candidate.payloadHash as string) === (existing.payloadHash as string)
  ) {
    return { behavior: 'SAME_TOKEN_SAME_PAYLOAD_IDEMPOTENT', blockedReasons: [] };
  }

  // Same token + different payload → blocked
  if ((candidate.applyToken as string) === (existing.applyToken as string)) {
    return { behavior: 'SAME_TOKEN_DIFFERENT_PAYLOAD_BLOCKED', blockedReasons: ['REAL_EXEC_LOCK_DUPLICATE_TOKEN'] };
  }

  // Same approvalId + different token → blocked (approval reuse)
  if (
    (candidate.approvalId as string) === (existing.approvalId as string) &&
    (candidate.applyToken as string) !== (existing.applyToken as string)
  ) {
    return { behavior: 'SAME_APPROVAL_DIFFERENT_TOKEN_BLOCKED', blockedReasons: ['REAL_EXEC_LOCK_APPROVAL_REUSE'] };
  }

  // Stale expectedCurrentVersion → blocked
  if ((candidate.expectedCurrentVersion as string) !== (existing.expectedCurrentVersion as string)) {
    return { behavior: 'STALE_EXPECTED_VERSION_BLOCKED', blockedReasons: ['REAL_EXEC_LOCK_VERSION_CONFLICT'] };
  }

  return { behavior: 'NO_CONFLICT', blockedReasons: [] };
}

// Expose asDiffHash for tests
export { asDiffHash };
