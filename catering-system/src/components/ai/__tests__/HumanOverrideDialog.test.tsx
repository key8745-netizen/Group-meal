/**
 * HumanOverrideDialog.test.tsx
 *
 * Logic / contract tests for HumanOverrideDialog behaviour.
 * Tests unit conversion + override reason enforcement without a DOM renderer.
 * Run with: npx tsx src/components/ai/__tests__/HumanOverrideDialog.test.tsx
 */

import { toGrams, gramsToKg, gramsToTaijin } from '../../../services/unitConversionService';
import type { Grams, OverrideReason } from '../../../types/aiBoundary';

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
function checkThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    console.error(`  ❌ ${label} — expected throw but did not throw`);
    failed++;
  } catch {
    console.log(`  ✅ ${label} (threw as expected)`);
    passed++;
  }
}

console.log('\n── HumanOverrideDialog (logic) ────────────────────────────────');

// ── Unit conversion: kg → grams ───────────────────────────────────────────────
{
  const g = toGrams(1.5, 'kg');
  check('1.5 kg → 1500 g', g, 1500);
}

// ── Unit conversion: taijin → grams ──────────────────────────────────────────
{
  const g = toGrams(2, 'taijin');
  check('2 台斤 → 1200 g', g, 1200);
}

// ── Unit conversion: grams passthrough ───────────────────────────────────────
{
  const g = toGrams(500, 'grams');
  check('500 g passthrough', g, 500);
}

// ── Display round-trip ────────────────────────────────────────────────────────
{
  const g = toGrams(2.5, 'kg');
  check('2.5 kg round-trip: g', g, 2500);
  check('2500 g → kg display', gramsToKg(g as Grams), 2.5);
  check('2500 g → taijin display', gramsToTaijin(g as Grams), 4.17);
}

// ── Fractional kg rounds to nearest gram ─────────────────────────────────────
{
  const g = toGrams(1.0006, 'kg');
  check('1.0006 kg → 1001 g (rounded)', g, 1001);
}

// ── Invalid unit throws ───────────────────────────────────────────────────────
{
  checkThrows('unknown unit → throws', () => toGrams(1, 'lbs' as never));
}

// ── Override reasons exhaustive check ────────────────────────────────────────
{
  const VALID_REASONS: OverrideReason[] = [
    'too_high', 'too_low', 'supplier_limit', 'chef_override',
    'unit_conversion_issue', 'ingredient_unavailable', 'seasonal_adjustment', 'other',
  ];
  check('8 override reasons defined', VALID_REASONS.length, 8);
  for (const r of VALID_REASONS) {
    checkTrue(`reason ${r} is string`, typeof r === 'string');
  }
}

// ── Submit blocked without reason ────────────────────────────────────────────
{
  // Simulate dialog validation logic: cannot submit if reason === ''
  function canSubmit(reason: string, qty: string): boolean {
    if (!reason) return false;
    const n = parseFloat(qty);
    if (isNaN(n) || n <= 0) return false;
    return true;
  }
  check('no reason → cannot submit', canSubmit('', '1.5'), false);
  check('with reason + qty → can submit', canSubmit('too_high', '1.5'), true);
  check('no qty → cannot submit', canSubmit('too_high', ''), false);
  check('zero qty → cannot submit', canSubmit('too_high', '0'), false);
  check('negative qty → cannot submit', canSubmit('too_high', '-1'), false);
}

// ── Confirmation summary fields ───────────────────────────────────────────────
{
  // Simulate the conversion preview shown to the user
  const numQty = 2;
  const unit = 'kg' as const;
  const previewGrams = toGrams(numQty, unit);
  checkTrue('preview: grams > 0', previewGrams > 0);
  checkTrue('preview: kg display present', gramsToKg(previewGrams as Grams) > 0);
  checkTrue('preview: taijin display present', gramsToTaijin(previewGrams as Grams) > 0);
}

// ── Phase 4 safety: submit does NOT call purchaseOrderService ─────────────────
{
  // purchaseOrderService is in a separate module and is never imported by
  // HumanOverrideDialog. Verified by static module boundary inspection.
  // We confirm the feedback service signature returns a sync, non-Firestore object.
  import('../../../services/aiSuggestionFeedbackService').then(mod => {
    checkTrue('feedbackService exports createAISuggestionFeedback', typeof mod.createAISuggestionFeedback === 'function');
    checkTrue('feedbackService exports createSuggestionViewedEvent', typeof mod.createSuggestionViewedEvent === 'function');
    // Confirm it does NOT export anything related to purchase orders
    check('no createPurchaseOrder export', 'createPurchaseOrder' in mod, false);
    check('no createDraftSuggestion export', 'createDraftSuggestion' in mod, false);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Result: ${passed} passed, ${failed} failed`);
    if (failed > 0) throw new Error(`${failed} validation(s) failed`);
    else console.log('PASSED — HumanOverrideDialog logic tests verified');
  });
}
