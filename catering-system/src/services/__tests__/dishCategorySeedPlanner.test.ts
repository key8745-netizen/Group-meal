/**
 * dishCategorySeedPlanner.test.ts — Feature 091 菜名 → 菜色類別種子。
 * Run with: npx tsx src/services/__tests__/dishCategorySeedPlanner.test.ts
 */

import { guessDishCategory, planDishCategorySeed } from '../dishCategorySeedPlanner';

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

console.log('\n── dishCategorySeedPlanner ────────────────────────────────────────────');

// 基本命中
check('三杯雞 → 主菜', guessDishCategory('三杯雞'), '主菜');
check('滷排骨 → 主菜', guessDishCategory('滷排骨'), '主菜');
check('炒高麗菜 → 蔬菜', guessDishCategory('炒高麗菜'), '蔬菜');
check('紫菜蛋花湯 → 湯', guessDishCategory('紫菜蛋花湯'), '湯');
check('雞肉飯 → 主食（主食勝主菜）', guessDishCategory('雞肉飯'), '主食');
check('滷肉飯 → 主食', guessDishCategory('滷肉飯'), '主食');
check('冬瓜湯 → 湯（湯勝蔬菜）', guessDishCategory('冬瓜湯'), '湯');
check('咖哩雞飯 → 主食', guessDishCategory('咖哩雞飯'), '主食');
check('炒麵 → 主食', guessDishCategory('炒麵'), '主食');
check('番茄炒蛋 → 蔬菜（番茄）', guessDishCategory('番茄炒蛋'), '蔬菜');

// 無命中
check('滿漢全席 → null', guessDishCategory('滿漢全席'), null);
check('空字串 → null', guessDishCategory(''), null);

// planDishCategorySeed：merge-only
{
  const r = planDishCategorySeed({ id: 'x', name: '三杯雞' });
  check('willSet', r.action, 'willSet');
  check('willSet category', r.category, '主菜');
}
{
  const r = planDishCategorySeed({ id: 'x', name: '三杯雞', category: '其他' });
  check('已分類 → alreadySet', r.action, 'alreadySet');
  check('已分類保留原值', r.category, '其他');
}
{
  const r = planDishCategorySeed({ id: 'x', name: '未知料理' });
  check('無命中 → noMatch', r.action, 'noMatch');
  check('無命中無 category', r.category, undefined);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — dishCategorySeedPlanner verified');
