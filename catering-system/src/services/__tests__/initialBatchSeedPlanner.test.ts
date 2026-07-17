/**
 * initialBatchSeedPlanner.test.ts — Feature 087 從 currentStock 建初始批次。
 * Run with: npx tsx src/services/__tests__/initialBatchSeedPlanner.test.ts
 */

import { planInitialBatchSeed, type InitialBatchSeedIngredient } from '../initialBatchSeedPlanner';

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

const ing = (over: Partial<InitialBatchSeedIngredient>): InitialBatchSeedIngredient => ({
  id: 'x', name: '食材', currentStockKg: 5, hasBatches: false,
  params: { isPerishable: true, defaultStorageType: 'chilled', shelfLifeDaysChilled: 3 },
  ...over,
});

const today = '2026-07-17';

console.log('\n── initialBatchSeedPlanner: planInitialBatchSeed ──────────────────────');

// 正常：有庫存、無批次、有保存天數 → willSeed
{
  const r = planInitialBatchSeed(ing({}), today);
  check('willSeed', r.action, 'willSeed');
  check('批次量 = 庫存', r.batch?.qtyKg, 5);
  check('儲存 = 預設冷藏', r.batch?.storageType, 'chilled');
  check('效期 = 今日+3', r.batch?.expirationDate, '2026-07-20');
  check('sourceNote 標明估計', r.batch?.sourceNote.includes('估計'), true);
}

// 已有批次 → alreadyHasBatches（merge-only）
{
  const r = planInitialBatchSeed(ing({ hasBatches: true }), today);
  check('已有批次跳過', r.action, 'alreadyHasBatches');
  check('已有批次無 batch', r.batch, undefined);
}

// 乾貨 → skippedNonPerishable
{
  const r = planInitialBatchSeed(ing({ params: { isPerishable: false } }), today);
  check('乾貨跳過', r.action, 'skippedNonPerishable');
}

// 無庫存 → noStock
{
  check('庫存 0 跳過', planInitialBatchSeed(ing({ currentStockKg: 0 }), today).action, 'noStock');
  check('庫存負跳過', planInitialBatchSeed(ing({ currentStockKg: -1 }), today).action, 'noStock');
}

// 無保存天數（無法推效期）→ noShelfLife，不臆測
{
  const r = planInitialBatchSeed(ing({ params: { isPerishable: true, defaultStorageType: 'chilled' } }), today);
  check('無保存天數跳過', r.action, 'noShelfLife');
  check('無保存天數無 batch', r.batch, undefined);
}

// 冷凍預設 + 冷凍保存天數
{
  const r = planInitialBatchSeed(ing({
    currentStockKg: 2,
    params: { isPerishable: true, defaultStorageType: 'frozen', shelfLifeDaysFrozen: 30 },
  }), today);
  check('冷凍 willSeed', r.action, 'willSeed');
  check('冷凍儲存', r.batch?.storageType, 'frozen');
  check('冷凍效期 = 今日+30', r.batch?.expirationDate, '2026-08-16');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — initialBatchSeedPlanner verified');
