/**
 * preservationPlanner.test.ts — Feature 079 加工延壽計畫。
 * Run with: npx tsx src/services/__tests__/preservationPlanner.test.ts
 */

import { planPreservation, resolvePreservationDefaults, type PreservationInput } from '../preservationPlanner';

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

const baseInput = (over: Partial<PreservationInput> = {}): PreservationInput => ({
  sourceBatch: { id: '20260716-01', ingredientId: 'pork-belly', qtyRemainingKg: 5 },
  ingredientName: '豬五花',
  consumeKg: 4,
  yieldRatio: 0.75,
  targetStorageType: 'chilled',
  targetShelfLifeDays: 3,
  processedLabel: '煮熟冷藏',
  todayIso: '2026-07-16',
  ...over,
});

console.log('\n── preservationPlanner: planPreservation ──────────────────────────────');

// 正常：4kg × 0.75 = 3kg 產出；失重 1kg；來源剩 1kg；淨庫存 −1kg
{
  const p = planPreservation(baseInput());
  if (p.ok) {
    check('outputKg = 3', p.outputKg, 3);
    check('lossKg = 1', p.lossKg, 1);
    check('sourceRemainingAfterKg = 1', p.sourceRemainingAfterKg, 1);
    check('netStockChangeKg = -1', p.netStockChangeKg, -1);
    check('新批次效期 = 加工日+3', p.newBatch.expirationDate, '2026-07-19');
    check('新批次 storageType', p.newBatch.storageType, 'chilled');
    check('新批次 sourceBatchId', p.newBatch.sourceBatchId, '20260716-01');
    check('新批次 qtyKg', p.newBatch.qtyKg, 3);
    check('新批次 processedLabel', p.newBatch.processedLabel, '煮熟冷藏');
    check('sourceNote 含來源批號', p.newBatch.sourceNote.includes('#20260716-01'), true);
  } else check('應成功但失敗', p.errors, '(ok)');
}

// 全部用完：consume = remaining
{
  const p = planPreservation(baseInput({ consumeKg: 5 }));
  check('全用完 ok', p.ok, true);
  if (p.ok) check('來源剩 0', p.sourceRemainingAfterKg, 0);
}

// 耗用超過剩餘 → 錯誤
{
  const p = planPreservation(baseInput({ consumeKg: 6 }));
  check('超量 → 失敗', p.ok, false);
  if (!p.ok) check('超量錯誤訊息', p.errors[0].includes('超過來源批次剩餘'), true);
}

// 耗用 0 / 負 → 錯誤
{
  check('耗用 0 → 失敗', planPreservation(baseInput({ consumeKg: 0 })).ok, false);
  check('耗用負 → 失敗', planPreservation(baseInput({ consumeKg: -1 })).ok, false);
}

// 良率 0 → 錯誤；保存天數 0 → 錯誤；空標籤 → 錯誤
{
  check('良率 0 → 失敗', planPreservation(baseInput({ yieldRatio: 0 })).ok, false);
  check('保存天數 0 → 失敗', planPreservation(baseInput({ targetShelfLifeDays: 0 })).ok, false);
  check('空標籤 → 失敗', planPreservation(baseInput({ processedLabel: '  ' })).ok, false);
}

// 良率 > 1（增重，如醃漬）→ 允許、失重為負
{
  const p = planPreservation(baseInput({ consumeKg: 2, yieldRatio: 1.1 }));
  check('增重 ok', p.ok, true);
  if (p.ok) {
    check('增重 outputKg = 2.2', p.outputKg, 2.2);
    check('增重 lossKg = -0.2', p.lossKg, -0.2);
  }
}

console.log('\n── preservationPlanner: resolvePreservationDefaults ───────────────────');

// 良率取食材預設；保存天數取目標儲存對應
{
  const d = resolvePreservationDefaults({ processedYieldRatio: 0.8, shelfLifeDaysChilled: 4, shelfLifeDaysFrozen: 30 }, 'chilled');
  check('良率取預設 0.8', d.yieldRatio, 0.8);
  check('冷藏保存 4 天', d.shelfLifeDays, 4);
  const f = resolvePreservationDefaults({ shelfLifeDaysFrozen: 30 }, 'frozen');
  check('冷凍保存 30 天', f.shelfLifeDays, 30);
  check('無良率 → 預設 1', f.yieldRatio, 1);
  const none = resolvePreservationDefaults({}, 'chilled');
  check('無保存天數 → 保守 3 天', none.shelfLifeDays, 3);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — preservationPlanner verified');
