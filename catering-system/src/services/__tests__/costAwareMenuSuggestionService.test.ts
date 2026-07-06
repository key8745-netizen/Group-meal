/**
 * costAwareMenuSuggestionService.test.ts
 *
 * Validation tests for Feature 033: 性價比菜單建議與採購成本標註.
 * Covers `resolveIngredientPrice` (market/default/none/pcs/ml) and
 * `calculateCostAwareMenuSuggestion` (pure, end-to-end on small fixtures).
 * Run with: npx tsx src/services/__tests__/costAwareMenuSuggestionService.test.ts
 */

import {
  resolveIngredientPrice,
  calculateCostAwareMenuSuggestion,
} from '../costAwareMenuSuggestionService';
import type {
  IngredientMaster,
  MarketPriceSnapshot,
  MarketPriceEntry,
  Recipe,
  RecipeIngredientItem,
} from '../types';

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

function checkTrue(label: string, actual: boolean): void {
  if (actual) { console.log(`  ✅ ${label}`); passed++; }
  else { console.error(`  ❌ ${label} (expected true)`); failed++; }
}

function ingredient(overrides: Partial<IngredientMaster> = {}): IngredientMaster {
  return {
    id: 'ing_default',
    name: '預設食材',
    normalizedName: '預設食材',
    category: '一般',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 100,
    defaultPriceUnit: 'kg',
    isActive: true,
    ...overrides,
  };
}

function line(overrides: Partial<RecipeIngredientItem> = {}): RecipeIngredientItem {
  return {
    ingredientId: 'ing_default',
    ingredientNameSnapshot: '預設食材',
    quantity: 100,
    unit: 'g',
    baseQuantity: 100,
    baseUnit: 'g',
    ...overrides,
  };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe_default',
    name: '預設配方',
    recipeIngredients: [line()],
    isActive: true,
    createdBy: 'tester',
    updatedBy: 'tester',
    ...overrides,
  };
}

function marketEntry(overrides: Partial<MarketPriceEntry> = {}): MarketPriceEntry {
  return {
    cropName: '測試作物',
    avgPrice: 100,
    minPrice: 90,
    maxPrice: 110,
    totalQuantity: 10,
    marketCount: 1,
    sampleCropNames: ['測試作物'],
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
    fetchedBy: 'tester',
  };
}

console.log('\n── costAwareMenuSuggestionService: resolveIngredientPrice ──────');

const meatIng = ingredient({
  id: 'ing_meat', name: '豬肉', marketCropName: '豬肉價格', defaultPrice: 200, defaultPriceUnit: 'kg',
});
const snap1 = snapshot([marketEntry({ cropName: '豬肉價格', avgPrice: 150, minPrice: 140, maxPrice: 160 })]);

check(
  'market hit -> source market, pricePerKg from snapshot, pricePerBaseUnit = pricePerKg/1000',
  resolveIngredientPrice(meatIng, snap1),
  { pricePerBaseUnit: 0.15, pricePerKg: 150, source: 'market', cropName: '豬肉價格' },
);

const vegIng = ingredient({ id: 'ing_veg', name: '高麗菜', defaultPrice: 50, defaultPriceUnit: 'kg' });
check(
  'no marketCropName -> falls back to default price',
  resolveIngredientPrice(vegIng, snap1),
  { pricePerBaseUnit: 0.05, pricePerKg: 50, source: 'default' },
);

const chickenIng = ingredient({
  id: 'ing_chicken', name: '雞肉', marketCropName: '雞肉價格', defaultPrice: 80, defaultPriceUnit: 'kg',
});
check(
  'marketCropName set but snapshot has no matching entry -> falls back to default',
  resolveIngredientPrice(chickenIng, snap1),
  { pricePerBaseUnit: 0.08, pricePerKg: 80, source: 'default' },
);

const snapNullPrice = snapshot([marketEntry({ cropName: '豬肉價格', avgPrice: null })]);
check(
  'market entry present but avgPrice is null -> falls back to default',
  resolveIngredientPrice(meatIng, snapNullPrice),
  { pricePerBaseUnit: 0.2, pricePerKg: 200, source: 'default' },
);

