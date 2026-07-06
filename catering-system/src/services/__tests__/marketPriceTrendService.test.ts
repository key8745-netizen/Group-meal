/**
 * marketPriceTrendService.test.ts
 *
 * Validation tests for the pure helper `buildCropTrends` in
 * marketPriceTrendService.ts.
 * Run with: npx tsx src/services/__tests__/marketPriceTrendService.test.ts
 */

import { buildCropTrends } from '../marketPriceTrendService';
import type { MarketPriceEntry, MarketPriceSnapshot } from '../types';

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

function checkTrue(label: string, cond: boolean): void {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.error(`  ❌ ${label}`); failed++; }
}

function entry(cropName: string, avgPrice: number | null, overrides: Partial<MarketPriceEntry> = {}): MarketPriceEntry {
  return {
    cropName,
    avgPrice,
    minPrice: avgPrice,
    maxPrice: avgPrice,
    totalQuantity: 100,
    marketCount: 1,
    sampleCropNames: [cropName],
    ...overrides,
  };
}

function snapshot(date: string, entries: MarketPriceEntry[]): MarketPriceSnapshot {
  return {
    id: date,
    date,
    rocDate: date,
    entries,
    warnings: [],
    fetchedBy: 'test',
  };
}

console.log('\n── marketPriceTrendService: buildCropTrends ────────────────────');

// ── Sorting: unordered snapshot input sorted correctly ──
{
  const snaps = [
    snapshot('2026-07-05', [entry('高麗菜', 20)]),
    snapshot('2026-07-03', [entry('高麗菜', 10)]),
    snapshot('2026-07-04', [entry('高麗菜', 15)]),
  ];
  const [trend] = buildCropTrends(snaps, ['高麗菜']);
  check('unordered input -> points sorted ascending by date', trend.points, [
    { date: '2026-07-03', avgPrice: 10 },
    { date: '2026-07-04', avgPrice: 15 },
    { date: '2026-07-05', avgPrice: 20 },
  ]);
}

// ── Crops missing from some days are skipped ──
{
  const snaps = [
    snapshot('2026-07-01', [entry('高麗菜', 10), entry('番茄', 30)]),
    snapshot('2026-07-02', [entry('番茄', 32)]), // 高麗菜 missing this day
    snapshot('2026-07-03', [entry('高麗菜', 12), entry('番茄', 31)]),
  ];
  const [cabbage] = buildCropTrends(snaps, ['高麗菜']);
  check('missing-crop day skipped for that crop', cabbage.points, [
    { date: '2026-07-01', avgPrice: 10 },
    { date: '2026-07-03', avgPrice: 12 },
  ]);
}

// ── Null avgPrice days excluded ──
{
  const snaps = [
    snapshot('2026-07-01', [entry('番茄', 30)]),
    snapshot('2026-07-02', [entry('番茄', null)]),
    snapshot('2026-07-03', [entry('番茄', 32)]),
  ];
  const [tomato] = buildCropTrends(snaps, ['番茄']);
  check('null avgPrice day excluded from points', tomato.points, [
    { date: '2026-07-01', avgPrice: 30 },
    { date: '2026-07-03', avgPrice: 32 },
  ]);
}

// ── 7-day window math: older-than-7d points excluded from sevenDayAvg but kept in points/min/max ──
{
  // Range end = 2026-07-20. Window start = 2026-07-13 (exclusive boundary: date > windowStart).
  const snaps = [
    snapshot('2026-07-01', [entry('蔥', 100)]), // outside window, but in points/min/max
    snapshot('2026-07-14', [entry('蔥', 20)]),  // inside window (14 > 13)
    snapshot('2026-07-20', [entry('蔥', 24)]),  // latest, inside window
  ];
  const [green] = buildCropTrends(snaps, ['蔥']);
  checkTrue('old point still present in points array', green.points.length === 3);
  check('periodMin includes the old outlier', green.periodMin, 20);
  check('periodMax includes the old outlier', green.periodMax, 100);
  check('sevenDayAvg excludes the >7d-old point', green.sevenDayAvg, 22); // (20+24)/2
  check('latestPrice/latestDate from last point', [green.latestPrice, green.latestDate], [24, '2026-07-20']);
}

// ── Boundary: point exactly 7 days before range end is excluded (strict >) ──
{
  const snaps = [
    snapshot('2026-07-13', [entry('薑', 10)]), // exactly 7 days before 07-20 -> excluded (date > windowStart, windowStart = 07-13)
    snapshot('2026-07-20', [entry('薑', 14)]),
  ];
  const [ginger] = buildCropTrends(snaps, ['薑']);
  check('point exactly at 7-day boundary excluded from sevenDayAvg', ginger.sevenDayAvg, 14);
}

