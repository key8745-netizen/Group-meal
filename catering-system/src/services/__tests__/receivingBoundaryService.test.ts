/**
 * receivingBoundaryService.test.ts
 *
 * Tests for validateReceivingConfirmation().
 * Run with: npx tsx src/services/__tests__/receivingBoundaryService.test.ts
 */

import { validateReceivingConfirmation } from '../receivingBoundaryService';
import type { ReceivingConfirmationRequest } from '../../types/receivingBoundary';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

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
const TENANT   = 'tenant-rcv-001' as TenantId;
const TRAIL_ID = 'trail_rcv_001' as AuditTrailId;

function makeRequest(overrides: Partial<ReceivingConfirmationRequest> = {}): ReceivingConfirmationRequest {
  return {
    requestId:        'req-rcv-001',
    receivingToken:   'tok_rcv_001',
    tenantId:         TENANT,
    purchaseOrderId:  'po_rcv_001',
    auditTrailId:     TRAIL_ID,
    humanReceiverId:  'chef-receiver-001',
    callerType:       'human',
    orderedQtyGrams:  1000 as import('../../types/aiBoundary').Grams,
    receivedQtyGrams: 1000 as import('../../types/aiBoundary').Grams,
    receivedAt:       NOW,
    ...overrides,
  };
}

console.log('\n── receivingBoundaryService ───────────────────────────────────');

// ── Happy path (exact quantity) ───────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest());
  checkTrue('happy exact: allowed', r.allowed);
  check('happy exact: no blocked', r.blockedReasons, []);
  check('happy exact: deltaQtyGrams = 0', r.deltaQtyGrams, 0);
  check('happy exact: deltaPercent = 0', r.deltaPercent, 0);
}

// ── Delta within 15% (no note required) ──────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ receivedQtyGrams: 1100 as never }));
  checkTrue('delta 10%: allowed', r.allowed);
  check('delta 10%: no blocked', r.blockedReasons, []);
}

// ── Delta exactly 15% (boundary — strictly > 15% required) ───────────────────
{
  // 1150 / 1000 = exactly 15% — threshold is strict >, so this is allowed
  const r15 = validateReceivingConfirmation(makeRequest({ receivedQtyGrams: 1150 as never }));
  checkTrue('delta exactly 15%: allowed (threshold is strict >)', r15.allowed);
  // 1151 / 1000 = 15.1% — over threshold, needs note
  const r16 = validateReceivingConfirmation(makeRequest({ receivedQtyGrams: 1151 as never }));
  check('delta 15.1%: blocked', r16.allowed, false);
  checkTrue('delta 15.1%: RECEIVING_DELTA_NOTE_REQUIRED', r16.blockedReasons.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── Delta >15% with note ───────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({
    receivedQtyGrams: 1200 as never,
    receivingNote:    '供應商多送了一袋',
  }));
  checkTrue('delta 20% with note: allowed', r.allowed);
  check('delta 20% with note: no blocked', r.blockedReasons, []);
  checkTrue('delta 20% with note: warning present', r.warnings.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── AI caller ─────────────────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ callerType: 'ai' }));
  check('ai caller: blocked', r.allowed, false);
  checkTrue('ai caller: AI_RECEIVING_FORBIDDEN', r.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
  checkTrue('ai caller: AI_INVENTORY_UPDATE_FORBIDDEN', r.blockedReasons.includes('AI_INVENTORY_UPDATE_FORBIDDEN'));
}

// ── System caller ─────────────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ callerType: 'system' }));
  check('system caller: blocked', r.allowed, false);
  checkTrue('system caller: AI_RECEIVING_FORBIDDEN', r.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
}

// ── Missing humanReceiverId ───────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ humanReceiverId: '' }));
  check('no receiver: blocked', r.allowed, false);
  checkTrue('no receiver: MISSING_HUMAN_RECEIVER', r.blockedReasons.includes('MISSING_HUMAN_RECEIVER'));
}

// ── Missing receivingToken ────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ receivingToken: '' }));
  check('no token: blocked', r.allowed, false);
  checkTrue('no token: MISSING_RECEIVING_TOKEN', r.blockedReasons.includes('MISSING_RECEIVING_TOKEN'));
}

// ── Missing requestId ─────────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ requestId: '' }));
  check('no requestId: blocked', r.allowed, false);
  checkTrue('no requestId: MISSING_REQUEST_ID', r.blockedReasons.includes('MISSING_REQUEST_ID'));
}

// ── Missing purchaseOrderId ───────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ purchaseOrderId: '' }));
  check('no purchaseOrderId: blocked', r.allowed, false);
  checkTrue('no purchaseOrderId: PURCHASE_ORDER_NOT_PENDING', r.blockedReasons.includes('PURCHASE_ORDER_NOT_PENDING'));
}

// ── Zero receivedQtyGrams ─────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ receivedQtyGrams: 0 as never }));
  check('zero qty: blocked', r.allowed, false);
  checkTrue('zero qty: INVALID_RECEIVED_QTY', r.blockedReasons.includes('INVALID_RECEIVED_QTY'));
  checkTrue('zero qty: RECEIVED_QTY_GRAMS_REQUIRED', r.blockedReasons.includes('RECEIVED_QTY_GRAMS_REQUIRED'));
}

// ── Negative receivedQtyGrams ─────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ receivedQtyGrams: -500 as never }));
  check('negative qty: blocked', r.allowed, false);
  checkTrue('negative qty: INVALID_RECEIVED_QTY', r.blockedReasons.includes('INVALID_RECEIVED_QTY'));
}

// ── Delta precision ───────────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({
    orderedQtyGrams:  1000 as never,
    receivedQtyGrams: 900 as never,
  }));
  checkTrue('delta −10%: allowed', r.allowed);
  check('delta −10%: deltaQtyGrams = −100', r.deltaQtyGrams, -100);
  check('delta −10%: deltaPercent = 10', r.deltaPercent, 10);
}

// ── Missing auditTrailId ──────────────────────────────────────────────────────
{
  const r = validateReceivingConfirmation(makeRequest({ auditTrailId: '' as AuditTrailId }));
  check('no auditTrailId: blocked', r.allowed, false);
  checkTrue('no auditTrailId: MISSING_AUDIT_TRAIL_ID', r.blockedReasons.includes('MISSING_AUDIT_TRAIL_ID'));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — receivingBoundaryService verified');
