/**
 * menuBalancePlanner.test.ts — Feature 089 菜單平衡檢查。
 * Run with: npx tsx src/services/__tests__/menuBalancePlanner.test.ts
 */

import { summarizeMenuBalance } from '../menuBalancePlanner';
import type { DishCategory } from '../types';

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

const C = (x: DishCategory) => x;

console.log('\n── menuBalancePlanner: summarizeMenuBalance ───────────────────────────');

// 均衡菜單：主菜1 蔬菜2 湯1 → 無警示
{
  const b = summarizeMenuBalance([C('主菜'), C('蔬菜'), C('蔬菜'), C('湯')]);
  check('主菜=1', b.counts.主菜, 1);
  check('蔬菜=2', b.counts.蔬菜, 2);
  check('total=4', b.total, 4);
  check('均衡 → 無警示', b.warnings, []);
}

// 缺蔬菜
{
  const b = summarizeMenuBalance([C('主菜'), C('主食')]);
  check('缺蔬菜警示', b.warnings.includes('沒有蔬菜，建議加一道'), true);
}

// 缺主菜
{
  const b = summarizeMenuBalance([C('蔬菜'), C('湯')]);
  check('缺主菜警示', b.warnings.includes('沒有主菜'), true);
}

// 主菜偏多
{
  const b = summarizeMenuBalance([C('主菜'), C('主菜'), C('主菜'), C('蔬菜')]);
  check('主菜偏多警示', b.warnings.some((w) => w.includes('主菜偏多')), true);
}

// 未分類提示
{
  const b = summarizeMenuBalance([C('主菜'), C('蔬菜'), null, undefined]);
  check('未分類計數=2', b.uncategorized, 2);
  check('未分類提示', b.warnings.some((w) => w.includes('未分類')), true);
}

// 小菜單（<2）不觸發缺主菜/缺蔬菜噪音
{
  const b = summarizeMenuBalance([C('主食')]);
  check('單道不提示缺菜', b.warnings.filter((w) => w.includes('沒有')).length, 0);
}

// 空菜單
{
  const b = summarizeMenuBalance([]);
  check('空菜單 total=0', b.total, 0);
  check('空菜單無警示', b.warnings, []);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — menuBalancePlanner verified');
