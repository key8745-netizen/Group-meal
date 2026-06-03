/**
 * receivingTransactionService.test.ts
 *
 * Tests for validateReceivingBeforeWrite() and buildReceivingWritePayloads().
 * Both are pure functions — no Firestore calls.
 *
 * receivePurchaseOrderWithTransaction() calls Firestore and is not unit-tested
 * here; it is covered by integration tests at the Firestore emulator level.
 *
 * Run with: npx tsx src/services/__tests__/receivingTransactionService.test.ts
 */

import {
  validateReceivingBeforeWrite,
  buildReceivingWritePayloads,
  buildBlockedReceivingAuditEvent,
  type POSnapshotData,
  type LockSnapshotData,
} from '../receivingTransactionService';
import { validateReceivingConfirmation } from '../receivingBoundaryService';
import { validatePurchaseOrderStatusTransition } from '../purchaseOrderStatusGuard';
import { createReceivingIdempotencyLock } from '../receivingIdempotencyService';
import { buildReceivingTransactionDryRunPlan } from '../receivingTransactionPlanService';
import type { ReceivingConfirmationRequest } from '../../types/receivingBoundary';
import {
  RECEIVING_CONSUMED_LOCK_RETENTION_MS,
  RECEIVING_LOCK_TTL_MS,
} from '../../types/receivingBoundary';
import type { TenantId, AuditTrailId, Grams } from '../../types/aiBoundary';

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

const NOW      = new Date('2026-06-03T12:00:00Z');
const TENANT   = 'tenant-tx-001' as TenantId;
const TRAIL_ID = 'trail_tx_001' as AuditTrailId;
const PO_ID    = 'po_tx_001';

function makeRequest(overrides: Partial<ReceivingConfirmationRequest> = {}): ReceivingConfirmationRequest {
  return {
    requestId:        'req-tx-001',
    receivingToken:   'tok_tx_001',
    tenantId:         TENANT,
    purchaseOrderId:  PO_ID,
    auditTrailId:     TRAIL_ID,
    humanReceiverId:  'chef-receiver-001',
    callerType:       'human',
    orderedQtyGrams:  1000 as Grams,
    receivedQtyGrams: 1000 as Grams,
    receivedAt:       NOW,
    ...overrides,
  };
}

const PENDING_PO: POSnapshotData = { status: 'PENDING' };

console.log('\n── receivingTransactionService ────────────────────────────────');

// ════════════════════════════════════════════════════════════════════════════
// validateReceivingBeforeWrite
// ════════════════════════════════════════════════════════════════════════════

// ── Happy path: PENDING PO, no lock ──────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest(), poData: PENDING_PO, lockData: null, now: NOW,
  });
  checkTrue('happy: allowed', r.allowed);
  check('happy: no blocked', r.blockedReasons, []);
  check('happy: deltaQtyGrams = 0', r.deltaQtyGrams, 0);
  check('happy: deltaPercent = 0', r.deltaPercent, 0);
}

// ── AI caller ─────────────────────────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ callerType: 'ai' }), poData: PENDING_PO, lockData: null, now: NOW,
  });
  check('ai: blocked', r.allowed, false);
  checkTrue('ai: AI_RECEIVING_FORBIDDEN', r.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
  checkTrue('ai: AI_INVENTORY_UPDATE_FORBIDDEN', r.blockedReasons.includes('AI_INVENTORY_UPDATE_FORBIDDEN'));
}

// ── System caller ─────────────────────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ callerType: 'system' }), poData: PENDING_PO, lockData: null, now: NOW,
  });
  check('system: blocked', r.allowed, false);
  checkTrue('system: AI_RECEIVING_FORBIDDEN', r.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
}

// ── PO null (does not exist) ───────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest(), poData: null, lockData: null, now: NOW,
  });
  check('null PO: blocked', r.allowed, false);
  checkTrue('null PO: PURCHASE_ORDER_NOT_PENDING', r.blockedReasons.includes('PURCHASE_ORDER_NOT_PENDING'));
}

