/**
 * purchaseOrderStatusGuard.test.ts
 *
 * Tests for validatePurchaseOrderStatusTransition() and canReceivePurchaseOrder().
 * Run with: npx tsx src/services/__tests__/purchaseOrderStatusGuard.test.ts
 */

import {
  validatePurchaseOrderStatusTransition,
  canReceivePurchaseOrder,
} from '../purchaseOrderStatusGuard';

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

console.log('\n── purchaseOrderStatusGuard ───────────────────────────────────');

// ── DRAFT → PENDING (human) ───────────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'DRAFT', toStatus: 'PENDING', callerType: 'human',
  });
  checkTrue('DRAFT → PENDING human: allowed', r.allowed);
  check('DRAFT → PENDING human: no blocked', r.blockedReasons, []);
}

// ── DRAFT → PENDING (ai) ──────────────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'DRAFT', toStatus: 'PENDING', callerType: 'ai',
  });
  check('DRAFT → PENDING ai: blocked', r.allowed, false);
  checkTrue('DRAFT → PENDING ai: AI_PURCHASE_SUBMIT_FORBIDDEN', r.blockedReasons.includes('AI_PURCHASE_SUBMIT_FORBIDDEN'));
}

// ── PENDING → RECEIVED (human) ────────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'PENDING', toStatus: 'RECEIVED', callerType: 'human',
  });
  checkTrue('PENDING → RECEIVED human: allowed', r.allowed);
  check('PENDING → RECEIVED human: no blocked', r.blockedReasons, []);
}

// ── PENDING → RECEIVED (ai) ───────────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'PENDING', toStatus: 'RECEIVED', callerType: 'ai',
  });
  check('PENDING → RECEIVED ai: blocked', r.allowed, false);
  checkTrue('PENDING → RECEIVED ai: AI_RECEIVING_FORBIDDEN', r.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
}

// ── PENDING → RECEIVED (system) ───────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'PENDING', toStatus: 'RECEIVED', callerType: 'system',
  });
  check('PENDING → RECEIVED system: blocked', r.allowed, false);
  checkTrue('PENDING → RECEIVED system: AI_RECEIVING_FORBIDDEN', r.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
}

// ── PENDING → CANCELLED (human) ──────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'PENDING', toStatus: 'CANCELLED', callerType: 'human',
  });
  checkTrue('PENDING → CANCELLED human: allowed', r.allowed);
}

// ── RECEIVED → any ────────────────────────────────────────────────────────────
{
  const r1 = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'RECEIVED', toStatus: 'PENDING', callerType: 'human',
  });
  check('RECEIVED → PENDING: blocked', r1.allowed, false);
  checkTrue('RECEIVED → PENDING: PURCHASE_ORDER_ALREADY_RECEIVED', r1.blockedReasons.includes('PURCHASE_ORDER_ALREADY_RECEIVED'));

  const r2 = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'RECEIVED', toStatus: 'CANCELLED', callerType: 'human',
  });
  check('RECEIVED → CANCELLED: blocked', r2.allowed, false);
}

// ── CANCELLED → any ───────────────────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'CANCELLED', toStatus: 'PENDING', callerType: 'human',
  });
  check('CANCELLED → PENDING: blocked', r.allowed, false);
  checkTrue('CANCELLED → PENDING: transition invalid', r.blockedReasons.includes('PURCHASE_ORDER_STATUS_TRANSITION_INVALID'));
}

// ── DRAFT → RECEIVED (skips PENDING) ─────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'DRAFT', toStatus: 'RECEIVED', callerType: 'human',
  });
  check('DRAFT → RECEIVED: blocked', r.allowed, false);
  checkTrue('DRAFT → RECEIVED: invalid transition', r.blockedReasons.includes('PURCHASE_ORDER_STATUS_TRANSITION_INVALID'));
}

// ── PENDING → DRAFT (backwards) ──────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'PENDING', toStatus: 'DRAFT', callerType: 'human',
  });
  check('PENDING → DRAFT: blocked', r.allowed, false);
  checkTrue('PENDING → DRAFT: transition invalid', r.blockedReasons.includes('PURCHASE_ORDER_STATUS_TRANSITION_INVALID'));
}

// ── Same status ────────────────────────────────────────────────────────────────
{
  const r = validatePurchaseOrderStatusTransition({
    purchaseOrderId: 'po_001', fromStatus: 'PENDING', toStatus: 'PENDING', callerType: 'human',
  });
  check('PENDING → PENDING: blocked', r.allowed, false);
  checkTrue('PENDING → PENDING: transition invalid', r.blockedReasons.includes('PURCHASE_ORDER_STATUS_TRANSITION_INVALID'));
}

// ── canReceivePurchaseOrder ───────────────────────────────────────────────────
{
  checkTrue('canReceive PENDING human: true', canReceivePurchaseOrder('PENDING', 'human'));
  check('canReceive PENDING ai: false', canReceivePurchaseOrder('PENDING', 'ai'), false);
  check('canReceive PENDING system: false', canReceivePurchaseOrder('PENDING', 'system'), false);
  check('canReceive DRAFT human: false', canReceivePurchaseOrder('DRAFT', 'human'), false);
  check('canReceive RECEIVED human: false', canReceivePurchaseOrder('RECEIVED', 'human'), false);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — purchaseOrderStatusGuard verified');
