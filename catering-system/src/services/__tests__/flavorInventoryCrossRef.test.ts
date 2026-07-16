/**
 * flavorInventoryCrossRef.test.ts — Feature 076 風味建議 × 庫存/保鮮/成本交叉比對。
 * Run with: npx tsx src/services/__tests__/flavorInventoryCrossRef.test.ts
 */

import { crossReferenceSuggestions, type CrossRefContext } from '../flavorInventoryCrossRef';
import type { PairingSuggestion } from '../recipeFlavorAdvisor';
import type { FreshnessState } from '../types';

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

const sug = (name: string, count: number): PairingSuggestion => ({ name, count, from: [] });

function ctxOf(
  ingredients: { id: string; name: string; nameEn?: string }[],
  stock: Record<string, number>,
  fresh: Record<string, FreshnessState>,
  cost?: Record<string, number>,
): CrossRefContext {
  return {
    ingredients,
    stockByIngredientId: new Map(Object.entries(stock)),
    freshnessByIngredientId: new Map(Object.entries(fresh) as [string, FreshnessState][]),
    costPerKgByIngredientId: cost ? new Map(Object.entries(cost)) : undefined,
  };
}

console.log('\n── flavorInventoryCrossRef: crossReferenceSuggestions ─────────────────');

// 分級：在庫且快過期 = CLEAR_STOCK；在庫新鮮 = IN_STOCK；沒庫存 = BUY
{
  const ctx = ctxOf(
    [
      { id: 'basil', name: '羅勒' },
      { id: 'lemon', name: '檸檬' },
      { id: 'olive', name: '橄欖油' },
    ],
    { basil: 0.5, lemon: 1.0, olive: 0 },
    { basil: 'CRITICAL', lemon: 'FRESH' },
  );
  const out = crossReferenceSuggestions([sug('羅勒', 2), sug('檸檬', 2), sug('橄欖油', 1)], ctx);
  const byName = Object.fromEntries(out.map((e) => [e.name, e]));
  check('羅勒 在庫快過期 → CLEAR_STOCK', byName['羅勒'].tag, 'CLEAR_STOCK');
  check('羅勒 inStockKg', byName['羅勒'].inStockKg, 0.5);
  check('檸檬 在庫新鮮 → IN_STOCK', byName['檸檬'].tag, 'IN_STOCK');
  check('橄欖油 庫存 0 → BUY', byName['橄欖油'].tag, 'BUY');
  check('橄欖油 無 inStockKg', byName['橄欖油'].inStockKg, undefined);
}

// 排序：CLEAR_STOCK 應排在 IN_STOCK 前，兩者都在 BUY 前 —— 即使風味共識較低
{
  const ctx = ctxOf(
    [
      { id: 'basil', name: '羅勒' },
      { id: 'lemon', name: '檸檬' },
      { id: 'garlic', name: '大蒜' },
    ],
    { basil: 0.5, lemon: 1.0, garlic: 0 },
    { basil: 'USE_FIRST', lemon: 'FRESH' },
  );
  // 大蒜共識最高(3)但沒庫存，應被在庫項壓在後面
  const out = crossReferenceSuggestions([sug('大蒜', 3), sug('檸檬', 1), sug('羅勒', 1)], ctx);
  check('排序：清庫存(羅勒) 在最前', out[0].name, '羅勒');
  check('排序：有庫存(檸檬) 次之', out[1].name, '檸檬');
  check('排序：只能買(大蒜) 墊底', out[2].name, '大蒜');
}

// 無對應食材主檔 → BUY、無 ingredientId
{
  const ctx = ctxOf([{ id: 'basil', name: '羅勒' }], { basil: 1 }, {});
  const out = crossReferenceSuggestions([sug('這不是主檔食材', 1)], ctx);
  check('無對應 → BUY', out[0].tag, 'BUY');
  check('無對應 → 無 ingredientId', out[0].ingredientId, undefined);
}

// 成本帶入
{
  const ctx = ctxOf([{ id: 'lemon', name: '檸檬' }], { lemon: 2 }, { lemon: 'FRESH' }, { lemon: 45 });
  const out = crossReferenceSuggestions([sug('檸檬', 1)], ctx);
  check('costPerKg 帶入', out[0].costPerKg, 45);
}

// 空建議
{
  const ctx = ctxOf([{ id: 'lemon', name: '檸檬' }], { lemon: 2 }, {});
  check('空建議 → 空陣列', crossReferenceSuggestions([], ctx), []);
}

// 無庫存資料時：行為退化為維持共識排序（count 由大到小）
{
  const ctx = ctxOf([], {}, {});
  const out = crossReferenceSuggestions([sug('A', 1), sug('B', 3), sug('C', 2)], ctx);
  check('無庫存資料 → 依共識排序', out.map((e) => e.name), ['B', 'C', 'A']);
  check('無庫存資料 → 全 BUY', out.every((e) => e.tag === 'BUY'), true);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — flavorInventoryCrossRef verified');
