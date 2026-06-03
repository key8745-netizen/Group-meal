/**
 * receivingTransactionPlanService.test.ts
 *
 * Tests for buildReceivingTransactionDryRunPlan(), planContainsStep(), isExecutablePlan().
 * Run with: npx tsx src/services/__tests__/receivingTransactionPlanService.test.ts
 */

import {
  buildReceivingTransactionDryRunPlan,
  planContainsStep,
  isExecutablePlan,
  ALL_STEPS,
} from '../receivingTransactionPlanService';
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
const TENANT   = 'tenant-pln-001' as TenantId;
const TRAIL_ID = 'trail_pln_001' as AuditTrailId;

function makeRequest(overrides: Partial<ReceivingConfirmationRequest> = {}): ReceivingConfirmationRequest {
  return {
    requestId:        'req-pln-001',
    receivingToken:   'tok_pln_001',
    tenantId:         TENANT,
    purchaseOrderId:  'po_pln_001',
    auditTrailId:     TRAIL_ID,
    humanReceiverId:  'chef-receiver-001',
    callerType:       'human',
    orderedQtyGrams:  1000 as import('../../types/aiBoundary').Grams,
    receivedQtyGrams: 1000 as import('../../types/aiBoundary').Grams,
    receivedAt:       NOW,
    ...overrides,
  };
}

console.log('\n── receivingTransactionPlanService ───────────────────────────');

// ── Happy path: full plan ─────────────────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest());
  checkTrue('happy: no blocked', plan.blockedReasons.length === 0);
  check('happy: purchaseOrderId', plan.purchaseOrderId, 'po_pln_001');
  check('happy: tenantId', plan.tenantId, TENANT);
  check('happy: receivingToken', plan.receivingToken, 'tok_pln_001');
  check('happy: requestId', plan.requestId, 'req-pln-001');
  check('happy: all steps count', plan.steps.length, ALL_STEPS.length);
  checkTrue('happy: is executable', isExecutablePlan(plan));
}

// ── All expected steps present ────────────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest());
  const required = [
    'READ_PURCHASE_ORDER',
    'READ_INVENTORY',
    'READ_IDEMPOTENCY_LOCK',
    'VALIDATE_PURCHASE_ORDER_PENDING',
    'VALIDATE_HUMAN_RECEIVER',
    'VALIDATE_IDEMPOTENCY',
    'VALIDATE_RECEIVED_QTY',
    'CREATE_RECEIVING_LOCK',
    'CREATE_INVENTORY_TRANSACTION',
    'INCREMENT_INVENTORY_CURRENT_STOCK_GRAMS',
    'UPDATE_PURCHASE_ORDER_RECEIVED',
    'APPEND_AUDIT_EVENT',
    'CREATE_AI_PERFORMANCE_METRIC',
  ] as const;

  for (const step of required) {
    checkTrue(`step present: ${step}`, planContainsStep(plan, step));
  }
}

// ── AI_PERFORMANCE_METRIC step is always last ─────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest());
  check('last step = CREATE_AI_PERFORMANCE_METRIC',
    plan.steps[plan.steps.length - 1], 'CREATE_AI_PERFORMANCE_METRIC');
}

// ── AI caller → blocked, steps = [] ──────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest({ callerType: 'ai' }));
  check('ai: steps empty', plan.steps, []);
  checkTrue('ai: AI_RECEIVING_FORBIDDEN', plan.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
  check('ai: not executable', isExecutablePlan(plan), false);
}

// ── System caller → blocked ───────────────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest({ callerType: 'system' }));
  check('system: steps empty', plan.steps, []);
  checkTrue('system: AI_RECEIVING_FORBIDDEN', plan.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
}

// ── Missing token → blocked ───────────────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest({ receivingToken: '' }));
  check('no token: steps empty', plan.steps, []);
  checkTrue('no token: MISSING_RECEIVING_TOKEN', plan.blockedReasons.includes('MISSING_RECEIVING_TOKEN'));
}

// ── Zero qty → blocked ────────────────────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest({ receivedQtyGrams: 0 as never }));
  check('zero qty: steps empty', plan.steps, []);
  checkTrue('zero qty: INVALID_RECEIVED_QTY', plan.blockedReasons.includes('INVALID_RECEIVED_QTY'));
}

// ── Delta >15% without note → blocked ────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest({ receivedQtyGrams: 1200 as never }));
  check('delta no note: steps empty', plan.steps, []);
  checkTrue('delta no note: RECEIVING_DELTA_NOTE_REQUIRED', plan.blockedReasons.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── Delta >15% WITH note → full plan + warning ────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest({
    receivedQtyGrams: 1200 as never,
    receivingNote:    '供應商給多了',
  }));
  checkTrue('delta with note: no blocked', plan.blockedReasons.length === 0);
  checkTrue('delta with note: is executable', isExecutablePlan(plan));
  checkTrue('delta with note: warning present', plan.warnings.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── planContainsStep: missing step ────────────────────────────────────────────
{
  const plan = buildReceivingTransactionDryRunPlan(makeRequest({ callerType: 'ai' }));
  check('blocked plan: no step', planContainsStep(plan, 'CREATE_INVENTORY_TRANSACTION'), false);
}

// ── ALL_STEPS contains 13 steps ───────────────────────────────────────────────
{
  check('ALL_STEPS count = 13', ALL_STEPS.length, 13);
}

// ── No Firestore: result is synchronous ──────────────────────────────────────
{
  const result = buildReceivingTransactionDryRunPlan(makeRequest());
  check('sync: not a Promise', result instanceof Promise, false);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — receivingTransactionPlanService verified');
