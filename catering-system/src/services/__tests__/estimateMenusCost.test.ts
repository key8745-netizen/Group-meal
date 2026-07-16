/**
 * estimateMenusCost.test.ts — Feature 070 當日菜單預估食材成本。
 * Run with: npx tsx src/services/__tests__/estimateMenusCost.test.ts
 */

import { estimateMenusCost } from '../costAwareMenuSuggestionService';
import type { IngredientMaster, MarketPriceSnapshot, Recipe, RecipeMenu } from '../types';

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

function ing(id: string, pricePerKg: number | null): IngredientMaster {
  return {
    id, name: id, normalizedName: id, category: '測試',
    baseUnit: 'g', purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000,
    defaultPrice: pricePerKg ?? 0, defaultPriceUnit: pricePerKg == null ? '' : 'kg', isActive: true,
  };
}
function recipe(id: string, lines: { ingredientId: string; baseQuantity: number }[]): Recipe {
  return { id, name: id, isActive: true, recipeIngredients: lines, createdBy: 'u', updatedBy: 'u' } as Recipe;
}
function menu(recipes: { recipeId: string; servings: number }[]): RecipeMenu {
  return {
    id: 'm', name: '午餐', date: '2026-07-06', mealType: '午餐', isActive: true,
    menuRecipes: recipes.map((r) => ({ recipeId: r.recipeId, recipeNameSnapshot: r.recipeId, servings: r.servings })),
    createdBy: 'u', updatedBy: 'u',
  } as RecipeMenu;
}
const NO_SNAP: MarketPriceSnapshot | null = null;

console.log('\n── costAwareMenuSuggestionService: estimateMenusCost ──────────────────');

// ── cost × servings summed across dishes ───────────────────────────────────
{
  const ingredientById = new Map([['豬肉', ing('豬肉', 200)], ['高麗菜', ing('高麗菜', 30)]]);
  const recipeById = new Map([
    ['主菜', recipe('主菜', [{ ingredientId: '豬肉', baseQuantity: 100 }])],   // 20/份
    ['副菜', recipe('副菜', [{ ingredientId: '高麗菜', baseQuantity: 200 }])], // 6/份
  ]);
  // 主菜 20×50 = 1000；副菜 6×50 = 300；total 1300
  const r = estimateMenusCost([menu([{ recipeId: '主菜', servings: 50 }, { recipeId: '副菜', servings: 50 }])], recipeById, ingredientById, NO_SNAP);
  check('total 1300', r.totalCost, 1300);
  check('pricedDishCount 2', r.pricedDishCount, 2);
  check('totalDishCount 2', r.totalDishCount, 2);
  check('complete true', r.complete, true);
}

// ── missing recipe / unpriced ingredient → not summed, complete=false ──────
{
  const ingredientById = new Map([['豬肉', ing('豬肉', 200)], ['神秘', ing('神秘', null)]]);
  const recipeById = new Map([
    ['主菜', recipe('主菜', [{ ingredientId: '豬肉', baseQuantity: 100 }])],
    ['謎菜', recipe('謎菜', [{ ingredientId: '神秘', baseQuantity: 100 }])],
  ]);
  const r = estimateMenusCost([menu([
    { recipeId: '主菜', servings: 10 },
    { recipeId: '謎菜', servings: 10 },
    { recipeId: '不存在', servings: 10 },
  ])], recipeById, ingredientById, NO_SNAP);
  check('total = 主菜 only 200', r.totalCost, 200);
  check('pricedDishCount 1', r.pricedDishCount, 1);
  check('totalDishCount 3', r.totalDishCount, 3);
  check('complete false', r.complete, false);
}

// ── empty ──────────────────────────────────────────────────────────────────
{
  const r = estimateMenusCost([], new Map(), new Map(), NO_SNAP);
  check('empty total 0', r.totalCost, 0);
  check('empty complete false', r.complete, false);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — estimateMenusCost verified');
