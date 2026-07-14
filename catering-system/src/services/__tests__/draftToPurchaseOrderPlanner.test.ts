/**
 * draftToPurchaseOrderPlanner.test.ts
 *
 * Validation tests for planDraftConversion (Feature 047: 草稿轉採購單).
 * Run with: npx tsx src/services/__tests__/draftToPurchaseOrderPlanner.test.ts
 */

import { planDraftConversion } from '../draftToPurchaseOrderPlanner';
import type { PurchaseDemandDraftItem } from '../types';

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

function item(
  name: string,
  demandQuantity: number,
  baseUnit: PurchaseDemandDraftItem['baseUnit'] = 'g',
): PurchaseDemandDraftItem {
  return {
    ingredientId: name,
    ingredientNameSnapshot: name,
    demandQuantity,
    baseUnit,
    sourceRequiredBaseQuantity: demandQuantity,
    prepPlanTraceability: { prepPlanId: 'p1', prepPlanNameSnapshot: '測試備料' },
  };
}

console.log('\n── draftToPurchaseOrderPlanner: planDraftConversion ───────────────────');

// ── g → kg conversion with 台斤 ────────────────────────────────────────────
{
  const plan = planDraftConversion({ items: [item('高麗菜', 8000)] });
  check('g→kg: one line', plan.lines.length, 1);
  check('g→kg: kg quantity', plan.lines[0].purchaseQtyKg, 8);
  check('g→kg: 台斤 (8 / 0.6 = 13.33)', plan.lines[0].purchaseTaijin, 13.33);
  check('g→kg: no skips', plan.skipped, []);
}

// ── zero demand (庫存足夠) skipped ─────────────────────────────────────────
{
  const plan = planDraftConversion({ items: [item('雞蛋', 0), item('豬絞肉', 3000)] });
  check('zero demand: only 豬絞肉 converted', plan.lines.map((l) => l.name), ['豬絞肉']);
  check('zero demand: skip reason', plan.skipped, [
    { ingredientName: '雞蛋', reason: '淨需求為 0（庫存足夠）' },
  ]);
}

// ── pcs skipped ────────────────────────────────────────────────────────────
{
  const plan = planDraftConversion({ items: [item('雞蛋', 200, 'pcs')] });
  check('pcs: no lines', plan.lines, []);
  check('pcs: skip reason mentions 手動建單', plan.skipped[0].reason, '以個數計量，採購單以公斤計，請手動建單');
}

// ── ml treated like g ──────────────────────────────────────────────────────
{
  const plan = planDraftConversion({ items: [item('鮮奶', 24000, 'ml')] });
  check('ml: converted to 24 kg', plan.lines[0].purchaseQtyKg, 24);
}

// ── fractional grams round to 3dp kg ──────────────────────────────────────
{
  const plan = planDraftConversion({ items: [item('薑', 415)] });
  check('rounding: 415g → 0.415kg', plan.lines[0].purchaseQtyKg, 0.415);
}

// ── empty items → nothing ──────────────────────────────────────────────────
{
  const plan = planDraftConversion({ items: [] });
  check('empty: no lines, no skips', { l: plan.lines.length, s: plan.skipped.length }, { l: 0, s: 0 });
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — draftToPurchaseOrderPlanner verified');
