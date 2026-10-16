/**
 * craftingBenchPlanner.test.ts — 今日開工灶台格子分配。
 * Run with: npx tsx src/services/__tests__/craftingBenchPlanner.test.ts
 */

import { assignBenchSlots } from '../craftingBenchPlanner';
import { DEFAULT_MENU_QUOTAS } from '../balancedMenuPlanner';
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

const cats = (entries: [string, DishCategory | undefined][]) => new Map(entries);

console.log('\n── craftingBenchPlanner: assignBenchSlots ─────────────────────────────');

// 預設配額 1主菜 1主食 2蔬菜 1湯 → 5 格，依類別填入
{
  const r = assignBenchSlots(
    ['v1', 'm1', 's1', 'r1', 'v2'],
    cats([['m1', '主菜'], ['r1', '主食'], ['v1', '蔬菜'], ['v2', '蔬菜'], ['s1', '湯']]),
    DEFAULT_MENU_QUOTAS,
  );
  check('5 格全填', r.filled, 5);
  check('格子順序跟配額走', r.slots.map((s) => s.recipeId), ['m1', 'r1', 'v1', 'v2', 's1']);
  check('沒有加菜', r.extras, []);
}

// 同類別超出配額 → 加菜；格子保留先選的
{
  const r = assignBenchSlots(
    ['m1', 'm2'],
    cats([['m1', '主菜'], ['m2', '主菜']]),
    DEFAULT_MENU_QUOTAS,
  );
  check('第一道主菜進格', r.slots[0].recipeId, 'm1');
  check('第二道主菜進加菜', r.extras, ['m2']);
  check('只填 1 格', r.filled, 1);
}

// 未分類與「其他」都不在配額內 → 加菜
{
  const r = assignBenchSlots(['x1', 'x2'], cats([['x1', undefined], ['x2', '其他']]), DEFAULT_MENU_QUOTAS);
  check('未分類/其他進加菜', r.extras, ['x1', 'x2']);
  check('配額格全空', r.filled, 0);
}

// 配額為 0 的類別不產生格子
{
  const r = assignBenchSlots(
    ['s1'],
    cats([['s1', '湯']]),
    [{ category: '主菜', count: 1 }, { category: '湯', count: 0 }],
  );
  check('只有 1 格', r.slots.length, 1);
  check('湯進加菜', r.extras, ['s1']);
}

// 空選取
{
  const r = assignBenchSlots([], new Map(), DEFAULT_MENU_QUOTAS);
  check('空選取 5 個空格', r.slots.every((s) => s.recipeId === null) && r.slots.length === 5, true);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — craftingBenchPlanner verified');