// ── PO status DRAFT → RECEIVED (forbidden) ────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest(), poData: { status: 'DRAFT' }, lockData: null, now: NOW,
  });
  check('DRAFT→RECEIVED: blocked', r.allowed, false);
  checkTrue('DRAFT→RECEIVED: status transition invalid or AI_RECEIVING_FORBIDDEN',
    r.blockedReasons.some(b =>
      b === 'PURCHASE_ORDER_STATUS_TRANSITION_INVALID' || b === 'AI_RECEIVING_FORBIDDEN'
    )
  );
}

// ── PO already RECEIVED ───────────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest(),
    poData:  { status: 'RECEIVED' },
    lockData: null,
    now: NOW,
  });
  check('already RECEIVED: blocked', r.allowed, false);
  checkTrue('already RECEIVED: PURCHASE_ORDER_ALREADY_RECEIVED',
    r.blockedReasons.includes('PURCHASE_ORDER_ALREADY_RECEIVED'));
}

// ── PO has receivedAt stamp → duplicate ──────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest(),
    poData:  { status: 'PENDING', receivedAt: NOW },
    lockData: null,
    now: NOW,
  });
  check('receivedAt stamp: blocked', r.allowed, false);
  checkTrue('receivedAt stamp: PURCHASE_ORDER_ALREADY_RECEIVED',
    r.blockedReasons.includes('PURCHASE_ORDER_ALREADY_RECEIVED'));
}

// ── PO has inventoryTransactionId stamp → duplicate ──────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest(),
    poData:  { status: 'PENDING', inventoryTransactionId: 'inv_tx_xxx' },
    lockData: null,
    now: NOW,
  });
  check('txId stamp: blocked', r.allowed, false);
  checkTrue('txId stamp: DUPLICATE_RECEIVING_ATTEMPT',
    r.blockedReasons.includes('DUPLICATE_RECEIVING_ATTEMPT'));
}

// ── Idempotency: CONSUMED lock ────────────────────────────────────────────
{
  const consumedLock: LockSnapshotData = {
    status: 'CONSUMED',
    expiresAt: { toDate: () => new Date(NOW.getTime() + RECEIVING_CONSUMED_LOCK_RETENTION_MS) },
  };
  const r = validateReceivingBeforeWrite({
    request: makeRequest(), poData: PENDING_PO, lockData: consumedLock, now: NOW,
  });
  check('consumed lock: blocked', r.allowed, false);
  checkTrue('consumed lock: DUPLICATE_RECEIVING_ATTEMPT',
    r.blockedReasons.includes('DUPLICATE_RECEIVING_ATTEMPT'));
}

// ── Idempotency: ACTIVE in-flight lock ────────────────────────────────────
{
  const activeLock: LockSnapshotData = {
    status: 'ACTIVE',
    expiresAt: { toDate: () => new Date(NOW.getTime() + RECEIVING_LOCK_TTL_MS) },
  };
  const r = validateReceivingBeforeWrite({
    request: makeRequest(), poData: PENDING_PO, lockData: activeLock, now: NOW,
  });
  check('active lock: blocked', r.allowed, false);
  checkTrue('active lock: RECEIVING_LOCK_ACTIVE',
    r.blockedReasons.includes('RECEIVING_LOCK_ACTIVE'));
}

// ── Idempotency: EXPIRED lock → can proceed ───────────────────────────────
{
  const expiredLock: LockSnapshotData = {
    status: 'EXPIRED',
    expiresAt: { toDate: () => new Date(NOW.getTime() - 1) },
  };
  const r = validateReceivingBeforeWrite({
    request: makeRequest(), poData: PENDING_PO, lockData: expiredLock, now: NOW,
  });
  check('expired lock: blocked', r.allowed, false);
  checkTrue('expired lock: RECEIVING_LOCK_EXPIRED',
    r.blockedReasons.includes('RECEIVING_LOCK_EXPIRED'));
}

