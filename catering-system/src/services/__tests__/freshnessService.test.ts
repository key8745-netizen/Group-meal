/**
 * freshnessService.test.ts — Feature 071 食材保鮮引擎。
 * Run with: npx tsx src/services/__tests__/freshnessService.test.ts
 */

import {
  isoAddDays,
  daysBetween,
  defaultIsServiceDay,
  nextServiceDay,
  effectiveExpiryIso,
  estimatedUsableDays,
  batchState,
  weekendDecayAlerts,
} from '../freshnessService';
import type { InventoryBatch, IngredientFreshnessParams } from '../types';

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
    id: '20260716-01', ingredientId: 'basil', storageType: 'chilled',
    receivedDate: '2026-07-16', expirationDate: '2026-07-20',
    qtyReceivedKg: 3, qtyRemainingKg: 2.4, ...over,
  };
}
const P = (p: Partial<IngredientFreshnessParams> = {}): IngredientFreshnessParams => p;

console.log('\n── freshnessService: date utils ───────────────────────────────────────');
check('isoAddDays +3', isoAddDays('2026-07-16', 3), '2026-07-19');
check('isoAddDays -1 crosses month', isoAddDays('2026-07-01', -1), '2026-06-30');
check('daysBetween', daysBetween('2026-07-16', '2026-07-20'), 4);
check('daysBetween negative', daysBetween('2026-07-20', '2026-07-16'), -4);

console.log('\n── freshnessService: nextServiceDay (週末) ────────────────────────────');
// 2026-07-17 是週五 → 下一個開膳日應為 07-20（週一）
check('Fri → next Mon', nextServiceDay('2026-07-17'), '2026-07-20');
check('Fri is a service day', defaultIsServiceDay('2026-07-17'), true);
check('Sat is not', defaultIsServiceDay('2026-07-18'), false);
// 週一放假的情境：07-20 也不開膳 → 推到 07-21
{
  const noMon = (iso: string) => defaultIsServiceDay(iso) && iso !== '2026-07-20';
  check('Fri → skip holiday Mon → Tue', nextServiceDay('2026-07-17', noMon), '2026-07-21');
}

console.log('\n── freshnessService: effectiveExpiry / usableDays ─────────────────────');
check('effectiveExpiry default', effectiveExpiryIso(batch(), P()), '2026-07-20');
check('manual override wins', effectiveExpiryIso(batch({ manualExpiryOverride: '2026-07-18' }), P()), '2026-07-18');
// 開封上限較早 → 取開封上限
check('opened limit earlier',
  effectiveExpiryIso(batch({ openedAt: '2026-07-16T10:00:00Z' }), P({ openedShelfLifeHours: 24 })),
  '2026-07-17');
check('usableDays from today', estimatedUsableDays(batch(), P(), '2026-07-16'), 4);

console.log('\n── freshnessService: batchState 狀態機 ────────────────────────────────');
check('depleted', batchState(batch({ qtyRemainingKg: 0 }), P(), '2026-07-16'), 'DEPLETED');
check('non-perishable always fresh', batchState(batch(), P({ isPerishable: false }), '2026-07-20'), 'FRESH');
check('expired', batchState(batch({ expirationDate: '2026-07-15' }), P(), '2026-07-16'), 'EXPIRED');
// 一般日：剩 4 天、warn 2 → FRESH
check('fresh (Thu, 4d left)', batchState(batch(), P(), '2026-07-16'), 'FRESH');
// 剩 2 天 = warn → USE_FIRST（用一般開膳日避免週末干擾：07-14 週二，效期 07-16 週四）
check('use_first (2d left)',
  batchState(batch({ receivedDate: '2026-07-14', expirationDate: '2026-07-16' }), P(), '2026-07-14'),
  'USE_FIRST');
// 剩 1 天 = critical
check('critical (1d left)',
  batchState(batch({ expirationDate: '2026-07-15' }), P(), '2026-07-14'),
  'CRITICAL');

console.log('\n── freshnessService: ★跨週末 → CRITICAL ───────────────────────────────');
// 週五 07-17 掃描，九層塔效期 07-19（週日）。日曆天看 2 天，但下個開膳日是 07-20（週一）
// → 07-19 < 07-20 → 撐不過空檔 → CRITICAL
check('Fri scan, expiry Sun < next Mon → CRITICAL',
  batchState(batch({ expirationDate: '2026-07-19' }), P(), '2026-07-17'),
  'CRITICAL');
// 對照：效期 07-20（週一，正好開膳日）→ 撐得過 → 依門檻（剩3天）FRESH
check('expiry on Mon → survives gap → FRESH',
  batchState(batch({ expirationDate: '2026-07-20' }), P(), '2026-07-17'),
  'FRESH');

console.log('\n── freshnessService: weekendDecayAlerts ───────────────────────────────');
{
  const names = new Map([['basil', '九層塔'], ['carrot', '紅蘿蔔']]);
  const params = new Map<string, IngredientFreshnessParams>([['carrot', { isPerishable: true }]]);
  const alerts = weekendDecayAlerts(
    [
      batch({ id: 'A', ingredientId: 'basil', expirationDate: '2026-07-19', qtyRemainingKg: 2.4 }),
      batch({ id: 'B', ingredientId: 'carrot', expirationDate: '2026-07-25', qtyRemainingKg: 5 }),
      batch({ id: 'C', ingredientId: 'basil', expirationDate: '2026-07-18', qtyRemainingKg: 1 }),
    ],
    params, names, '2026-07-17',
  );
  check('flags only at-risk (basil ×2, carrot safe)', alerts.map((a) => a.batchId), ['C', 'A']);
  check('sorted earliest expiry first', alerts[0].expiryIso, '2026-07-18');
  check('carries at-risk kg', alerts[1].atRiskKg, 2.4);
  check('gapDays Fri→Mon = 3', alerts[0].gapDays, 3);
}
// 乾貨（isPerishable=false）不列入
{
  const alerts = weekendDecayAlerts(
    [batch({ id: 'D', ingredientId: 'rice', expirationDate: '2026-07-19' })],
    new Map([['rice', { isPerishable: false }]]), new Map([['rice', '白米']]), '2026-07-17',
  );
  check('non-perishable excluded', alerts.length, 0);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — freshnessService verified');
