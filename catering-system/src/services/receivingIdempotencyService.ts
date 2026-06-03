/**
 * receivingIdempotencyService.ts
 *
 * Idempotency lock creation and validation for purchase order receiving (Feature 002).
 *
 * HARD RULES:
 *  1. No Firestore reads or writes — lock objects are pure in-memory values.
 *  2. No inventoryService calls.
 *  3. Lock creation always sets status = 'ACTIVE'.
 *  4. A lock with status 'CONSUMED' or 'EXPIRED' must block re-submission.
 *  5. A lock with status 'ACTIVE' and expiresAt in the past is treated as 'EXPIRED'.
 *  6. Lock TTL defaults to RECEIVING_LOCK_TTL_MS (10 minutes).
 *
 * Actual lock persistence is delegated to purchaseOrderService at execution time.
 */

import type { BlockedReason, TenantId } from '@/types/aiBoundary';
import type { ReceivingIdempotencyLock } from '@/types/receivingBoundary';
import { RECEIVING_LOCK_TTL_MS } from '@/types/receivingBoundary';

// ─── ID generation ────────────────────────────────────────────────────────────

function generateLockId(): string {
  return `lock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── createReceivingIdempotencyLock ───────────────────────────────────────────

/**
 * Builds a new ACTIVE idempotency lock for a receiving confirmation attempt.
 * Pure function — does not write to Firestore.
 *
 * @param tenantId          The tenant owning the purchase order
 * @param purchaseOrderId   The PENDING purchase order being received
 * @param receivingToken    A caller-provided token that uniquely identifies this attempt
 * @param requestId         The caller's idempotency request ID
 * @param now               Current timestamp (injected for testability)
 * @param ttlMs             Lock TTL in milliseconds (default: RECEIVING_LOCK_TTL_MS)
 */
export function createReceivingIdempotencyLock(
  tenantId: TenantId,
  purchaseOrderId: string,
  receivingToken: string,
  requestId: string,
  now: Date,
  ttlMs: number = RECEIVING_LOCK_TTL_MS,
): ReceivingIdempotencyLock {
  return {
    lockId:          generateLockId(),
    tenantId,
    purchaseOrderId,
    receivingToken,
    requestId,
    createdAt:       now,
    expiresAt:       new Date(now.getTime() + ttlMs),
    status:          'ACTIVE',
  };
}

// ─── validateReceivingIdempotencyLock ─────────────────────────────────────────

export interface LockValidationResult {
  canProceed: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Validates an existing idempotency lock before allowing a receiving attempt.
 *
 * Blocks when:
 *  - status === 'CONSUMED'  → DUPLICATE_RECEIVING_ATTEMPT
 *  - status === 'EXPIRED'   → RECEIVING_LOCK_EXPIRED
 *  - status === 'ACTIVE' and expiresAt is in the past → RECEIVING_LOCK_EXPIRED
 *  - status === 'ACTIVE' and expiresAt is in the future → RECEIVING_LOCK_ACTIVE
 *    (another attempt is already in progress)
 *
 * Returns canProceed === true only when no conflicting lock exists (null input).
 */
export function validateReceivingIdempotencyLock(
  existingLock: ReceivingIdempotencyLock | null,
  now: Date,
): LockValidationResult {
  if (existingLock === null) {
    return { canProceed: true, blockedReasons: [] };
  }

  const blocked: BlockedReason[] = [];

  if (existingLock.status === 'CONSUMED') {
    blocked.push('DUPLICATE_RECEIVING_ATTEMPT');
    return { canProceed: false, blockedReasons: blocked };
  }

  if (existingLock.status === 'EXPIRED') {
    blocked.push('RECEIVING_LOCK_EXPIRED');
    return { canProceed: false, blockedReasons: blocked };
  }

  // ACTIVE lock — check TTL
  if (existingLock.expiresAt <= now) {
    blocked.push('RECEIVING_LOCK_EXPIRED');
    return { canProceed: false, blockedReasons: blocked };
  }

  // ACTIVE and not yet expired — another attempt is in progress
  blocked.push('RECEIVING_LOCK_ACTIVE');
  return { canProceed: false, blockedReasons: blocked };
}

// ─── isLockExpired ────────────────────────────────────────────────────────────

/** Returns true when a lock is past its TTL, regardless of recorded status */
export function isLockExpired(lock: ReceivingIdempotencyLock, now: Date): boolean {
  return lock.expiresAt <= now;
}
