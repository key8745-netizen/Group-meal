/**
 * prepCutSummaryPlanner.test.ts — Feature 103 刀工彙總 / 前處理提醒。
 * Run with: npx tsx src/services/__tests__/prepCutSummaryPlanner.test.ts
 */

import type { IngredientMaster, PrepPlan } from '../types';
import { resolveItemCut, summarizePrepCuts } from '../prepCutSummaryPlanner';

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

function prepItem(over: Partial<PrepPlan['prepItems'][number]> = {}): PrepPlan['prepItems'][number] {
  return {
    ingredientId: 'x', ingredientNameSnapshot: '食材', requiredBaseQuantity: 1000, baseUnit: 'g',
    recipeContributions: [], ...over,
  };
}
function plan(prepItems: PrepPlan['prepItems']): Pick<PrepPlan, 'prepItems'> {
  return { prepItems };
}
function ing(over: Partial<IngredientMaster>): Pick<IngredientMaster, 'defaultCutType' | 'prepNote'> {
  return { defaultCutType: over.defaultCutType, prepNote: over.prepNote };
}

console.log('\n── prepCutSummaryPlanner ──────────────────────────────────────────────');

// resolveItemCut 優先序
{
  check('配方唯一切法勝出', resolveItemCut(['julienne'], 'chunk'), 'julienne');
  check('配方無 → 用食材預設', resolveItemCut([undefined, undefined], 'chunk'), 'chunk');
  check('配方衝突 → null', resolveItemCut(['julienne', 'rollCut'], 'chunk'), null);
  check('全無 → null', resolveItemCut([undefined], undefined), null);
  check('none 視為無指定 → 食材預設', resolveItemCut(['none'], 'dice'), 'dice');
  check('食材預設 none → null', resolveItemCut([], 'none'), null);
}

// 分組 + 排序（section 在 julienne 之前；未指定最後）
{
  const items = [
    prepItem({ ingredientId: 'a', ingredientNameSnapshot: '高麗菜', recipeContributions: [{ recipeId: 'r', recipeNameSnapshot: 'm', sourceServings: 1, contributedBaseQuantity: 1000, cutType: 'section' }] }),
    prepItem({ ingredientId: 'b', ingredientNameSnapshot: '紅蘿蔔', recipeContributions: [{ recipeId: 'r', recipeNameSnapshot: 'm', sourceServings: 1, contributedBaseQuantity: 500, cutType: 'julienne' }] }),
    prepItem({ ingredientId: 'c', ingredientNameSnapshot: '洋蔥', recipeContributions: [] }), // 未指定
  ];
  const s = summarizePrepCuts(plan(items));
  check('三組', s.groups.map((g) => g.cutType), ['section', 'julienne', null]);
  check('切段組含高麗菜', s.groups[0].items.map((i) => i.name), ['高麗菜']);
  check('未指定組排最後且含洋蔥', s.groups[2].items.map((i) => i.name), ['洋蔥']);
  check('未指定標籤', s.groups[2].label, '未指定（依範本／現場）');
}

// 食材預設回落 + 同組彙整（多食材、名稱排序）
{
  const items = [
    prepItem({ ingredientId: 'b', ingredientNameSnapshot: '白蘿蔔', recipeContributions: [] }),
    prepItem({ ingredientId: 'a', ingredientNameSnapshot: '馬鈴薯', recipeContributions: [] }),
  ];
  const byId = new Map([
    ['a', ing({ defaultCutType: 'chunk' })],
    ['b', ing({ defaultCutType: 'chunk' })],
  ]);
  const s = summarizePrepCuts(plan(items), byId);
  check('都回落 chunk 同組', s.groups.map((g) => g.cutType), ['chunk']);
  check('組內依名稱排序', s.groups[0].items.map((i) => i.name), ['白蘿蔔', '馬鈴薯']);
}

// 前處理備註彙整（有 note 才列、依名稱排序）
{
  const items = [
    prepItem({ ingredientId: 'a', ingredientNameSnapshot: '番茄' }),
    prepItem({ ingredientId: 'b', ingredientNameSnapshot: '青椒' }),
    prepItem({ ingredientId: 'c', ingredientNameSnapshot: '洋蔥' }),
  ];
  const byId = new Map([
    ['a', ing({ prepNote: '去蒂頭' })],
    ['b', ing({ prepNote: '去籽、切頭去尾' })],
    ['c', ing({})], // 無 note
  ]);
  const s = summarizePrepCuts(plan(items), byId);
  check('只列有備註者（數量）', s.prepNotes.length, 2);
  check('含番茄與青椒（不依賴語系排序）', s.prepNotes.map((p) => p.name).slice().sort(), ['番茄', '青椒'].slice().sort());
  check('備註內容', s.prepNotes.find((p) => p.name === '青椒')?.note, '去籽、切頭去尾');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — prepCutSummaryPlanner verified');
