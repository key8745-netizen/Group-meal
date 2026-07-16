/**
 * shoppingListService.test.ts — Feature 062 待採購彙總清單。
 * Run with: npx tsx src/services/__tests__/shoppingListService.test.ts
 */

import { buildConsolidatedShoppingList } from '../shoppingListService';
import type { PurchaseOrder, PurchaseOrderItem } from '../purchaseOrderService';

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

function item(id: string, kg: number): PurchaseOrderItem {
  return { ingredientId: id, name: id, purchaseQtyKg: kg, purchaseTaijin: Math.round((kg / 0.6) * 100) / 100 };
}
function order(id: string, items: PurchaseOrderItem[]): PurchaseOrder {
  return { id, status: 'PENDING', items, createdAt: undefined as never };
}

console.log('\n── shoppingListService: buildConsolidatedShoppingList ─────────────────');

// ── merges same ingredient across orders ───────────────────────────────────
{
  const s = buildConsolidatedShoppingList([
    order('o1', [item('高麗菜', 3), item('豬肉', 2)]),
    order('o2', [item('高麗菜', 2)]),
  ]);
  const cabbage = s.lines.find((l) => l.ingredientId === '高麗菜')!;
  check('merge: 高麗菜 total 5kg', cabbage.totalKg, 5);
  check('merge: 高麗菜 from 2 orders', cabbage.orderCount, 2);
  check('merge: 豬肉 from 1 order', s.lines.find((l) => l.ingredientId === '豬肉')!.orderCount, 1);
  check('merge: itemCount 2', s.itemCount, 2);
  check('merge: sourceOrderCount 2', s.sourceOrderCount, 2);
}

// ── taijin summed & rounded ────────────────────────────────────────────────
{
  const s = buildConsolidatedShoppingList([
    order('o1', [item('冬瓜', 1)]),
    order('o2', [item('冬瓜', 1)]),
  ]);
  // 1kg → 1.67 台斤；兩單加總 3.34
  check('taijin summed', s.lines[0].totalTaijin, 3.34);
}

// ── zero / negative qty items excluded ─────────────────────────────────────
{
  const s = buildConsolidatedShoppingList([order('o1', [item('空', 0), item('負', -2), item('實', 4)])]);
  check('excludes non-positive', s.lines.map((l) => l.ingredientId), ['實']);
}

// ── sorted by name ─────────────────────────────────────────────────────────
{
  const s = buildConsolidatedShoppingList([order('o1', [item('B菜', 1), item('A菜', 1)])]);
  check('sorted by name', s.lines.map((l) => l.name), ['A菜', 'B菜']);
}

// ── empty input ────────────────────────────────────────────────────────────
{
  const s = buildConsolidatedShoppingList([]);
  check('empty: no lines', s.lines, []);
  check('empty: itemCount 0', s.itemCount, 0);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — shoppingListService verified');
