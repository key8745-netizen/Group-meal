/**
 * stockAlertService.test.ts
 *
 * Validation tests for computeLowStock / planSafetyRestock
 * (Feature 057: 安全庫存警示).
 * Run with: npx tsx src/services/__tests__/stockAlertService.test.ts
 */

import { computeLowStock, planSafetyRestock } from '../stockAlertService';
import type { IngredientMaster } from '../types';

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

function ing(id: string, minStockLevel?: number, isActive = true): IngredientMaster {
  return {
    id,
    name: id,
    normalizedName: id,
    category: '測試',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 10,
    defaultPriceUnit: 'kg',
    isActive,
    ...(minStockLevel !== undefined ? { minStockLevel } : {}),
  };
}

console.log('\n── stockAlertService: computeLowStock ─────────────────────────────────');

// ── below safety → flagged with deficit ────────────────────────────────────
{
  const items = computeLowStock([ing('高麗菜', 5)], new Map([['高麗菜', 2]]));
  check('below: one item', items.length, 1);
  check('below: deficit 3kg', items[0].deficitKg, 3);
  check('below: current/safety', [items[0].currentKg, items[0].safetyKg], [2, 5]);
}

// ── at/above safety, no tracking, inactive → not flagged ──────────────────
{
  const items = computeLowStock(
    [ing('夠', 5), ing('不追蹤', 0), ing('沒設定'), ing('停用', 5, false)],
    new Map([['夠', 5], ['停用', 0]]),
  );
  check('not flagged: none', items, []);
}

// ── missing inventory doc → treated as 0 stock ─────────────────────────────
{
  const items = computeLowStock([ing('新食材', 3)], new Map());
  check('missing stock: deficit = full safety', items[0]?.deficitKg, 3);
  check('missing stock: current 0', items[0]?.currentKg, 0);
}

// ── sorted most-deficient first (by current/safety ratio) ──────────────────
{
  const items = computeLowStock(
    [ing('a', 10), ing('b', 10)],
    new Map([['a', 8], ['b', 1]]),
  );
  check('sort: b (10%) before a (80%)', items.map((i) => i.ingredientId), ['b', 'a']);
}

console.log('\n── stockAlertService: planSafetyRestock ───────────────────────────────');

{
  const lines = planSafetyRestock(computeLowStock([ing('冬瓜', 6)], new Map([['冬瓜', 0]])));
  check('restock: kg = deficit', lines[0].purchaseQtyKg, 6);
  check('restock: 台斤 (6/0.6=10)', lines[0].purchaseTaijin, 10);
  check('restock: name carried', lines[0].name, '冬瓜');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — stockAlertService verified');