check(
  'snapshot is null -> falls back to default even for market-linked ingredient',
  resolveIngredientPrice(meatIng, null),
  { pricePerBaseUnit: 0.2, pricePerKg: 200, source: 'default' },
);

const unresolvableIng = ingredient({
  id: 'ing_unresolvable', name: '神秘食材', purchaseUnit: '箱', defaultPrice: 100, defaultPriceUnit: '包',
});
check(
  'unresolvable defaultPriceUnit (not kg/台斤/g, not matching purchaseUnit) -> none',
  resolveIngredientPrice(unresolvableIng, snap1),
  { pricePerBaseUnit: null, pricePerKg: null, source: 'none' },
);

const eggIng = ingredient({
  id: 'ing_egg', name: '雞蛋', baseUnit: 'pcs', purchaseUnit: '個',
  conversionFactorToBaseUnit: 1, defaultPrice: 5, defaultPriceUnit: '個',
});
check(
  'pcs baseUnit, defaultPriceUnit === purchaseUnit -> defaultPrice / conversionFactorToBaseUnit',
  resolveIngredientPrice(eggIng, snap1),
  { pricePerBaseUnit: 5, pricePerKg: null, source: 'default' },
);

const eggWithCropIng = ingredient({
  id: 'ing_egg_crop', name: '土雞蛋', baseUnit: 'pcs', purchaseUnit: '個',
  conversionFactorToBaseUnit: 1, defaultPrice: 6, defaultPriceUnit: '個', marketCropName: '土雞蛋價格',
});
check(
  'pcs baseUnit ignores marketCropName even when set — market pricing not applicable to pcs',
  resolveIngredientPrice(eggWithCropIng, snapshot([marketEntry({ cropName: '土雞蛋價格', avgPrice: 999 })])),
  { pricePerBaseUnit: 6, pricePerKg: null, source: 'default' },
);

const eggMismatchIng = ingredient({
  id: 'ing_egg_mismatch', name: '鴨蛋', baseUnit: 'pcs', purchaseUnit: '個',
  conversionFactorToBaseUnit: 1, defaultPrice: 5, defaultPriceUnit: '箱',
});
check(
  'pcs baseUnit with defaultPriceUnit !== purchaseUnit -> none',
  resolveIngredientPrice(eggMismatchIng, snap1),
  { pricePerBaseUnit: null, pricePerKg: null, source: 'none' },
);

const oilIng = ingredient({
  id: 'ing_oil', name: '沙拉油', baseUnit: 'ml', purchaseUnit: '瓶',
  conversionFactorToBaseUnit: 600, defaultPrice: 60, defaultPriceUnit: '瓶',
});
check(
  'ml baseUnit assumes 1g/mL density via pricePerKgFromDefault, then /1000',
  resolveIngredientPrice(oilIng, snap1),
  { pricePerBaseUnit: 0.1, pricePerKg: 100, source: 'default' },
);

console.log('\n── costAwareMenuSuggestionService: calculateCostAwareMenuSuggestion ──');

// Fixture ingredients (all baseUnit 'g', defaultPrice denominated in kg for simplicity)
const ing_X = ingredient({ id: 'ing_X', name: '食材X（無庫存）', defaultPrice: 100, defaultPriceUnit: 'kg' }); // 0.1/g
const ing_B = ingredient({ id: 'ing_B', name: '食材B（庫存充足）', defaultPrice: 100, defaultPriceUnit: 'kg' }); // 0.1/g
const ing_A = ingredient({ id: 'ing_A', name: '食材A（部分庫存）', defaultPrice: 100, defaultPriceUnit: 'kg' }); // 0.1/g
const ing_C = ingredient({ id: 'ing_C', name: '食材C（庫存限制）', defaultPrice: 80, defaultPriceUnit: 'kg' }); // 0.08/g
const ing_meat2 = ingredient({
  id: 'ing_meat2', name: '市價豬肉', marketCropName: '豬肉價格', defaultPrice: 200, defaultPriceUnit: 'kg',
}); // market 0.15/g via snap1
const ing_unpriced2 = ingredient({
  id: 'ing_unpriced2', name: '無價食材', purchaseUnit: '箱', defaultPrice: 100, defaultPriceUnit: '包',
});

