/**
 * wasteFactor.test.ts — 耗損率換算（淨重 → 毛重）與備料快照套用。
 * Run with: npx tsx src/services/__tests__/wasteFactor.test.ts
 */

import { grossBaseQuantity, normalizeWasteFactor, MAX_WASTE_FACTOR } from '../wasteFactor';
import { applyWasteFactors } from '../prepPlanService';
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

console.log('\n── wasteFactor: normalizeWasteFactor / grossBaseQuantity ──────────────');

check('undefined → 0', normalizeWasteFactor(undefined), 0);
check('negative → 0', normalizeWasteFactor(-0.2), 0);
check('NaN → 0', normalizeWasteFactor(NaN), 0);
check('string → 0', normalizeWasteFactor('0.2'), 0);
check('over max → clamp', normalizeWasteFactor(1.5), MAX_WASTE_FACTOR);
check('0.25 kept', normalizeWasteFactor(0.25), 0.25);

// 淨重 75g、耗損 25% → 買 100g（不是 ×1.25 的 93.75g）
check('75g net @25% → 100g gross', grossBaseQuantity(75, 0.25), 100);
check('no waste → unchanged', grossBaseQuantity(120, 0), 120);
check('missing waste → unchanged', grossBaseQuantity(120, undefined), 120);
check('rounds to 2 decimals', grossBaseQuantity(100, 0.3), 142.86);
check('clamped 1.0 → ÷0.1', grossBaseQuantity(10, 1), 100);

console.log('\n── prepPlanService: applyWasteFactors ─────────────────────────────────');

const item = (ingredientId: string, requiredBaseQuantity: number): PrepPlanItem => ({
  ingredientId,
  ingredientNameSnapshot: ingredientId,
  requiredBaseQuantity,
  baseUnit: 'g',
  recipeContributions: [],
});

{
  const out = applyWasteFactors(
    [item('cabbage', 9000), item('rice', 12000), item('ghost', 500)],
    new Map<string, unknown>([['cabbage', 0.25], ['rice', 0]]),
  );
  // 120 人 × 75g 高麗菜 = 9kg 淨重 → 備／買 12kg
  check('cabbage grossed up', out[0].requiredBaseQuantity, 12000);
  check('cabbage keeps net', out[0].netBaseQuantity, 9000);
  check('cabbage records factor', out[0].wasteFactorApplied, 0.25);
  check('rice (0) unchanged, no extra fields', out[1], item('rice', 12000));
  check('missing ingredient unchanged', out[2], item('ghost', 500));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — wasteFactor verified');