// ── Delta > 15% without note → blocked ────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ receivedQtyGrams: 1200 as Grams }),
    poData:  PENDING_PO,
    lockData: null,
    now: NOW,
  });
  check('delta 20% no note: blocked', r.allowed, false);
  checkTrue('delta 20% no note: RECEIVING_DELTA_NOTE_REQUIRED',
    r.blockedReasons.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── Delta > 15% WITH note → allowed ───────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ receivedQtyGrams: 1200 as Grams, receivingNote: '多一箱' }),
    poData:  PENDING_PO,
    lockData: null,
    now: NOW,
  });
  checkTrue('delta 20% with note: allowed', r.allowed);
  checkTrue('delta 20% with note: warning', r.warnings.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── Delta computation ─────────────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ orderedQtyGrams: 1000 as Grams, receivedQtyGrams: 800 as Grams }),
    poData:  PENDING_PO,
    lockData: null,
    now: NOW,
  });
  checkTrue('delta −20%: allowed (under threshold — wait, 20% > 15%)...', false || !r.allowed);
  // −200g / 1000g = 20% → needs note
  checkTrue('delta −20%: RECEIVING_DELTA_NOTE_REQUIRED', r.blockedReasons.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
  check('delta −20%: deltaQtyGrams', r.deltaQtyGrams, -200);
  check('delta −20%: deltaPercent', r.deltaPercent, 20);
}

// ── Zero receivedQtyGrams ─────────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ receivedQtyGrams: 0 as Grams }),
    poData:  PENDING_PO,
    lockData: null,
    now: NOW,
  });
  check('zero qty: blocked', r.allowed, false);
  checkTrue('zero qty: INVALID_RECEIVED_QTY', r.blockedReasons.includes('INVALID_RECEIVED_QTY'));
}

// ── Missing humanReceiverId ───────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ humanReceiverId: '' }),
    poData:  PENDING_PO,
    lockData: null,
    now: NOW,
  });
  check('no receiver: blocked', r.allowed, false);
  checkTrue('no receiver: MISSING_HUMAN_RECEIVER', r.blockedReasons.includes('MISSING_HUMAN_RECEIVER'));
}

// ── Missing receivingToken ────────────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request: makeRequest({ receivingToken: '' }),
    poData:  PENDING_PO,
    lockData: null,
    now: NOW,
  });
  check('no token: blocked', r.allowed, false);
  checkTrue('no token: MISSING_RECEIVING_TOKEN', r.blockedReasons.includes('MISSING_RECEIVING_TOKEN'));
}

// ════════════════════════════════════════════════════════════════════════════
// buildReceivingWritePayloads
// ════════════════════════════════════════════════════════════════════════════

function makePayloads(overrides: Partial<ReceivingConfirmationRequest> = {}) {
  return buildReceivingWritePayloads({
    request:               makeRequest(overrides),
    inventoryTransactionId: 'inv_tx_001',
    deltaQtyGrams:         0 as Grams,
    deltaPercent:          0,
    now:                   NOW,
  });
}

