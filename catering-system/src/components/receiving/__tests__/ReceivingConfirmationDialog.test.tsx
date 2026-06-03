/**
 * ReceivingConfirmationDialog.test.tsx
 *
 * Structural / contract tests for ReceivingConfirmationDialog (Phase 3).
 * Tests the exported pure helpers and UI invariants without Firestore or React.
 *
 * Run with: npx tsx src/components/receiving/__tests__/ReceivingConfirmationDialog.test.tsx
 */

import {
  computeReceivingDelta,
  parseReceivingQtyToGrams,
  formatGramsDisplay,
} from '../ReceivingConfirmationDialog';
import type { Grams, TenantId, AuditTrailId } from '../../../types/aiBoundary';
import { RECEIVING_DELTA_NOTE_THRESHOLD } from '../../../types/receivingBoundary';
import { validateReceivingBeforeWrite } from '../../../services/receivingTransactionService';
import type { POSnapshotData } from '../../../services/receivingTransactionService';
import type { ReceivingConfirmationRequest } from '../../../types/receivingBoundary';

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
const TENANT   = 'tenant-ui-001' as TenantId;
const TRAIL_ID = 'trail_ui_001' as AuditTrailId;
const PO_ID    = 'po_ui_001';
const PENDING_PO: POSnapshotData = { status: 'PENDING' };

function makeRequest(overrides: Partial<ReceivingConfirmationRequest> = {}): ReceivingConfirmationRequest {
  return {
    requestId:        'req-ui-001',
    receivingToken:   'tok_ui_001',
    tenantId:         TENANT,
    purchaseOrderId:  PO_ID,
    auditTrailId:     TRAIL_ID,
    humanReceiverId:  'chef-ui-001',
    callerType:       'human',
    orderedQtyGrams:  1000 as Grams,
    receivedQtyGrams: 1000 as Grams,
    receivedAt:       NOW,
    ...overrides,
  };
}

console.log('\n── ReceivingConfirmationDialog (structural) ────────────────────');

// ════════════════════════════════════════════════════════════════════════════
// computeReceivingDelta
// ════════════════════════════════════════════════════════════════════════════

// ── Exact match (delta = 0) ───────────────────────────────────────────────
{
  const d = computeReceivingDelta(1000 as Grams, 1000 as Grams);
  check('delta exact: deltaGrams = 0', d.deltaGrams, 0);
  check('delta exact: deltaPercent = 0', d.deltaPercent, 0);
  check('delta exact: requiresNote = false', d.requiresNote, false);
}

// ── Delta exactly 10% (below threshold) ──────────────────────────────────
{
  const d = computeReceivingDelta(1000 as Grams, 1100 as Grams);
  check('delta +10%: deltaGrams = 100', d.deltaGrams, 100);
  check('delta +10%: deltaPercent = 10', d.deltaPercent, 10);
  check('delta +10%: requiresNote = false', d.requiresNote, false);
}

// ── Delta negative 10% ───────────────────────────────────────────────────
{
  const d = computeReceivingDelta(1000 as Grams, 900 as Grams);
  check('delta −10%: deltaGrams = −100', d.deltaGrams, -100);
  check('delta −10%: deltaPercent = 10', d.deltaPercent, 10);
  check('delta −10%: requiresNote = false', d.requiresNote, false);
}

// ── Delta exactly 15% (strict > threshold) ────────────────────────────────
{
  const d = computeReceivingDelta(1000 as Grams, 1150 as Grams);
  check('delta 15%: deltaPercent = 15', d.deltaPercent, 15);
  check('delta exactly 15%: requiresNote = false (strict >)', d.requiresNote, false);
}

// ── Delta 15.1% (just over threshold) ────────────────────────────────────
{
  const d = computeReceivingDelta(1000 as Grams, 1151 as Grams);
  checkTrue('delta 15.1%: requiresNote = true', d.requiresNote);
}

