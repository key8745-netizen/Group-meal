/**
 * marketPriceAutoRefresh.test.ts
 *
 * Validation tests for Feature 035's `shouldRefreshSnapshot` pure helper in
 * marketPriceService.ts.
 * Run with: npx tsx src/services/__tests__/marketPriceAutoRefresh.test.ts
 */

import { shouldRefreshSnapshot } from '../marketPriceService';
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

function entry(cropName: string, overrides: Partial<MarketPriceEntry> = {}): MarketPriceEntry {
  return {
    cropName,
    avgPrice: 50,
    minPrice: 40,
    maxPrice: 60,
    totalQuantity: 1000,
    marketCount: 3,
    sampleCropNames: [cropName],
    ...overrides,
  };
}

function snapshot(entries: MarketPriceEntry[]): MarketPriceSnapshot {
  return {
    id: '2026-07-06',
    date: '2026-07-06',
    rocDate: '115.07.06',
    entries,
    warnings: [],
    fetchedBy: 'uid_1',
  };
}

console.log('\n── marketPriceService: shouldRefreshSnapshot ──────────────────');

check(
  'null snapshot, non-empty cropNames -> true',
  shouldRefreshSnapshot(null, ['高麗菜']),
  true,
);

check(
  'null snapshot, empty cropNames -> false (nothing to track)',
  shouldRefreshSnapshot(null, []),
  false,
);

check(
  'existing snapshot, empty cropNames -> false',
  shouldRefreshSnapshot(snapshot([entry('高麗菜')]), []),
  false,
);

check(
  'full coverage (exact match) -> false',
  shouldRefreshSnapshot(snapshot([entry('高麗菜'), entry('紅蘿蔔')]), ['高麗菜', '紅蘿蔔']),
  false,
);

check(
  'partial coverage — missing one requested crop -> true',
  shouldRefreshSnapshot(snapshot([entry('高麗菜')]), ['高麗菜', '紅蘿蔔']),
  true,
);

check(
  'extra entries in snapshot beyond requested crops -> false',
  shouldRefreshSnapshot(snapshot([entry('高麗菜'), entry('紅蘿蔔'), entry('大白菜')]), ['高麗菜']),
  false,
);

check(
  'order-insensitive: requested crops in different order than entries -> false',
  shouldRefreshSnapshot(snapshot([entry('紅蘿蔔'), entry('高麗菜'), entry('大白菜')]), ['大白菜', '高麗菜', '紅蘿蔔']),
  false,
);

check(
  'order-insensitive with a missing crop still detected regardless of order -> true',
  shouldRefreshSnapshot(snapshot([entry('紅蘿蔔'), entry('大白菜')]), ['高麗菜', '大白菜', '紅蘿蔔']),
  true,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
