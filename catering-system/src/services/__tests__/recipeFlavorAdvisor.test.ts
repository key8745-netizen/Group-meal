/**
 * recipeFlavorAdvisor.test.ts — Feature 075 配方級風味/技法聚合建議。
 * Run with: npx tsx src/services/__tests__/recipeFlavorAdvisor.test.ts
 */

import { adviseRecipeFlavors } from '../recipeFlavorAdvisor';

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

console.log('\n── recipeFlavorAdvisor: adviseRecipeFlavors ───────────────────────────');

// 番茄 + 大蒜：兩者都推薦「羅勒」→ 共識 count = 2，排在最前
{
  const advice = adviseRecipeFlavors(['番茄', '大蒜']);
  const basil = advice.suggestions.find((s) => s.name === '羅勒');
  check('番茄+大蒜 → 建議含羅勒', !!basil, true);
  check('番茄+大蒜 → 羅勒共識 count=2', basil?.count, 2);
  check('番茄+大蒜 → 羅勒來源含番茄與大蒜', basil?.from.sort(), ['大蒜', '番茄']);
}

// 排除已在配方中的食材：番茄/大蒜互為對方的 pairsWith，不應出現在建議
{
  const advice = adviseRecipeFlavors(['番茄', '大蒜']);
  const names = advice.suggestions.map((s) => s.name);
  check('建議不含配方已有的番茄', names.includes('番茄'), false);
  check('建議不含配方已有的大蒜', names.includes('大蒜'), false);
}

// 排序：count 由大到小
{
  const advice = adviseRecipeFlavors(['番茄', '大蒜']);
  const counts = advice.suggestions.map((s) => s.count);
  const sorted = [...counts].sort((a, b) => b - a);
  check('建議依 count 由大到小', counts, sorted);
}

// 技法聚合：大蒜有技法 → techniques 內含名稱含「大蒜」的提醒
{
  const advice = adviseRecipeFlavors(['番茄', '大蒜']);
  const hasGarlicTip = advice.techniques.some((t) => t.name.includes('大蒜'));
  check('技法提醒含大蒜', hasGarlicTip, true);
}

// 三杯風格：豬五花+大蒜+九層塔 — 建議不得等於任一配方食材（雙向子字串排除）
{
  const advice = adviseRecipeFlavors(['豬五花', '大蒜', '九層塔']);
  const recipe = ['豬五花', '大蒜', '九層塔'];
  const overlap = advice.suggestions.filter((s) =>
    recipe.some((r) => r.includes(s.name) || s.name.includes(r)),
  );
  check('三杯：建議無配方重疊', overlap.length, 0);
  check('三杯：豬五花技法（強韌慢燉）入列', advice.techniques.some((t) => t.proteinType === '強韌慢燉'), true);
}

// maxSuggestions 上限
{
  const advice = adviseRecipeFlavors(['番茄', '大蒜', '生薑'], 3);
  check('maxSuggestions=3 生效', advice.suggestions.length <= 3, true);
}

// 空輸入 / 空白
{
  const advice = adviseRecipeFlavors([]);
  check('空輸入: techniques 空', advice.techniques, []);
  check('空輸入: suggestions 空', advice.suggestions, []);
  const advice2 = adviseRecipeFlavors(['', '  ', '這不是食材xyz']);
  check('全無效輸入: suggestions 空', advice2.suggestions, []);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — recipeFlavorAdvisor verified');
