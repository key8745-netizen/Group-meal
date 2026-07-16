/**
 * inventoryBatchPlanner.test.ts — Feature 071 Phase 2 批次資料層純運算。
 * Run with: npx tsx src/services/__tests__/inventoryBatchPlanner.test.ts
 */

import {
  resolveShelfLifeDays,
  deriveExpirationDate,
  computeCurrentStockFromBatches,
  nextBatchId,
  planFefoDeduction,
} from '../inventoryBatchPlanner';
import type { InventoryBatch } from '../types';

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

function batch(over: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: '20260716-01', ingredientId: 'x', storageType: 'chilled',
    receivedDate: '2026-07-16', expirationDate: '2026-07-20',
    qtyReceivedKg: 3, qtyRemainingKg: 3, ...over,
  };
}

console.log('\n── resolveShelfLifeDays ───────────────────────────────────────────────');
check('exact storage type', resolveShelfLifeDays({ shelfLifeDaysChilled: 3 }, 'chilled'), 3);
check('fallback to default storage',
  resolveShelfLifeDays({ defaultStorageType: 'chilled', shelfLifeDaysChilled: 4 }, 'frozen'), 4);
check('fallback to any', resolveShelfLifeDays({ shelfLifeDaysFrozen: 60 }, 'chilled'), 60);
check('none set → null', resolveShelfLifeDays({}, 'chilled'), null);

console.log('\n── deriveExpirationDate ───────────────────────────────────────────────');
check('received + chilled days',
  deriveExpirationDate('2026-07-16', { shelfLifeDaysChilled: 4 }, 'chilled'), '2026-07-20');
check('frozen long life',
  deriveExpirationDate('2026-07-16', { shelfLifeDaysFrozen: 60 }, 'frozen'), '2026-09-14');
check('no shelf life → null (需人工填)',
  deriveExpirationDate('2026-07-16', {}, 'chilled'), null);

console.log('\n── computeCurrentStockFromBatches ─────────────────────────────────────');
check('sums remaining',
  computeCurrentStockFromBatches([batch({ qtyRemainingKg: 2.4 }), batch({ qtyRemainingKg: 1.1 })]), 3.5);
check('ignores depleted',
  computeCurrentStockFromBatches([batch({ qtyRemainingKg: 0 }), batch({ qtyRemainingKg: 2 })]), 2);
check('empty → 0', computeCurrentStockFromBatches([]), 0);

console.log('\n── nextBatchId ────────────────────────────────────────────────────────');
check('first of the day', nextBatchId('2026-07-16', []), '20260716-01');
check('increments same day',
  nextBatchId('2026-07-16', ['20260716-01', '20260716-02']), '20260716-03');
check('ignores other days',
  nextBatchId('2026-07-16', ['20260715-09']), '20260716-01');

console.log('\n── planFefoDeduction (先到期先扣) ─────────────────────────────────────');
{
  // 三批：效期 07-18 / 07-20 / 07-19，各剩 1kg；需 1.5kg
  const plan = planFefoDeduction([
    batch({ id: 'B', expirationDate: '2026-07-20', qtyRemainingKg: 1 }),
    batch({ id: 'A', expirationDate: '2026-07-18', qtyRemainingKg: 1 }),
    batch({ id: 'C', expirationDate: '2026-07-19', qtyRemainingKg: 1 }),
  ], 1.5);
  check('FEFO: A(最早)先扣滿, C 補 0.5', plan.deductions, [
    { batchId: 'A', deductKg: 1 },
    { batchId: 'C', deductKg: 0.5 },
  ]);
  check('no shortfall', plan.shortfallKg, 0);
}
{
  // 不足：只有 2kg，需 3kg
  const plan = planFefoDeduction([batch({ id: 'A', qtyRemainingKg: 2 })], 3);
  check('shortfall reported', plan.shortfallKg, 1);
  check('deducts what it can', plan.deductions, [{ batchId: 'A', deductKg: 2 }]);
}
{
  // 效期相同 → 入庫日早先扣
  const plan = planFefoDeduction([
    batch({ id: 'NEW', expirationDate: '2026-07-20', receivedDate: '2026-07-17', qtyRemainingKg: 5 }),
    batch({ id: 'OLD', expirationDate: '2026-07-20', receivedDate: '2026-07-15', qtyRemainingKg: 5 }),
  ], 1);
  check('tie-break by receivedDate', plan.deductions, [{ batchId: 'OLD', deductKg: 1 }]);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — inventoryBatchPlanner verified');