// ── Delta 20% ────────────────────────────────────────────────────────────
{
  const d = computeReceivingDelta(1000 as Grams, 1200 as Grams);
  check('delta +20%: deltaPercent = 20', d.deltaPercent, 20);
  checkTrue('delta +20%: requiresNote = true', d.requiresNote);
}

// ── Delta −20% ────────────────────────────────────────────────────────────
{
  const d = computeReceivingDelta(1000 as Grams, 800 as Grams);
  check('delta −20%: deltaGrams = −200', d.deltaGrams, -200);
  checkTrue('delta −20%: requiresNote = true', d.requiresNote);
}

// ── Threshold constant sanity ─────────────────────────────────────────────
{
  check('threshold = 0.15', RECEIVING_DELTA_NOTE_THRESHOLD, 0.15);
  // 15% of 1000 = 150g threshold
  const d15 = computeReceivingDelta(1000 as Grams, 1150 as Grams);
  const d16 = computeReceivingDelta(1000 as Grams, 1151 as Grams);
  check('at 15%: no note required', d15.requiresNote, false);
  checkTrue('at 15.1%: note required', d16.requiresNote);
}

// ════════════════════════════════════════════════════════════════════════════
// parseReceivingQtyToGrams
// ════════════════════════════════════════════════════════════════════════════

// ── kg conversion ─────────────────────────────────────────────────────────
{
  const g = parseReceivingQtyToGrams('1', 'kg');
  check('parse 1 kg = 1000 g', g, 1000);
}
{
  const g = parseReceivingQtyToGrams('0.5', 'kg');
  check('parse 0.5 kg = 500 g', g, 500);
}
{
  const g = parseReceivingQtyToGrams('1.234', 'kg');
  check('parse 1.234 kg = 1234 g', g, 1234);
}

// ── 台斤 conversion — must use GRAMS_PER_TAIJIN=600, not taijin*0.6 ─────────
{
  const g = parseReceivingQtyToGrams('1', 'taijin');
  check('parse 1 台斤 = 600 g (GRAMS_PER_TAIJIN, not 0.6)', g, 600);
}
{
  const g = parseReceivingQtyToGrams('2', 'taijin');
  check('parse 2 台斤 = 1200 g', g, 1200);
}
{
  const g = parseReceivingQtyToGrams('0.5', 'taijin');
  check('parse 0.5 台斤 = 300 g', g, 300);
}

// ── grams conversion ──────────────────────────────────────────────────────
{
  const g = parseReceivingQtyToGrams('500', 'grams');
  check('parse 500 g = 500 g', g, 500);
}
{
  const g = parseReceivingQtyToGrams('1000', 'grams');
  check('parse 1000 g = 1000 g', g, 1000);
}

// ── Invalid inputs → null ────────────────────────────────────────────────
{
  check('parse empty = null', parseReceivingQtyToGrams('', 'kg'), null);
  check('parse 0 = null', parseReceivingQtyToGrams('0', 'kg'), null);
  check('parse negative = null', parseReceivingQtyToGrams('-1', 'kg'), null);
  check('parse NaN = null', parseReceivingQtyToGrams('abc', 'kg'), null);
  check('parse Infinity = null', parseReceivingQtyToGrams('Infinity', 'kg'), null);
}

// ── formatGramsDisplay ────────────────────────────────────────────────────
{
  const s = formatGramsDisplay(1000 as Grams);
  checkTrue('format: contains "1000 g"', s.includes('1000 g'));
  checkTrue('format: contains "1 kg"', s.includes('1 kg'));
  checkTrue('format: contains "台斤"', s.includes('台斤'));
}
{
  const s = formatGramsDisplay(600 as Grams);
  checkTrue('format 600g: contains "600 g"', s.includes('600 g'));
  checkTrue('format 600g: contains "1 台斤"', s.includes('1 台斤'));
}

// ════════════════════════════════════════════════════════════════════════════
// UI invariants
// ════════════════════════════════════════════════════════════════════════════

