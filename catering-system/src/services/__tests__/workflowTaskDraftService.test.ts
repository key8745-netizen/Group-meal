/**
 * workflowTaskDraftService.test.ts
 *
 * Validation tests for Feature 036: 製程任務自動草稿.
 * Covers `generateTaskDraftsFromPrepPlan` (pure, end-to-end on small fixtures).
 * Run with: npx tsx src/services/__tests__/workflowTaskDraftService.test.ts
 */

import { generateTaskDraftsFromPrepPlan } from '../workflowTaskDraftService';
import type { IngredientMaster, PrepPlan, PrepPlanItem } from '../types';

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
    category: '蔬菜',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 0,
    defaultPriceUnit: 'kg',
    isActive: true,
    ...overrides,
  };
}

function prepItem(overrides: Partial<PrepPlanItem> = {}): PrepPlanItem {
  return {
    ingredientId: 'ing_default',
    ingredientNameSnapshot: '預設食材',
    requiredBaseQuantity: 1000,
    baseUnit: 'g',
    recipeContributions: [
      { recipeId: 'r1', recipeNameSnapshot: '配方一', sourceServings: 10, contributedBaseQuantity: 1000 },
    ],
    ...overrides,
  };
}

function plan(prepItems: PrepPlanItem[], overrides: Partial<PrepPlan> = {}): PrepPlan {
  return {
    id: 'plan_default',
    name: '預設備料快照',
    sourceRecipeMenuId: 'menu_default',
    sourceRecipeMenuNameSnapshot: '預設菜單',
    date: '2026-07-06',
    prepItems,
    isActive: true,
    createdBy: 'tester',
    updatedBy: 'tester',
    ...overrides,
  };
}