const recipeNoStock = recipe({
  id: 'r_noStock', name: 'No Stock Recipe',
  recipeIngredients: [line({ ingredientId: 'ing_X', ingredientNameSnapshot: '食材X（無庫存）', baseQuantity: 100 })],
});
const recipeFullStock = recipe({
  id: 'r_fullStock', name: 'Full Stock Recipe',
  recipeIngredients: [line({ ingredientId: 'ing_B', ingredientNameSnapshot: '食材B（庫存充足）', baseQuantity: 100 })],
});
const recipeMulti = recipe({
  id: 'r_multi', name: 'Multi Ingredient Recipe',
  recipeIngredients: [
    line({ ingredientId: 'ing_A', ingredientNameSnapshot: '食材A（部分庫存）', baseQuantity: 50 }),
    line({ ingredientId: 'ing_C', ingredientNameSnapshot: '食材C（庫存限制）', baseQuantity: 10 }),
  ],
});
const recipeMarket = recipe({
  id: 'r_market', name: 'Market Priced Recipe',
  recipeIngredients: [line({ ingredientId: 'ing_meat2', ingredientNameSnapshot: '市價豬肉', baseQuantity: 100 })],
});
const recipeUnpricedA = recipe({
  id: 'r_unpriced_a', name: 'Unpriced Recipe A',
  recipeIngredients: [line({ ingredientId: 'ing_unpriced2', ingredientNameSnapshot: '無價食材', baseQuantity: 100 })],
});
const recipeUnpricedB = recipe({
  id: 'r_unpriced_b', name: 'Unpriced Recipe B',
  recipeIngredients: [line({ ingredientId: 'ing_unpriced2', ingredientNameSnapshot: '無價食材', baseQuantity: 50 })],
});
const recipeEmpty = recipe({ id: 'r_empty', name: 'Empty Recipe', recipeIngredients: [] });

const allIngredients = [ing_X, ing_B, ing_A, ing_C, ing_meat2, ing_unpriced2];
const inventoryByIngredientId: Record<string, number> = {
  ing_B: 10,   // kg -> 10,000g available; baseQuantity 100 -> 100 servings
  ing_A: 1,    // kg -> 1,000g available; baseQuantity 50 -> 20 servings
  ing_C: 0.05, // kg -> 50g available; baseQuantity 10 -> 5 servings (limiting)
  // ing_X, ing_meat2: no inventory doc -> no stock data
};

const scrambledRecipes = [
  recipeUnpricedB, recipeMulti, recipeEmpty, recipeUnpricedA, recipeFullStock, recipeNoStock, recipeMarket,
];

const result = calculateCostAwareMenuSuggestion(
  { targetServingCount: 50 },
  scrambledRecipes,
  allIngredients,
  inventoryByIngredientId,
  snap1,
);

check('assessedRecipeCount counts all input recipes (including the skipped empty one)', result.assessedRecipeCount, 7);
check('priceSnapshotDate reflects the snapshot passed in', result.priceSnapshotDate, '2026-07-06');
check('empty recipe is excluded from items', result.items.some((i) => i.recipeId === 'r_empty'), false);
checkTrue(
  'manualReviewNotes includes a skip note naming the empty recipe',
  result.manualReviewNotes.some((n) => n.includes('Empty Recipe')),
);
checkTrue(
  'manualReviewNotes always includes the human-review-only disclaimer',
  result.manualReviewNotes.some((n) => n.includes('本建議僅供人工參考')),
);
checkTrue(
  'manualReviewNotes does NOT include the "no snapshot" note when a snapshot was supplied',
  !result.manualReviewNotes.some((n) => n.includes('無市價快取')),
);

check('6 recipes produced assessment items (7 input - 1 empty, all others priced/unpriced)', result.items.length, 6);