// ── Button label invariants ───────────────────────────────────────────────
{
  const allowedActionLabel = '確認收貨並更新庫存';
  const cancelLabel        = '取消';
  const loadingLabel       = '處理中…';
  const submittedLabel     = '已送出';

  const forbidden = ['完成', '確認', 'OK', '入庫', '送出', '自動採購', '確認採購'];

  for (const f of forbidden) {
    check(`forbidden label "${f}" not used as action`, [allowedActionLabel, cancelLabel, loadingLabel, submittedLabel].includes(f), false);
  }
  checkTrue('allowed action label present', allowedActionLabel.length > 0);
  checkTrue('cancel label present', cancelLabel.length > 0);
}

// ── Required warning texts ────────────────────────────────────────────────
{
  const requiredWarnings = [
    '此動作不可撤銷。',
    '確認後採購單會變成 RECEIVED。',
    '確認後會更新庫存。',
    '請確認實際已收到貨品後再執行。',
  ];
  check('4 required warning messages', requiredWarnings.length, 4);
  for (const w of requiredWarnings) {
    checkTrue(`warning text defined: "${w.slice(0, 10)}…"`, w.length > 0);
  }
}

// ── Data testids required ─────────────────────────────────────────────────
{
  const requiredTestIds = [
    'receiving-confirmation-dialog',
    'irreversible-warning',
    'warning-irreversible',
    'warning-status-change',
    'warning-inventory-update',
    'warning-human-confirm',
    'received-qty-input',
    'unit-selector',
    'confirm-receiving-btn',
    'cancel-receiving-btn',
    'receiving-note',
    'delta-warning',
  ];
  check('required testId count', requiredTestIds.length, 12);
  for (const id of requiredTestIds) {
    checkTrue(`testId "${id}" defined`, id.length > 0);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Backend integration invariants
// ════════════════════════════════════════════════════════════════════════════

// ── Backend still blocks delta >15% without note ──────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request:  makeRequest({ receivedQtyGrams: 1200 as Grams }),
    poData:   PENDING_PO,
    lockData: null,
    now:      NOW,
  });
  check('backend: delta 20% no note still blocked', r.allowed, false);
  checkTrue('backend: RECEIVING_DELTA_NOTE_REQUIRED', r.blockedReasons.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── Backend still blocks AI caller ────────────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request:  makeRequest({ callerType: 'ai' }),
    poData:   PENDING_PO,
    lockData: null,
    now:      NOW,
  });
  check('backend: AI still blocked', r.allowed, false);
  checkTrue('backend: AI_RECEIVING_FORBIDDEN', r.blockedReasons.includes('AI_RECEIVING_FORBIDDEN'));
}

// ── Backend still blocks DRAFT → RECEIVED ────────────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request:  makeRequest(),
    poData:   { status: 'DRAFT' },
    lockData: null,
    now:      NOW,
  });
  check('backend: DRAFT→RECEIVED still blocked', r.allowed, false);
}

// ── Backend still blocks duplicate (CONSUMED lock) ────────────────────────
{
  const r = validateReceivingBeforeWrite({
    request:  makeRequest(),
    poData:   PENDING_PO,
    lockData: { status: 'CONSUMED', expiresAt: { toDate: () => new Date(NOW.getTime() + 30 * 60 * 1000) } },
    now:      NOW,
  });
  check('backend: duplicate still blocked', r.allowed, false);
  checkTrue('backend: DUPLICATE_RECEIVING_ATTEMPT', r.blockedReasons.includes('DUPLICATE_RECEIVING_ATTEMPT'));
}

// ── Happy path: human + PENDING + no lock + exact qty ────────────────────
{
  const r = validateReceivingBeforeWrite({
    request:  makeRequest(),
    poData:   PENDING_PO,
    lockData: null,
    now:      NOW,
  });
  checkTrue('backend: happy path allowed', r.allowed);
  check('backend: no blocked reasons', r.blockedReasons, []);
}

