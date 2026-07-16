/**
 * useItUpPlanner.test.ts — Feature 077 快到期食材 → 反查配方建議。
 * Run with: npx tsx src/services/__tests__/useItUpPlanner.test.ts
 */

import { suggestUseItUpRecipes, type ExpiringIngredient, type UseItUpRecipe } from '../useItUpPlanner';

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

const exp = (id: string, name: string, kg: number): ExpiringIngredient => ({
  ingredientId: id, ingredientName: name, atRiskKg: kg,
});
const recipe = (id: string, name: string, ids: string[]): UseItUpRecipe => ({ id, name, ingredientIds: ids });

console.log('\n── useItUpPlanner: suggestUseItUpRecipes ──────────────────────────────');

const expiring = [exp('basil', '九層塔', 0.3), exp('pork', '豬五花', 1.2), exp('garlic', '大蒜', 0.1)];
const recipes: UseItUpRecipe[] = [
  recipe('r-sanbei', '三杯雞', ['chicken', 'basil', 'garlic', 'ginger']),   // 用 2 種快到期
  recipe('r-braise', '滷豬肉', ['pork', 'soy', 'garlic']),                   // 用 2 種快到期
  recipe('r-omelet', '菜脯蛋', ['egg', 'radish']),                          // 用 0 種
  recipe('r-stirbasil', '塔香茄子', ['eggplant', 'basil']),                  // 用 1 種
];

// 命中排序：能清最多種者優先；同 matchCount 依 totalAtRiskKg 大者優先
{
  const out = suggestUseItUpRecipes(expiring, recipes);
  check('回傳 3 道（菜脯蛋不含快到期食材被排除）', out.length, 3);
  // 三杯雞(basil0.3+garlic0.1=0.4) 與 滷豬肉(pork1.2+garlic0.1=1.3) 都 matchCount=2；
  // 滷豬肉風險量較大 → 排前
  check('第一名：滷豬肉（同命中數、風險量大）', out[0].recipeId, 'r-braise');
  check('第二名：三杯雞', out[1].recipeId, 'r-sanbei');
  check('第三名：塔香茄子（僅 1 命中）', out[2].recipeId, 'r-stirbasil');
  check('滷豬肉 matchCount=2', out[0].matchCount, 2);
  check('滷豬肉 totalAtRiskKg=1.3', out[0].totalAtRiskKg, 1.3);
}

// 同食材多批會彙整風險量
{
  const multi = [exp('basil', '九層塔', 0.3), exp('basil', '九層塔', 0.5)];
  const out = suggestUseItUpRecipes(multi, [recipe('r', '塔香', ['basil'])]);
  check('多批彙整 atRiskKg=0.8', out[0].matched[0].atRiskKg, 0.8);
  check('多批僅列一次', out[0].matched.length, 1);
}

// maxSuggestions 上限
{
  const many = Array.from({ length: 10 }, (_, i) => recipe(`r${i}`, `菜${i}`, ['basil']));
  const out = suggestUseItUpRecipes([exp('basil', '九層塔', 1)], many, 3);
  check('maxSuggestions=3 生效', out.length, 3);
}

// 無快到期 / 無配方 → 空
{
  check('無快到期 → 空', suggestUseItUpRecipes([], recipes), []);
  check('無配方 → 空', suggestUseItUpRecipes(expiring, []), []);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — useItUpPlanner verified');