// Ranking order: fullStock (20.00) > multi (18.97) > noStock (10.00) > market (6.67) > nulls last, by name
check(
  'items sorted best valueScore first; null-score items last (sorted by name)',
  result.items.map((i) => i.recipeId),
  ['r_fullStock', 'r_multi', 'r_noStock', 'r_market', 'r_unpriced_a', 'r_unpriced_b'],
);

const byId = new Map(result.items.map((i) => [i.recipeId, i]));

const noStockItem = byId.get('r_noStock')!;
check('recipeNoStock estimatedCostPerServing = 100g * 0.1/g', noStockItem.estimatedCostPerServing, 10);
check('recipeNoStock has no stock data -> maxServingsFromStock null', noStockItem.maxServingsFromStock, null);
check('recipeNoStock has no limiting ingredient (no stock data at all)', noStockItem.limitingIngredientNameSnapshot, undefined);
check('recipeNoStock valueScore = (1+0)/10*100', noStockItem.valueScore, 10);

const fullStockItem = byId.get('r_fullStock')!;
check('recipeFullStock estimatedCostPerServing = 100g * 0.1/g (same unit cost as noStock)', fullStockItem.estimatedCostPerServing, 10);
check('recipeFullStock maxServingsFromStock capped by target (100 available, target 50)', fullStockItem.maxServingsFromStock, 100);
check(
  'stock factor doubling: identical cost, fully stocked to target -> exactly 2x the no-stock valueScore',
  fullStockItem.valueScore,
  noStockItem.valueScore! * 2,
);

const multiItem = byId.get('r_multi')!;
check('recipeMulti estimatedCostPerServing = 50*0.1 + 10*0.08', multiItem.estimatedCostPerServing, 5.8);
check('recipeMulti maxServingsFromStock = min(20, 5) = 5 (ing_C is limiting)', multiItem.maxServingsFromStock, 5);
check('recipeMulti limitingIngredientNameSnapshot names the scarcer ingredient', multiItem.limitingIngredientNameSnapshot, '食材C（庫存限制）');
check('recipeMulti valueScore = round2((1 + 5/50)/5.8*100)', multiItem.valueScore, 18.97);
check('recipeMulti stockCoverageRatio = 2/2 lines have stock data', multiItem.stockCoverageRatio, 1);

const marketItem = byId.get('r_market')!;
check('recipeMarket resolves its ingredient via the market snapshot', marketItem.marketPricedIngredientCount, 1);
check('recipeMarket has zero default/unpriced lines', [marketItem.defaultPricedIngredientCount, marketItem.unpricedIngredientCount], [0, 0]);
check('recipeMarket estimatedCostPerServing = 100g * 0.15/g (market price)', marketItem.estimatedCostPerServing, 15);

const unpricedAItem = byId.get('r_unpriced_a')!;
const unpricedBItem = byId.get('r_unpriced_b')!;
check('unpriced recipe A has null estimatedCostPerServing (unresolvable ingredient price)', unpricedAItem.estimatedCostPerServing, null);
check('unpriced recipe A has null valueScore', unpricedAItem.valueScore, null);
check('unpriced recipe B has null valueScore too', unpricedBItem.valueScore, null);
checkTrue(
  'null-score recipes are ordered after all priced recipes',
  result.items.indexOf(unpricedAItem) > result.items.indexOf(marketItem)
    && result.items.indexOf(unpricedBItem) > result.items.indexOf(marketItem),
);

// snapshot-null path
const noSnapshotResult = calculateCostAwareMenuSuggestion(
  { targetServingCount: 10 },
  [recipeNoStock],
  allIngredients,
  {},
  null,
);
check('priceSnapshotDate is null when no snapshot supplied', noSnapshotResult.priceSnapshotDate, null);
checkTrue(
  'manualReviewNotes flags missing snapshot / default-price-only fallback',
  noSnapshotResult.manualReviewNotes.some((n) => n.includes('無市價快取，全部使用基準價')),
);

// invalid input validation
let threw = false;
try {
  calculateCostAwareMenuSuggestion({ targetServingCount: 0 }, [], [], {}, null);
} catch {
  threw = true;
}
checkTrue('targetServingCount must be >= 1 (throws otherwise)', threw);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
