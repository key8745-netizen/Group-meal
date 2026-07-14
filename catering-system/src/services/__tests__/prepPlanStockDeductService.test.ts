/**
 * prepPlanStockDeductService.test.ts
 *
 * Validation tests for planPrepPlanDeduction (Feature 048: 出餐一鍵扣料).
 * Run with: npx tsx src/services/__tests__/prepPlanStockDeductService.test.ts
 */

import { planPrepPlanDeduction, applyDeductionOverrides } from '../prepPlanStockDeductService';
import type { PrepPlanItem } from '../types';

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
  ingredientId: string,
  requiredBaseQuantity: number,
  baseUnit: PrepPlanItem['baseUnit'] = 'g',
): PrepPlanItem {
  return {
    ingredientId,
    ingredientNameSnapshot: ingredientId,
    requiredBaseQuantity,
    baseUnit,
    recipeContributions: [],
  };
}

console.log('\n── prepPlanStockDeductService: planPrepPlanDeduction ──────────────────');

// ── g → kg ─────────────────────────────────────────────────────────────────
{
  const { requirements, skipped } = planPrepPlanDeduction({ prepItems: [item('高麗菜', 11000)] });
  check('g→kg: one requirement', requirements.size, 1);
  check('g→kg: kg value', requirements.get('高麗菜')?.totalQuantityKg, 11);
  check('g→kg: no skips', skipped, []);
}

// ── ml treated as g; duplicate ids merged ─────────────────────────────────
{
  const { requirements } = planPrepPlanDeduction({
    prepItems: [item('鮮奶', 2400, 'ml'), item('鮮奶', 600, 'ml')],
  });
  check('merge: single entry', requirements.size, 1);
  check('merge: summed kg', requirements.get('鮮奶')?.totalQuantityKg, 3);
}

// ── pcs skipped with reason ────────────────────────────────────────────────
{
  const { requirements, skipped } = planPrepPlanDeduction({ prepItems: [item('雞蛋', 200, 'pcs')] });
  check('pcs: no requirements', requirements.size, 0);
  check('pcs: skip reason', skipped[0]?.reason, '以個數計量，庫存以公斤計，請用庫存盤點手動調整');
}

// ── zero quantity skipped ──────────────────────────────────────────────────
{
  const { requirements, skipped } = planPrepPlanDeduction({ prepItems: [item('薑', 0)] });
  check('zero: no requirements', requirements.size, 0);
  check('zero: skip reason', skipped[0]?.reason, '數量為 0');
}

// ── rounding to 3dp kg ─────────────────────────────────────────────────────
{
  const { requirements } = planPrepPlanDeduction({ prepItems: [item('蒜頭', 415)] });
  check('rounding: 415g → 0.415kg', requirements.get('蒜頭')?.totalQuantityKg, 0.415);
}

// ── empty / missing prepItems ──────────────────────────────────────────────
{
  const { requirements, skipped } = planPrepPlanDeduction({ prepItems: [] });
  check('empty: nothing', { r: requirements.size, s: skipped.length }, { r: 0, s: 0 });
}

console.log('\n── prepPlanStockDeductService: applyDeductionOverrides ────────────────');

// ── override changes quantity; 0 removes; untouched pass through ─────────
{
  const { requirements } = planPrepPlanDeduction({
    prepItems: [item('高麗菜', 11000), item('豬絞肉', 7000), item('薑', 500)],
  });
  const out = applyDeductionOverrides(
    requirements,
    new Map([
      ['高麗菜', 9.5], // 手動改成實際用量
      ['豬絞肉', 0],   // 手動設 0 = 不扣
    ]),
  );
  check('override: edited quantity applied', out.get('高麗菜')?.totalQuantityKg, 9.5);
  check('override: zero removes the line', out.has('豬絞肉'), false);
  check('override: untouched line passes through', out.get('薑')?.totalQuantityKg, 0.5);
  check('override: input map not mutated', requirements.get('豬絞肉')?.totalQuantityKg, 7);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — prepPlanStockDeductService verified');