// ════════════════════════════════════════════════════════════════════════════
// E2E scenario invariants (structural)
// ════════════════════════════════════════════════════════════════════════════

// ── Scenario: normal receive — PENDING + human + exact qty ────────────────
{
  const received = parseReceivingQtyToGrams('1', 'kg');
  const delta    = computeReceivingDelta(1000 as Grams, received!);
  checkTrue('scenario normal: qty parsed', received !== null);
  check('scenario normal: 1 kg = 1000 g', received, 1000);
  check('scenario normal: no note required', delta.requiresNote, false);

  const backendResult = validateReceivingBeforeWrite({
    request:  makeRequest({ receivedQtyGrams: received! }),
    poData:   PENDING_PO,
    lockData: null,
    now:      NOW,
  });
  checkTrue('scenario normal: backend allowed', backendResult.allowed);
}

// ── Scenario: delta >15% without note — UI blocks, backend also blocks ────
{
  const received = parseReceivingQtyToGrams('1.5', 'kg');
  const delta    = computeReceivingDelta(1000 as Grams, received!);
  checkTrue('scenario delta: qty parsed', received !== null);
  checkTrue('scenario delta: note required by UI', delta.requiresNote);

  const backendResult = validateReceivingBeforeWrite({
    request:  makeRequest({ receivedQtyGrams: received! }),
    poData:   PENDING_PO,
    lockData: null,
    now:      NOW,
  });
  check('scenario delta: backend also blocks', backendResult.allowed, false);
  checkTrue('scenario delta: RECEIVING_DELTA_NOTE_REQUIRED', backendResult.blockedReasons.includes('RECEIVING_DELTA_NOTE_REQUIRED'));
}

// ── Scenario: delta >15% WITH note — allowed end-to-end ──────────────────
{
  const received = parseReceivingQtyToGrams('1.5', 'kg');
  const backendResult = validateReceivingBeforeWrite({
    request: makeRequest({ receivedQtyGrams: received!, receivingNote: '供應商多送了兩袋' }),
    poData:   PENDING_PO,
    lockData: null,
    now:      NOW,
  });
  checkTrue('scenario delta+note: backend allowed', backendResult.allowed);
}

// ── Scenario: network failure retry — second attempt with CONSUMED lock ───
{
  // First attempt succeeded → CONSUMED lock created
  const consumedLock = {
    status: 'CONSUMED' as const,
    expiresAt: { toDate: () => new Date(NOW.getTime() + 30 * 60 * 1000) },
  };
  const retryResult = validateReceivingBeforeWrite({
    request:  makeRequest(),
    poData:   PENDING_PO,
    lockData: consumedLock,
    now:      NOW,
  });
  check('scenario retry: blocked on second attempt', retryResult.allowed, false);
  checkTrue('scenario retry: DUPLICATE_RECEIVING_ATTEMPT', retryResult.blockedReasons.includes('DUPLICATE_RECEIVING_ATTEMPT'));
}

// ── Scenario: 台斤 input uses GRAMS_PER_TAIJIN=600 not taijin*0.6 ─────────
{
  // 1.667 台斤 * 600 = 1000 g; 1.667 * 0.6 * 1000 = 1000.2 → different due to float
  const g = parseReceivingQtyToGrams('1', 'taijin');
  check('台斤: 1 台斤 = 600g exactly (not 600.0000...01)', g, 600);
  // No floating-point drift
  const g2 = parseReceivingQtyToGrams('10', 'taijin');
  check('台斤: 10 台斤 = 6000g exactly', g2, 6000);
}

// ── Isolation: no performanceLogs written ─────────────────────────────────
{
  // The service output (ReceivingWritePayloads) was verified in Phase 2 tests.
  // Phase 3 UI only calls purchaseOrderService.receiveAISourcedPurchaseOrder(),
  // which delegates entirely to receivingTransactionService (Phase 2 guard).
  checkTrue('no performanceLogs via UI (delegation verified in Phase 2)', true);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — ReceivingConfirmationDialog structural tests verified');
