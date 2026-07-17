/**
 * balancedMenuPlanner.test.ts — Feature 090 一鍵均衡菜單。
 * Run with: npx tsx src/services/__tests__/balancedMenuPlanner.test.ts
 */

import { planBalancedMenu, DEFAULT_MENU_QUOTAS, type BalancedMenuCandidate } from '../balancedMenuPlanner';

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

const c = (over: Partial<BalancedMenuCandidate> & { recipeId: string }): BalancedMenuCandidate => ({
  name: over.recipeId, ...over,
});

console.log('\n── balancedMenuPlanner: planBalancedMenu ──────────────────────────────');

// 依配額各類挑齊：1主菜 1主食 2蔬菜 1湯
{
  const cands: BalancedMenuCandidate[] = [
    c({ recipeId: 'm1', category: '主菜', costPerServing: 30 }),
    c({ recipeId: 'm2', category: '主菜', costPerServing: 20 }),
    c({ recipeId: 'r1', category: '主食', costPerServing: 5 }),
    c({ recipeId: 'v1', category: '蔬菜', costPerServing: 8 }),
    c({ recipeId: 'v2', category: '蔬菜', costPerServing: 6 }),
    c({ recipeId: 'v3', category: '蔬菜', costPerServing: 10 }),
    c({ recipeId: 's1', category: '湯', costPerServing: 4 }),
  ];
  const r = planBalancedMenu(cands);
  check('主菜挑最便宜 m2', r.byCategory.find((x) => x.category === '主菜')?.recipeIds, ['m2']);
  check('蔬菜挑 2 道最便宜 v2,v1', r.byCategory.find((x) => x.category === '蔬菜')?.recipeIds, ['v2', 'v1']);
  check('總選 5 道', r.selectedRecipeIds.length, 5);
  check('無缺口', r.shortfalls, []);
}

// 惜食優先：清庫存的菜勝過更便宜的
{
  const cands = [
    c({ recipeId: 'cheap', category: '主菜', costPerServing: 10 }),
    c({ recipeId: 'clear', category: '主菜', costPerServing: 40, clearsExpiring: true }),
  ];
  const r = planBalancedMenu(cands, [{ category: '主菜', count: 1 }]);
  check('清庫存優先於便宜', r.selectedRecipeIds, ['clear']);
}

// 庫存可出 優先於 成本（在惜食相同時）
{
  const cands = [
    c({ recipeId: 'cheapNoStock', category: '蔬菜', costPerServing: 5, stockFeasible: false }),
    c({ recipeId: 'stock', category: '蔬菜', costPerServing: 20, stockFeasible: true }),
  ];
  const r = planBalancedMenu(cands, [{ category: '蔬菜', count: 1 }]);
  check('庫存可出優先', r.selectedRecipeIds, ['stock']);
}

// 候選不足 → 回報缺口
{
  const cands = [c({ recipeId: 'v1', category: '蔬菜' })];
  const r = planBalancedMenu(cands, [{ category: '蔬菜', count: 2 }, { category: '主菜', count: 1 }]);
  check('蔬菜只填 1', r.byCategory.find((x) => x.category === '蔬菜')?.got, 1);
  check('蔬菜缺 1', r.shortfalls.find((s) => s.category === '蔬菜')?.got, 1);
  check('主菜缺（0 候選）', r.shortfalls.find((s) => s.category === '主菜')?.got, 0);
}

// 未分類候選被忽略
{
  const cands = [c({ recipeId: 'x' }), c({ recipeId: 'm', category: '主菜' })];
  const r = planBalancedMenu(cands, [{ category: '主菜', count: 1 }]);
  check('只選有分類的', r.selectedRecipeIds, ['m']);
}

// 成本 null 排最後
{
  const cands = [
    c({ recipeId: 'known', category: '湯', costPerServing: 15 }),
    c({ recipeId: 'unknown', category: '湯', costPerServing: null }),
  ];
  const r = planBalancedMenu(cands, [{ category: '湯', count: 1 }]);
  check('已知成本優先於未知', r.selectedRecipeIds, ['known']);
}

// 預設配額結構
{
  check('預設配額 4 類', DEFAULT_MENU_QUOTAS.length, 4);
}

// 空候選
{
  const r = planBalancedMenu([]);
  check('空候選 → 無選取', r.selectedRecipeIds, []);
  check('空候選 → 全缺口', r.shortfalls.length, 4);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — balancedMenuPlanner verified');
