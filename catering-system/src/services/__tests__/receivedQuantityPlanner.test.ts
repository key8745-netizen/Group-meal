/**
 * receivedQuantityPlanner.test.ts — Feature 061 收貨實收數量微調。
 * Run with: npx tsx src/services/__tests__/receivedQuantityPlanner.test.ts
 */

import { resolveReceivedQuantities } from '../receivedQuantityPlanner';
import type { PurchaseOrderItem } from '../purchaseOrderService';

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

function item(ingredientId: string, purchaseQtyKg: number): PurchaseOrderItem {
  return { ingredientId, name: ingredientId, purchaseQtyKg, purchaseTaijin: purchaseQtyKg / 0.6 };
}

console.log('\n── receivedQuantityPlanner: resolveReceivedQuantities ─────────────────');

// ── no overrides → received = ordered ──────────────────────────────────────
{
  const lines = resolveReceivedQuantities([item('高麗菜', 5), item('豬肉', 3)]);
  check('no override: received = ordered', lines.map((l) => l.receivedKg), [5, 3]);
  check('no override: orderedKg carried', lines.map((l) => l.orderedKg), [5, 3]);
}

// ── override changes received but keeps ordered ────────────────────────────
{
  const lines = resolveReceivedQuantities([item('高麗菜', 5)], new Map([['高麗菜', 4.2]]));
  check('override: received = 4.2', lines[0].receivedKg, 4.2);
  check('override: ordered still 5', lines[0].orderedKg, 5);
}

// ── override 0 → not received (receivedKg 0, kept in list) ──────────────────
{
  const lines = resolveReceivedQuantities([item('高麗菜', 5)], new Map([['高麗菜', 0]]));
  check('override 0: receivedKg 0', lines[0].receivedKg, 0);
  check('override 0: line retained', lines.length, 1);
}

// ── negative / non-finite override → treated as 0 ──────────────────────────
{
  const lines = resolveReceivedQuantities(
    [item('a', 2), item('b', 2)],
    new Map([['a', -1], ['b', NaN]]),
  );
  check('negative → 0', lines[0].receivedKg, 0);
  check('NaN → 0', lines[1].receivedKg, 0);
}

// ── rounding to 3dp ────────────────────────────────────────────────────────
{
  const lines = resolveReceivedQuantities([item('x', 1)], new Map([['x', 1.23456]]));
  check('round3', lines[0].receivedKg, 1.235);
}

// ── override for a missing key is ignored (uses ordered) ───────────────────
{
  const lines = resolveReceivedQuantities([item('高麗菜', 5)], new Map([['別的食材', 9]]));
  check('unrelated override ignored', lines[0].receivedKg, 5);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — receivedQuantityPlanner verified');
