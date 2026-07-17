/**
 * preservationStatsService.test.ts — Feature 084 加工延壽成效統計。
 * Run with: npx tsx src/services/__tests__/preservationStatsService.test.ts
 */

import { summarizePreservation } from '../preservationStatsService';
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

const batch = (over: Partial<InventoryBatch>): InventoryBatch => ({
  id: '20260716-01',
  ingredientId: 'pork-belly',
  storageType: 'chilled',
  receivedDate: '2026-07-16',
  expirationDate: '2026-07-19',
  qtyReceivedKg: 3,
  qtyRemainingKg: 3,
  ...over,
});

console.log('\n── preservationStatsService: summarizePreservation ────────────────────');

const today = '2026-07-16';

// 混合：2 筆加工批次 + 1 筆一般批次（無 processedLabel）
{
  const batches = [
    batch({ id: 'a', processedLabel: '煮熟冷藏', qtyReceivedKg: 3, qtyRemainingKg: 2, receivedDate: '2026-07-16' }),
    batch({ id: 'b', processedLabel: '煮熟冷凍', qtyReceivedKg: 5, qtyRemainingKg: 0, receivedDate: '2026-07-10' }),
    batch({ id: 'c', qtyReceivedKg: 10, qtyRemainingKg: 10 }), // 一般批次，不計
  ];
  const s = summarizePreservation(batches, today);
  check('累計延壽批次 = 2', s.processedBatchCount, 2);
  check('累計產出 = 8kg', s.processedKg, 8);
  check('仍有剩餘批次 = 1', s.activeBatchCount, 1);
  check('剩餘庫存 = 2kg', s.activeRemainingKg, 2);
  check('近30天批次 = 2', s.recentBatchCount, 2);
  check('近30天產出 = 8kg', s.recentKg, 8);
}

// 近 N 天視窗：超過視窗的不計入 recent
{
  const batches = [
    batch({ id: 'old', processedLabel: '煮熟冷凍', qtyReceivedKg: 4, receivedDate: '2026-05-01' }), // 76 天前
    batch({ id: 'new', processedLabel: '煮熟冷藏', qtyReceivedKg: 2, receivedDate: '2026-07-01' }), // 15 天前
  ];
  const s = summarizePreservation(batches, today, 30);
  check('累計 = 2 批', s.processedBatchCount, 2);
  check('近30天只算 new', s.recentBatchCount, 1);
  check('近30天產出 = 2kg', s.recentKg, 2);
}

// 無加工批次 → 全 0
{
  const s = summarizePreservation([batch({ id: 'x', qtyRemainingKg: 5 })], today);
  check('無加工 → 批次 0', s.processedBatchCount, 0);
  check('無加工 → 產出 0', s.processedKg, 0);
  check('windowDays 帶出', s.windowDays, 30);
}

// 空輸入
{
  const s = summarizePreservation([], today);
  check('空輸入 → 0 批', s.processedBatchCount, 0);
  check('空輸入 → 剩餘 0', s.activeRemainingKg, 0);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — preservationStatsService verified');