{
  const p = makePayloads();

  // Lock invariants
  check('lock: status = CONSUMED', p.receivingLock.status, 'CONSUMED');
  check('lock: purchaseOrderId', p.receivingLock.purchaseOrderId, PO_ID);
  check('lock: receivingToken', p.receivingLock.receivingToken, 'tok_tx_001');
  check('lock: tenantId', p.receivingLock.tenantId, TENANT);
  checkTrue('lock: expiresAt = 30-min retention',
    p.receivingLock.expiresAt.getTime() === NOW.getTime() + RECEIVING_CONSUMED_LOCK_RETENTION_MS);

  // Inventory transaction invariants
  check('invTx: type = restock', p.inventoryTransaction.type, 'restock');
  check('invTx: quantity = 1 kg', p.inventoryTransaction.quantity, 1);
  check('invTx: receivedQtyGrams', p.inventoryTransaction.receivedQtyGrams, 1000);
  check('invTx: purchaseOrderId', p.inventoryTransaction.purchaseOrderId, PO_ID);
  check('invTx: performedBy', p.inventoryTransaction.performedBy, 'chef-receiver-001');

  // Inventory increment
  check('invIncrement: 1 kg', p.inventoryIncrementKg, 1);

  // PO update invariants
  check('po: status = RECEIVED', p.purchaseOrderUpdate.status, 'RECEIVED');
  check('po: receivedByHumanUserId', p.purchaseOrderUpdate.receivedByHumanUserId, 'chef-receiver-001');
  check('po: inventoryTransactionId', p.purchaseOrderUpdate.inventoryTransactionId, 'inv_tx_001');
  check('po: meta.orderedQtyGrams', p.purchaseOrderUpdate.aiReceivingMetadata.orderedQtyGrams, 1000);
  check('po: meta.receivedQtyGrams', p.purchaseOrderUpdate.aiReceivingMetadata.receivedQtyGrams, 1000);

  // AI performance metric invariants
  check('metric: aiCanMutateRules = false', p.aiPerformanceMetric.aiCanMutateRules, false);
  check('metric: createdBy = system', p.aiPerformanceMetric.createdBy, 'system');
  check('metric: tenantId', p.aiPerformanceMetric.tenantId, TENANT);
  check('metric: purchaseOrderId', p.aiPerformanceMetric.purchaseOrderId, PO_ID);
  checkTrue('metric: metricId present', p.aiPerformanceMetric.metricId.length > 0);

  // No performanceLogs field anywhere in payloads
  const payloadStr = JSON.stringify(p);
  // Check no field named exactly "performanceLogs" exists (substring match on JSON key with quotes)
  check('no performanceLogs in payloads', payloadStr.includes('"performanceLogs"'), false);
  check('no finalizedPerformanceLogs', payloadStr.includes('finalizedPerformanceLogs'), false);
  check('no operationalReports', payloadStr.includes('operationalReports'), false);

  // Audit event
  check('audit: eventType', p.auditEvent.eventType, 'PURCHASE_ORDER_RECEIVED');
  check('audit: actorType = human', p.auditEvent.actorType, 'human');
  check('audit: fromState = PENDING', p.auditEvent.fromState, 'PENDING');
  check('audit: toState = RECEIVED', p.auditEvent.toState, 'RECEIVED');
  check('audit: meta.aiCanMutateRules', (p.auditEvent.metadata as Record<string,unknown>).aiCanMutateRules, false);
  check('audit: meta.performanceLogsWritten', (p.auditEvent.metadata as Record<string,unknown>).performanceLogsWritten, false);
  checkTrue('audit: eventHash present', (p.auditEvent.eventHash ?? '').length > 0);
}

// ── buildBlockedReceivingAuditEvent ──────────────────────────────────────
{
  const blocked: import('../../types/aiBoundary').BlockedReason[] = ['AI_RECEIVING_FORBIDDEN'];
  const e = buildBlockedReceivingAuditEvent(makeRequest({ callerType: 'ai' }), blocked, NOW);
  check('blocked audit: eventType', e.eventType, 'RECEIVING_BLOCKED');
  check('blocked audit: toState', e.toState, 'BLOCKED');
  checkTrue('blocked audit: eventHash present', (e.eventHash ?? '').length > 0);
}

// ── Isolation: metric IDs are unique ─────────────────────────────────────
{
  const p1 = makePayloads();
  const p2 = makePayloads();
  checkTrue('metric IDs unique', p1.aiPerformanceMetric.metricId !== p2.aiPerformanceMetric.metricId);
}

// ── Lock TTL constants sanity ─────────────────────────────────────────────
{
  check('ACTIVE lock TTL = 10 min', RECEIVING_LOCK_TTL_MS, 10 * 60 * 1000);
  check('CONSUMED retention TTL = 30 min', RECEIVING_CONSUMED_LOCK_RETENTION_MS, 30 * 60 * 1000);
  checkTrue('CONSUMED TTL > ACTIVE TTL', RECEIVING_CONSUMED_LOCK_RETENTION_MS > RECEIVING_LOCK_TTL_MS);
}

// ── Regression: Phase 1 services still work ──────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest());
  checkTrue('p1 regression: boundary service', r.allowed);

  const s = validatePurchaseOrderStatusTransition({
    purchaseOrderId: PO_ID, fromStatus: 'PENDING', toStatus: 'RECEIVED', callerType: 'human',
  });
  checkTrue('p1 regression: status guard', s.allowed);

  const lock = createReceivingIdempotencyLock(TENANT, PO_ID, 'tok', 'req', NOW);
  check('p1 regression: lock status', lock.status, 'ACTIVE');

  const plan = buildReceivingTransactionDryRunPlan(makeRequest());
  checkTrue('p1 regression: dry-run plan', plan.blockedReasons.length === 0);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — receivingTransactionService verified');
