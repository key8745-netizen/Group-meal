/**
 * marketPriceHistoryService.test.ts — Feature 063 食材市價歷史。
 * Run with: npx tsx src/services/__tests__/marketPriceHistoryService.test.ts
 */

import { buildPriceHistory } from '../marketPriceHistoryService';
import type { MarketPriceSnapshot, MarketPriceEntry } from '../types';

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

function entry(cropName: string, avgPrice: number | null): MarketPriceEntry {
  return { cropName, avgPrice, minPrice: null, maxPrice: null, totalQuantity: 0, marketCount: 0, sampleCropNames: [] };
}
function snap(date: string, entries: MarketPriceEntry[]): MarketPriceSnapshot {
  return { id: date, date, rocDate: date, entries, warnings: [], fetchedBy: 't' };
}

console.log('\n── marketPriceHistoryService: buildPriceHistory ───────────────────────');

// ── extracts crop series sorted by date, ignores other crops ───────────────
{
  const h = buildPriceHistory([
    snap('2026-07-03', [entry('甘藍', 30), entry('豬肉', 200)]),
    snap('2026-07-01', [entry('甘藍', 20)]),
    snap('2026-07-02', [entry('甘藍', 25)]),
  ], '甘藍');
  check('sorted by date', h.points.map((p) => p.date), ['2026-07-01', '2026-07-02', '2026-07-03']);
  check('prices', h.points.map((p) => p.avgPrice), [20, 25, 30]);
  check('earliest 20', h.earliest, 20);
  check('latest 30', h.latest, 30);
  check('min/max', [h.min, h.max], [20, 30]);
  check('changePercent +50', h.changePercent, 50);
}

// ── null / non-positive avgPrice skipped ───────────────────────────────────
{
  const h = buildPriceHistory([
    snap('2026-07-01', [entry('甘藍', null)]),
    snap('2026-07-02', [entry('甘藍', 0)]),
    snap('2026-07-03', [entry('甘藍', 18)]),
  ], '甘藍');
  check('skips null/0: one point', h.points.length, 1);
  check('single point: changePercent null', h.changePercent, null);
}

// ── empty / missing crop → EMPTY ───────────────────────────────────────────
{
  check('blank cropName', buildPriceHistory([snap('2026-07-01', [entry('甘藍', 20)])], '  ').points, []);
  check('no matching crop', buildPriceHistory([snap('2026-07-01', [entry('甘藍', 20)])], '菠菜').latest, null);
  check('undefined cropName', buildPriceHistory([], undefined).points, []);
}

// ── downward trend ─────────────────────────────────────────────────────────
{
  const h = buildPriceHistory([
    snap('2026-07-01', [entry('冬瓜', 40)]),
    snap('2026-07-02', [entry('冬瓜', 30)]),
  ], '冬瓜');
  check('changePercent -25', h.changePercent, -25);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — marketPriceHistoryService verified');