// ── changePct rounding & sign ──
{
  const snaps = [
    snapshot('2026-07-01', [entry('蒜', 10)]),
    snapshot('2026-07-02', [entry('蒜', 10)]),
    snapshot('2026-07-03', [entry('蒜', 10)]),
    snapshot('2026-07-04', [entry('蒜', 11.005)]), // sevenDayAvg = (10+10+10+11.005)/4 = 10.25125 -> round2 = 10.25
  ];
  const [garlic] = buildCropTrends(snaps, ['蒜']);
  check('sevenDayAvg rounded to 2dp', garlic.sevenDayAvg, 10.25);
  // changePct = (11.01 - 10.25) / 10.25 * 100 = 7.41...% -> round1 = 7.4 (latest rounded to 2dp = 11.01 as stored point)
  checkTrue('changePct is a finite rounded number', typeof garlic.changePct === 'number');
  check('changePct rounded to 1dp', garlic.changePct, Math.round((((11.01 - 10.25) / 10.25) * 100) * 10) / 10);
}

// ── Signal thresholds: exactly -10 -> goodBuy (inclusive) ──
{
  // Direct construction: single window point + latest such that (latest - avg)/avg*100 == -10 exactly.
  // avg of [W, L] = (W+L)/2. Want (L-avg)/avg = -0.10 => L = 0.9*avg => avg = (W+L)/2 => L = 0.9*(W+L)/2
  // => 2L = 0.9W + 0.9L => 1.1L = 0.9W => L = (0.9/1.1)W. Simplify by choosing W=110, L=90: avg=100, changePct=(90-100)/100*100=-10 exactly.
  const exact = [
    snapshot('2026-07-14', [entry('辣椒', 110)]),
    snapshot('2026-07-20', [entry('辣椒', 90)]),
  ];
  const [pepper] = buildCropTrends(exact, ['辣椒']);
  check('sevenDayAvg exact', pepper.sevenDayAvg, 100);
  check('changePct exactly -10', pepper.changePct, -10);
  check('signal at exactly -10% -> goodBuy (inclusive)', pepper.signal, 'goodBuy');
}

// ── Signal thresholds: exactly +10 -> wait (inclusive) ──
{
  // avg=100, L=110 => changePct = (110-100)/100*100 = 10 exactly. avg of [W,L]=100 => W+L=200 => W=90.
  const exact = [
    snapshot('2026-07-14', [entry('青蔥', 90)]),
    snapshot('2026-07-20', [entry('青蔥', 110)]),
  ];
  const [scallion] = buildCropTrends(exact, ['青蔥']);
  check('sevenDayAvg exact', scallion.sevenDayAvg, 100);
  check('changePct exactly +10', scallion.changePct, 10);
  check('signal at exactly +10% -> wait (inclusive)', scallion.signal, 'wait');
}

// ── Signal: normal band strictly between -10 and +10 ──
{
  const exact = [
    snapshot('2026-07-14', [entry('紅蘿蔔', 100)]),
    snapshot('2026-07-20', [entry('紅蘿蔔', 105)]), // avg=102.5, changePct = (105-102.5)/102.5*100 = 2.44 -> normal
  ];
  const [carrot] = buildCropTrends(exact, ['紅蘿蔔']);
  check('signal within +/-10% band -> normal', carrot.signal, 'normal');
}

// ── noData: fewer than 2 points ──
{
  const one櫻 = [snapshot('2026-07-20', [entry('櫻桃', 50)])];
  const [cherry] = buildCropTrends(one櫻, ['櫻桃']);
  check('single point -> noData signal', cherry.signal, 'noData');
  check('single point -> latestPrice still populated', cherry.latestPrice, 50);
  check('single point -> sevenDayAvg null', cherry.sevenDayAvg, null);

  const noneEntries: MarketPriceSnapshot[] = [];
  const [empty] = buildCropTrends(noneEntries, ['芭樂']);
  check('no points at all -> noData', empty.signal, 'noData');
  check('no points -> latestPrice null', empty.latestPrice, null);
}

// ── Output ordering follows cropNames input order ──
{
  const snaps = [
    snapshot('2026-07-01', [entry('A', 10), entry('B', 20), entry('C', 30)]),
    snapshot('2026-07-02', [entry('A', 11), entry('B', 21), entry('C', 31)]),
  ];
  const trends = buildCropTrends(snaps, ['C', 'A', 'B']);
  check('output order matches cropNames input order', trends.map((t) => t.cropName), ['C', 'A', 'B']);
}

// ── Determinism: same input -> same output ──
{
  const snaps = [
    snapshot('2026-07-02', [entry('蔥', 21)]),
    snapshot('2026-07-01', [entry('蔥', 20)]),
  ];
  const run1 = buildCropTrends(snaps, ['蔥']);
  const run2 = buildCropTrends(snaps, ['蔥']);
  check('deterministic output for identical input', run1, run2);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