// ── (a) vegetable chain: wash → cut dependency ─────────────────────────────
{
  console.log('(a) vegetable chain');
  const veg = ingredient({ id: 'veg1', name: '高麗菜', category: '葉菜類' });
  const item = prepItem({ ingredientId: 'veg1', ingredientNameSnapshot: '高麗菜', requiredBaseQuantity: 2000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [veg], []);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  check('two prep steps generated', prepTasks.length, 2);
  check('step 1 is wash', prepTasks[0].processType, 'wash');
  check('step 2 is cut', prepTasks[1].processType, 'cut');
  check('cut depends on wash', prepTasks[1].dependsOnTaskIds, [prepTasks[0].id]);
  check('wash has no deps', prepTasks[0].dependsOnTaskIds, []);
  checkTrue('prep steps can run in parallel', prepTasks[0].canRunInParallel && prepTasks[1].canRunInParallel);
}

// ── (b) meat chain: cut → marinate ─────────────────────────────────────────
{
  console.log('(b) meat chain');
  const meat = ingredient({ id: 'meat1', name: '雞胸肉', category: '雞肉類' });
  const item = prepItem({ ingredientId: 'meat1', ingredientNameSnapshot: '雞胸肉', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [meat], []);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  check('two prep steps generated', prepTasks.length, 2);
  check('step 1 is cut', prepTasks[0].processType, 'cut');
  check('step 2 is marinate', prepTasks[1].processType, 'marinate');
  check('marinate depends on cut', prepTasks[1].dependsOnTaskIds, [prepTasks[0].id]);
}

// ── (c) dry-goods single step ───────────────────────────────────────────────
{
  console.log('(c) dry goods single step');
  const rice = ingredient({ id: 'rice1', name: '白米', category: '米糧乾貨' });
  const item = prepItem({ ingredientId: 'rice1', ingredientNameSnapshot: '白米', requiredBaseQuantity: 3000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [rice], []);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  check('single step generated', prepTasks.length, 1);
  check('step is portion', prepTasks[0].processType, 'portion');
}

// ── (d) unknown-category fallback + note ───────────────────────────────────
{
  console.log('(d) unknown category fallback');
  const mystery = ingredient({ id: 'mys1', name: '神秘食材', category: '其他' });
  const item = prepItem({ ingredientId: 'mys1', ingredientNameSnapshot: '神秘食材', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [mystery], []);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  check('falls back to wash → cut chain', prepTasks.map((t) => t.processType), ['wash', 'cut']);
  checkTrue('note mentions the ingredient name', result.generationNotes.some((n) => n.includes('神秘食材')));
  checkTrue('note mentions missing category', result.generationNotes.some((n) => n.includes('缺少可辨識類別')));
}

// ── (e) minutes scaling by kg + min clamp ──────────────────────────────────
{
  console.log('(e) minutes scaling + min clamp');
  const veg = ingredient({ id: 'veg2', name: '菠菜', category: '葉菜' });
  // 4kg → wash: 5 + 2*4 = 13; cut: 5 + 4*4 = 21
  const item = prepItem({ ingredientId: 'veg2', ingredientNameSnapshot: '菠菜', requiredBaseQuantity: 4000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [veg], []);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  check('wash minutes = 13', prepTasks[0].estimatedMinutes, 13);
  check('cut minutes = 21', prepTasks[1].estimatedMinutes, 21);

  // tiny quantity should still clamp to a minimum of 1 minute
  const tinyItem = prepItem({
    ingredientId: 'veg2', ingredientNameSnapshot: '菠菜', requiredBaseQuantity: 0,
    recipeContributions: [{ recipeId: 'r1', recipeNameSnapshot: '配方一', sourceServings: 1, contributedBaseQuantity: 0 }],
  });
  const tinyResult = generateTaskDraftsFromPrepPlan(plan([tinyItem]), [veg], []);
  const tinyPrep = tinyResult.tasks.filter((t) => t.processType !== 'cook');
  checkTrue('minutes clamped to >= 1', tinyPrep.every((t) => t.estimatedMinutes >= 1));
}

// ── (f) pcs handling + note ─────────────────────────────────────────────────
{
  console.log('(f) pcs handling');
  const egg = ingredient({ id: 'egg1', name: '雞蛋', category: '蛋類', baseUnit: 'pcs' });
  const item = prepItem({
    ingredientId: 'egg1', ingredientNameSnapshot: '雞蛋', requiredBaseQuantity: 50, baseUnit: 'pcs',
  });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [egg], []);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  // 蛋 category doesn't match any keyword list -> fallback wash/cut template, baseMinutes only (qty=0)
  check('wash minutes = baseMinutes only (5)', prepTasks[0].estimatedMinutes, 5);
  check('cut minutes = baseMinutes only (5)', prepTasks[1].estimatedMinutes, 5);
  checkTrue('note mentions pcs handling', result.generationNotes.some((n) => n.includes('個數（pcs）')));
}

// ── (g) cook task per recipe depends on last steps of all its ingredients ──
{
  console.log('(g) cook task dependencies');
  const veg = ingredient({ id: 'veg3', name: '青江菜', category: '葉菜' });
  const meat = ingredient({ id: 'meat2', name: '牛肉絲', category: '牛肉' });
  const items = [
    prepItem({
      ingredientId: 'veg3', ingredientNameSnapshot: '青江菜', requiredBaseQuantity: 1000,
      recipeContributions: [{ recipeId: 'r1', recipeNameSnapshot: '炒牛肉', sourceServings: 20, contributedBaseQuantity: 1000 }],
    }),
    prepItem({
      ingredientId: 'meat2', ingredientNameSnapshot: '牛肉絲', requiredBaseQuantity: 1000,
      recipeContributions: [{ recipeId: 'r1', recipeNameSnapshot: '炒牛肉', sourceServings: 20, contributedBaseQuantity: 1000 }],
    }),
  ];
  const result = generateTaskDraftsFromPrepPlan(plan(items), [veg, meat], []);
  const cookTasks = result.tasks.filter((t) => t.processType === 'cook');
  check('one cook task for the recipe', cookTasks.length, 1);
  check('cook task name', cookTasks[0].taskName, '烹調：炒牛肉');
  check('cook cannot run in parallel', cookTasks[0].canRunInParallel, false);
  const vegLast = result.tasks.filter((t) => t.ingredientId === 'veg3').slice(-1)[0].id;
  const meatLast = result.tasks.filter((t) => t.ingredientId === 'meat2').slice(-1)[0].id;
  checkTrue('depends on veg chain last step', cookTasks[0].dependsOnTaskIds.includes(vegLast));
  checkTrue('depends on meat chain last step', cookTasks[0].dependsOnTaskIds.includes(meatLast));
  check('exactly 2 dependencies', cookTasks[0].dependsOnTaskIds.length, 2);
  checkTrue(
    'note mentions cooking method must be verified',
    result.generationNotes.some((n) => n.includes('烹調方式／設備')),
  );
}

// ── (h) id collision avoidance with existingTaskIds ────────────────────────
{
  console.log('(h) id collision avoidance');
  const veg = ingredient({ id: 'veg4', name: '白蘿蔔', category: '蔬菜' });
  const item = prepItem({ ingredientId: 'veg4', ingredientNameSnapshot: '白蘿蔔', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [veg], ['draft-1', 'draft-2']);
  checkTrue('no generated id collides with existing ids', result.tasks.every((t) => !['draft-1', 'draft-2'].includes(t.id)));
  const ids = result.tasks.map((t) => t.id);
  check('ids are unique among themselves', new Set(ids).size, ids.length);
  check('first new id skips existing ones', result.tasks[0].id, 'draft-3');
}

// ── (i) determinism: same input twice → deep-equal output ──────────────────
{
  console.log('(i) determinism');
  const veg = ingredient({ id: 'veg5', name: '空心菜', category: '葉菜' });
  const meat = ingredient({ id: 'meat3', name: '豬肉片', category: '豬肉' });
  const items = [
    prepItem({
      ingredientId: 'veg5', ingredientNameSnapshot: '空心菜', requiredBaseQuantity: 1500,
      recipeContributions: [{ recipeId: 'r2', recipeNameSnapshot: '炒豬肉', sourceServings: 8, contributedBaseQuantity: 1500 }],
    }),
    prepItem({
      ingredientId: 'meat3', ingredientNameSnapshot: '豬肉片', requiredBaseQuantity: 800,
      recipeContributions: [{ recipeId: 'r2', recipeNameSnapshot: '炒豬肉', sourceServings: 8, contributedBaseQuantity: 800 }],
    }),
  ];
  const p = plan(items);
  const ings = [veg, meat];
  const r1 = generateTaskDraftsFromPrepPlan(p, ings, []);
  const r2 = generateTaskDraftsFromPrepPlan(p, ings, []);
  check('identical results across repeated runs', r1, r2);
}

// ── (j) sequence continuation after existing max ───────────────────────────
{
  console.log('(j) sequence continuation');
  const veg = ingredient({ id: 'veg6', name: '青花菜', category: '蔬菜' });
  const item = prepItem({ ingredientId: 'veg6', ingredientNameSnapshot: '青花菜', requiredBaseQuantity: 1000 });
  const existingTaskIds = ['t1', 't2', 't3']; // simulates 3 pre-existing tasks (sequence 1..3)
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [veg], existingTaskIds);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  check('first new task sequence continues after existing count', prepTasks[0].sequence, 4);
  check('second new task sequence', prepTasks[1].sequence, 5);
}

// ── (k) ingredient not found in masters → fallback + note ──────────────────
{
  console.log('(k) ingredient missing from masters');
  const item = prepItem({ ingredientId: 'ghost1', ingredientNameSnapshot: '幽靈食材', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [], []);
  const prepTasks = result.tasks.filter((t) => t.processType !== 'cook');
  check('falls back to wash → cut chain', prepTasks.map((t) => t.processType), ['wash', 'cut']);
  checkTrue('note mentions missing master data', result.generationNotes.some((n) => n.includes('找不到食材主檔資料')));
}

// ── (l) summary + closing notes always present ──────────────────────────────
{
  console.log('(l) summary line');
  const veg = ingredient({ id: 'veg7', name: '大白菜', category: '蔬菜' });
  const item = prepItem({
    ingredientId: 'veg7', ingredientNameSnapshot: '大白菜', requiredBaseQuantity: 1000,
    recipeContributions: [],
  });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [veg], []);
  check('first note is the summary line', result.generationNotes[0], '1 食材 → 2 任務');
  check('last note is the human-review reminder', result.generationNotes[result.generationNotes.length - 1], '自動產生僅為草稿，工時與製程請人工確認後儲存。');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
