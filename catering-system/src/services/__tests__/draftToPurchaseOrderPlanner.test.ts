/**
 * draftToPurchaseOrderPlanner.test.ts
 *
 * Validation tests for planDraftConversion (Feature 047: 草稿轉採購單).
 * Run with: npx tsx src/services/__tests__/draftToPurchaseOrderPlanner.test.ts
 */

import { planDraftConversion, planRangeOrder } from '../draftToPurchaseOrderPlanner';
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

console.log('\n── draftToPurchaseOrderPlanner: planRangeOrder（Feature 052）──────────');

function rangeLine(name: string, totalBaseQuantity: number, baseUnit = 'g') {
  return { ingredientId: name, ingredientName: name, baseUnit, totalBaseQuantity };
}

// ── nets stock then converts to kg lines ───────────────────────────────────
{
  const stock = new Map([['高麗菜', 3]]); // 3 kg
  const plan = planRangeOrder([rangeLine('高麗菜', 11000), rangeLine('豬絞肉', 7000)], stock);
  check('range: 高麗菜 net 11−3=8kg', plan.lines.find((l) => l.name === '高麗菜')?.purchaseQtyKg, 8);
  check('range: 豬絞肉 unchanged 7kg', plan.lines.find((l) => l.name === '豬絞肉')?.purchaseQtyKg, 7);
  check('range: nettedCount', plan.nettedCount, 1);
  check('range: coveredCount', plan.coveredCount, 0);
}

// ── stock fully covers → skipped with reason ───────────────────────────────
{
  const stock = new Map([['雞蛋', 99]]);
  const plan = planRangeOrder([rangeLine('雞蛋', 5000)], stock);
  check('range covered: no lines', plan.lines, []);
  check('range covered: coveredCount', plan.coveredCount, 1);
  check('range covered: skip reason', plan.skipped[0]?.reason, '淨需求為 0（庫存足夠）');
}

// ── pcs and unknown units skipped ──────────────────────────────────────────
{
  const plan = planRangeOrder(
    [rangeLine('雞蛋', 200, 'pcs'), rangeLine('神秘', 100, '箱')],
    new Map(),
  );
  check('range pcs/unknown: no lines', plan.lines, []);
  check('range pcs: reason', plan.skipped.find((s) => s.ingredientName === '雞蛋')?.reason,
    '以個數計量，採購單以公斤計，請手動建單');
  check('range unknown unit: reason', plan.skipped.find((s) => s.ingredientName === '神秘')?.reason,
    '未知單位「箱」，請手動建單');
}

// ── taijin computed on netted kg ───────────────────────────────────────────
{
  const plan = planRangeOrder([rangeLine('冬瓜', 6000)], new Map());
  check('range taijin: 6kg → 10 台斤', plan.lines[0].purchaseTaijin, 10);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — draftToPurchaseOrderPlanner verified');
