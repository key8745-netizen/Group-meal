/**
 * marketPriceService.test.ts
 *
 * Validation tests for the pure helpers in marketPriceService.ts:
 * toRocDate, pricePerKgFromDefault, aggregateAmisRows.
 * Run with: npx tsx src/services/__tests__/marketPriceService.test.ts
 */

import {
  toRocDate, pricePerKgFromDefault, aggregateAmisRows,
} from '../marketPriceService';
import type { IngredientMaster } from '../types';

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

function baseIngredient(overrides: Partial<IngredientMaster> = {}): IngredientMaster {
  return {
    id: 'ing_1',
    name: '測試食材',
    normalizedName: '測試食材',
    category: '蔬菜',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 100,
    defaultPriceUnit: 'kg',
    isActive: true,
    ...overrides,
  };
}

console.log('\n── marketPriceService: toRocDate ──────────────────────────────');

check('2026-07-06 -> 115.07.06', toRocDate('2026-07-06'), '115.07.06');
check('century edge: 2000-01-01 -> 89.01.01', toRocDate('2000-01-01'), '89.01.01');
check('1912-01-01 -> 1.01.01 (ROC year 1)', toRocDate('1912-01-01'), '1.01.01');
check('month/day padding preserved: 2026-01-09 -> 115.01.09', toRocDate('2026-01-09'), '115.01.09');
check('2024-12-31 -> 113.12.31', toRocDate('2024-12-31'), '113.12.31');

console.log('\n── marketPriceService: pricePerKgFromDefault ──────────────────');

check(
  'defaultPriceUnit kg -> as-is',
  pricePerKgFromDefault(baseIngredient({ defaultPrice: 45.5, defaultPriceUnit: 'kg' })),
  45.5,
);

check(
  'defaultPriceUnit 台斤 -> price / 0.6',
  pricePerKgFromDefault(baseIngredient({ defaultPrice: 30, defaultPriceUnit: '台斤' })),
  50,
);

check(
  'defaultPriceUnit g -> price * 1000',
  pricePerKgFromDefault(baseIngredient({ defaultPrice: 0.08, defaultPriceUnit: 'g' })),
  80,
);

check(
  'defaultPriceUnit === purchaseUnit, baseUnit g -> price / conversionFactor * 1000',
  pricePerKgFromDefault(baseIngredient({
    baseUnit: 'g', purchaseUnit: '箱', conversionFactorToBaseUnit: 5000,
    defaultPrice: 250, defaultPriceUnit: '箱',
  })),
  50, // 250 / 5000 = 0.05 NT$/g -> *1000 = 50 NT$/kg
);

check(
  'defaultPriceUnit === purchaseUnit, baseUnit ml -> treated like g',
  pricePerKgFromDefault(baseIngredient({
    baseUnit: 'ml', purchaseUnit: '瓶', conversionFactorToBaseUnit: 600,
    defaultPrice: 60, defaultPriceUnit: '瓶',
  })),
  100, // 60 / 600 = 0.1 NT$/ml -> *1000 = 100 NT$/kg-equivalent
);

check(
  'baseUnit pcs, defaultPriceUnit === purchaseUnit -> null (cannot convert)',
  pricePerKgFromDefault(baseIngredient({
    baseUnit: 'pcs', purchaseUnit: '個', conversionFactorToBaseUnit: 1,
    defaultPrice: 5, defaultPriceUnit: '個',
  })),
  null,
);

check(
  'missing conversionFactorToBaseUnit (0) -> null',
  pricePerKgFromDefault(baseIngredient({
    baseUnit: 'g', purchaseUnit: '箱', conversionFactorToBaseUnit: 0,
    defaultPrice: 250, defaultPriceUnit: '箱',
  })),
  null,
);

check(
  'unrecognized defaultPriceUnit not matching purchaseUnit -> null',
  pricePerKgFromDefault(baseIngredient({
    purchaseUnit: '箱', defaultPrice: 100, defaultPriceUnit: '包',
  })),
  null,
);

console.log('\n── marketPriceService: aggregateAmisRows ──────────────────────');

check(
  'empty rows -> all null/zero',
  aggregateAmisRows([]),
  { avgPrice: null, minPrice: null, maxPrice: null, totalQuantity: 0, marketCount: 0, sampleCropNames: [] },
);

check(
  'Avg_Price <= 0 rows filtered out entirely',
  aggregateAmisRows([
    { CropName: 'A', Avg_Price: 0, Trans_Quantity: 100 },
    { CropName: 'A', Avg_Price: null, Trans_Quantity: 50 },
  ]),
  { avgPrice: null, minPrice: null, maxPrice: null, totalQuantity: 0, marketCount: 0, sampleCropNames: [] },
);

check(
  'quantity-weighted average when quantities present',
  aggregateAmisRows([
    { CropName: '甘藍 初秋', Avg_Price: 10, Trans_Quantity: 100 },
    { CropName: '甘藍 初秋', Avg_Price: 20, Trans_Quantity: 300 },
  ]),
  {
    avgPrice: 17.5, // (10*100 + 20*300) / 400 = 7000/400 = 17.5
    minPrice: 10,
    maxPrice: 20,
    totalQuantity: 400,
    marketCount: 2,
    sampleCropNames: ['甘藍 初秋'],
  },
);

check(
  'simple mean fallback when all quantities zero/missing',
  aggregateAmisRows([
    { CropName: 'A', Avg_Price: 10, Trans_Quantity: 0 },
    { CropName: 'B', Avg_Price: 20, Trans_Quantity: undefined },
    { CropName: 'C', Avg_Price: 30, Trans_Quantity: null },
  ]),
  {
    avgPrice: 20, // simple mean (10+20+30)/3
    minPrice: 10,
    maxPrice: 30,
    totalQuantity: 0,
    marketCount: 3,
    sampleCropNames: ['A', 'B', 'C'],
  },
);

check(
  'mixed valid/invalid rows: only Avg_Price > 0 rows counted',
  aggregateAmisRows([
    { CropName: 'A', Avg_Price: 15, Trans_Quantity: 10 },
    { CropName: 'B', Avg_Price: 0, Trans_Quantity: 999 },
    { CropName: 'C', Avg_Price: -5, Trans_Quantity: 5 },
  ]),
  {
    avgPrice: 15,
    minPrice: 15,
    maxPrice: 15,
    totalQuantity: 10,
    marketCount: 1,
    sampleCropNames: ['A'],
  },
);

check(
  'sampleCropNames dedups and caps at 5 distinct names',
  aggregateAmisRows(
    Array.from({ length: 8 }, (_, i) => ({
      CropName: `作物${i % 6}`, Avg_Price: 10 + i, Trans_Quantity: 1,
    })),
  ).sampleCropNames,
  ['作物0', '作物1', '作物2', '作物3', '作物4'],
);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
