/**
 * receivingIdempotencyService.test.ts
 *
 * Tests for createReceivingIdempotencyLock() and validateReceivingIdempotencyLock().
 * Run with: npx tsx src/services/__tests__/receivingIdempotencyService.test.ts
 */

import {
  createReceivingIdempotencyLock,
  validateReceivingIdempotencyLock,
  isLockExpired,
} from '../receivingIdempotencyService';
import { RECEIVING_LOCK_TTL_MS } from '../../types/receivingBoundary';
import type { TenantId } from '../../types/aiBoundary';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else {
    console.error(`  ❌ ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}
function checkTrue(label: string, v: boolean): void { check(label, v, true); }

const NOW    = new Date('2026-06-03T12:00:00Z');
const TENANT = 'tenant-idm-001' as TenantId;

console.log('\n── receivingIdempotencyService ───────────────────────────────');

// ── createReceivingIdempotencyLock ────────────────────────────────────────────
{
  const lock = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  checkTrue('lock: lockId present', lock.lockId.length > 0);
  check('lock: tenantId', lock.tenantId, TENANT);
  check('lock: purchaseOrderId', lock.purchaseOrderId, 'po_001');
  check('lock: receivingToken', lock.receivingToken, 'tok_001');
  check('lock: requestId', lock.requestId, 'req_001');
  check('lock: status = ACTIVE', lock.status, 'ACTIVE');
  check('lock: createdAt', lock.createdAt.toISOString(), NOW.toISOString());
  check('lock: expiresAt = now + TTL', lock.expiresAt.getTime(), NOW.getTime() + RECEIVING_LOCK_TTL_MS);
}

// ── Custom TTL ────────────────────────────────────────────────────────────────
{
  const FIVE_MIN = 5 * 60 * 1000;
  const lock = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW, FIVE_MIN);
  check('custom TTL: expiresAt', lock.expiresAt.getTime(), NOW.getTime() + FIVE_MIN);
}

// ── validateReceivingIdempotencyLock: null (no existing lock) ─────────────────
{
  const r = validateReceivingIdempotencyLock(null, NOW);
  checkTrue('null lock: canProceed', r.canProceed);
  check('null lock: no blocked', r.blockedReasons, []);
}

// ── CONSUMED lock ─────────────────────────────────────────────────────────────
{
  const lock = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  const consumed = { ...lock, status: 'CONSUMED' as const };
  const r = validateReceivingIdempotencyLock(consumed, NOW);
  check('consumed: canProceed false', r.canProceed, false);
  checkTrue('consumed: DUPLICATE_RECEIVING_ATTEMPT', r.blockedReasons.includes('DUPLICATE_RECEIVING_ATTEMPT'));
}

// ── EXPIRED status ────────────────────────────────────────────────────────────
{
  const lock = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  const expired = { ...lock, status: 'EXPIRED' as const };
  const r = validateReceivingIdempotencyLock(expired, NOW);
  check('expired status: canProceed false', r.canProceed, false);
  checkTrue('expired status: RECEIVING_LOCK_EXPIRED', r.blockedReasons.includes('RECEIVING_LOCK_EXPIRED'));
}

// ── ACTIVE lock past TTL ───────────────────────────────────────────────────────
{
  const lock = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  // Query far in the future
  const future = new Date(NOW.getTime() + RECEIVING_LOCK_TTL_MS + 1);
  const r = validateReceivingIdempotencyLock(lock, future);
  check('active past TTL: canProceed false', r.canProceed, false);
  checkTrue('active past TTL: RECEIVING_LOCK_EXPIRED', r.blockedReasons.includes('RECEIVING_LOCK_EXPIRED'));
}

// ── ACTIVE lock within TTL ─────────────────────────────────────────────────────
{
  const lock = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  const shortly = new Date(NOW.getTime() + 60_000); // 1 minute later
  const r = validateReceivingIdempotencyLock(lock, shortly);
  check('active in TTL: canProceed false (in-progress)', r.canProceed, false);
  checkTrue('active in TTL: RECEIVING_LOCK_ACTIVE', r.blockedReasons.includes('RECEIVING_LOCK_ACTIVE'));
}

// ── isLockExpired ─────────────────────────────────────────────────────────────
{
  const lock = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  check('isLockExpired now: false', isLockExpired(lock, NOW), false);

  const future = new Date(NOW.getTime() + RECEIVING_LOCK_TTL_MS + 1);
  checkTrue('isLockExpired future: true', isLockExpired(lock, future));
}

// ── Lock IDs are unique ───────────────────────────────────────────────────────
{
  const l1 = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  const l2 = createReceivingIdempotencyLock(TENANT, 'po_001', 'tok_001', 'req_001', NOW);
  checkTrue('lock IDs unique', l1.lockId !== l2.lockId);
}

// ── TTL constant sanity ───────────────────────────────────────────────────────
{
  check('TTL = 10 minutes', RECEIVING_LOCK_TTL_MS, 10 * 60 * 1000);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — receivingIdempotencyService verified');
