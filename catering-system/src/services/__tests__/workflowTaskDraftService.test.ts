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

// ── (a) leafy chain: 挑揀 → 清洗 → 切段 dependency ─────────────────────────
{
  console.log('(a) leafy chain');
  const veg = ingredient({ id: 'veg1', name: '高麗菜', category: '葉菜類' });
  const item = prepItem({ ingredientId: 'veg1', ingredientNameSnapshot: '高麗菜', requiredBaseQuantity: 2000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [veg], []);
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  check('three prep steps generated', prepTasks.length, 3);
  check('chain is 挑揀(wash) → 清洗(wash) → 切段(cut)', prepTasks.map((t) => t.processType), ['wash', 'wash', 'cut']);
  check('step names carry 工序 labels', prepTasks.map((t) => t.taskName), [
    '高麗菜：挑揀摘除', '高麗菜：清洗瀝乾', '高麗菜：切段成型',
  ]);
  check('cut depends on 清洗', prepTasks[2].dependsOnTaskIds, [prepTasks[1].id]);
  check('清洗 depends on 挑揀', prepTasks[1].dependsOnTaskIds, [prepTasks[0].id]);
  check('挑揀 has no deps', prepTasks[0].dependsOnTaskIds, []);
  checkTrue('guidance written into notes', (prepTasks[1].notes ?? '').includes('脫水'));
  checkTrue('prep steps can run in parallel', prepTasks.every((t) => t.canRunInParallel));
}

// ── (b) meat chain: 分切修整 → 醃漬上漿 → 預熟處理 ─────────────────────────
{
  console.log('(b) meat chain');
  const meat = ingredient({ id: 'meat1', name: '雞胸肉', category: '雞肉類' });
  const item = prepItem({ ingredientId: 'meat1', ingredientNameSnapshot: '雞胸肉', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [meat], []);
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  check('three prep steps generated', prepTasks.length, 3);
  check('chain is cut → marinate → preCook', prepTasks.map((t) => t.processType), ['cut', 'marinate', 'preCook']);
  check('marinate depends on cut', prepTasks[1].dependsOnTaskIds, [prepTasks[0].id]);
  check('preCook depends on marinate', prepTasks[2].dependsOnTaskIds, [prepTasks[1].id]);
  checkTrue('marinate guidance mentions 上漿/打水', (prepTasks[1].notes ?? '').includes('上漿'));
  checkTrue('preCook guidance mentions 汆燙/過油', (prepTasks[2].notes ?? '').includes('過油'));
}

// ── (c) dry-goods: 泡發洗淨 → 分裝 ──────────────────────────────────────────
{
  console.log('(c) dry goods');
  const rice = ingredient({ id: 'rice1', name: '白米', category: '米糧乾貨' });
  const item = prepItem({ ingredientId: 'rice1', ingredientNameSnapshot: '白米', requiredBaseQuantity: 3000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [rice], []);
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  check('two steps generated', prepTasks.length, 2);
  check('steps are wash → portion', prepTasks.map((t) => t.processType), ['wash', 'portion']);
}

// ── (d) unknown-category fallback + note ───────────────────────────────────
{
  console.log('(d) unknown category fallback');
  const mystery = ingredient({ id: 'mys1', name: '神秘食材', category: '其他' });
  const item = prepItem({ ingredientId: 'mys1', ingredientNameSnapshot: '神秘食材', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [mystery], []);
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  check('falls back to leafy chain', prepTasks.map((t) => t.processType), ['wash', 'wash', 'cut']);
  checkTrue('note mentions the ingredient name', result.generationNotes.some((n) => n.includes('神秘食材')));
  checkTrue('note mentions missing category', result.generationNotes.some((n) => n.includes('缺少可辨識類別')));
}

// ── (e) minutes scaling by kg + min clamp ──────────────────────────────────
{
  console.log('(e) minutes scaling + min clamp');
  const veg = ingredient({ id: 'veg2', name: '菠菜', category: '葉菜' });
  // 4kg → 挑揀: 4+2*4=12; 清洗: 5+2*4=13; 切段: 4+3*4=16
  const item = prepItem({ ingredientId: 'veg2', ingredientNameSnapshot: '菠菜', requiredBaseQuantity: 4000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [veg], []);
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  check('挑揀 minutes = 12', prepTasks[0].estimatedMinutes, 12);
  check('清洗 minutes = 13', prepTasks[1].estimatedMinutes, 13);
  check('切段 minutes = 16', prepTasks[2].estimatedMinutes, 16);

  // tiny quantity should still clamp to a minimum of 1 minute
  const tinyItem = prepItem({
    ingredientId: 'veg2', ingredientNameSnapshot: '菠菜', requiredBaseQuantity: 0,
    recipeContributions: [{ recipeId: 'r1', recipeNameSnapshot: '配方一', sourceServings: 1, contributedBaseQuantity: 0 }],
  });
  const tinyResult = generateTaskDraftsFromPrepPlan(plan([tinyItem]), [veg], []);
  const tinyPrep = tinyResult.tasks.filter((t) => t.ingredientId);
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
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  // 蛋類 category doesn't match any keyword list -> fallback leafy template, baseMinutes only (qty=0)
  check('step minutes = baseMinutes only (4/5/4)', prepTasks.map((t) => t.estimatedMinutes), [4, 5, 4]);
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
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  check('first new task sequence continues after existing count', prepTasks[0].sequence, 4);
  check('second new task sequence', prepTasks[1].sequence, 5);
}

// ── (k) ingredient not found in masters → fallback + note ──────────────────
{
  console.log('(k) ingredient missing from masters');
  const item = prepItem({ ingredientId: 'ghost1', ingredientNameSnapshot: '幽靈食材', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [], []);
  const prepTasks = result.tasks.filter((t) => t.ingredientId);
  check('falls back to leafy chain', prepTasks.map((t) => t.processType), ['wash', 'wash', 'cut']);
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
  check('first note is the summary line', result.generationNotes[0], '1 食材 → 3 任務');
  check('last note is the human-review reminder', result.generationNotes[result.generationNotes.length - 1], '自動產生僅為草稿，工時與製程請人工確認後儲存。');
}

// ── (m) shared sauce-prep task added when recipes exist ─────────────────────
{
  console.log('(m) sauce-prep task');
  const veg = ingredient({ id: 'veg8', name: '青江菜', category: '葉菜類' });
  const withRecipe = prepItem({ ingredientId: 'veg8', ingredientNameSnapshot: '青江菜', requiredBaseQuantity: 1000 });
  const result = generateTaskDraftsFromPrepPlan(plan([withRecipe]), [veg], []);
  const sauce = result.tasks.filter((t) => t.taskName === '調味汁預混與芡水調配');
  check('exactly one sauce task', sauce.length, 1);
  check('sauce task is portion on prepTable by 廚師', [sauce[0].processType, sauce[0].equipmentType, sauce[0].staffRole], ['portion', 'prepTable', '廚師']);
  check('sauce task has no dependencies', sauce[0].dependsOnTaskIds, []);
  checkTrue('sauce guidance mentions 碗汁', (sauce[0].notes ?? '').includes('碗汁'));

  // No recipes (empty contributions) → no sauce task, no cook task.
  const noRecipe = prepItem({
    ingredientId: 'veg8', ingredientNameSnapshot: '青江菜', requiredBaseQuantity: 1000,
    recipeContributions: [],
  });
  const result2 = generateTaskDraftsFromPrepPlan(plan([noRecipe]), [veg], []);
  check('no sauce task without recipes', result2.tasks.filter((t) => t.taskName === '調味汁預混與芡水調配').length, 0);
}

// ── (n) category-specific chains (辛香/水產/加工/根莖) ──────────────────────
{
  console.log('(n) category-specific chains');
  const cases: [string, string, string[]][] = [
    ['辛香類', '青蔥', ['wash', 'cut']],
    ['水產類', '鯛魚片', ['cut', 'marinate']],
    ['加工食品類', '貢丸', ['portion']],
    ['根莖類', '胡蘿蔔', ['peel', 'cut']],
    ['蛋豆製品', '板豆腐', ['cut']],
    ['菇蕈類', '生香菇', ['wash', 'cut']],
  ];
  for (const [category, name, expected] of cases) {
    const ing = ingredient({ id: `ing_${category}`, name, category });
    const item = prepItem({ ingredientId: `ing_${category}`, ingredientNameSnapshot: name, recipeContributions: [] });
    const result = generateTaskDraftsFromPrepPlan(plan([item]), [ing], []);
    check(`${category} chain`, result.tasks.filter((t) => t.ingredientId).map((t) => t.processType), expected);
  }
}

// ── (o) Feature 100: 配方指定切法覆蓋類別範本刀工 ───────────────────────────
{
  console.log('(o) recipe cutType overrides template');
  const carrot = ingredient({ id: 'car1', name: '胡蘿蔔', category: '根莖類' });
  // 根莖範本預設 rollCut（滾刀塊）；配方指定 julienne（切絲）應覆蓋。
  const item = prepItem({
    ingredientId: 'car1', ingredientNameSnapshot: '胡蘿蔔', requiredBaseQuantity: 1000,
    recipeContributions: [
      { recipeId: 'r1', recipeNameSnapshot: '青椒肉絲', sourceServings: 10, contributedBaseQuantity: 1000, cutType: 'julienne' },
    ],
  });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [carrot], []);
  const cut = result.tasks.filter((t) => t.ingredientId && t.processType === 'cut')[0];
  check('cut step overridden to julienne', cut.cutType, 'julienne');
  check('cut task name reflects 切絲', cut.taskName, '胡蘿蔔：切割（切絲）');
  checkTrue('cut guidance marks 配方指定切法', (cut.notes ?? '').includes('依配方指定切法'));
  // peel 步驟仍在、未被影響
  check('chain still peel → cut', result.tasks.filter((t) => t.ingredientId).map((t) => t.processType), ['peel', 'cut']);
}

// ── (p) Feature 100: 同食材跨菜切法不同 → 維持預設 + 提示人工分切 ────────────
{
  console.log('(p) conflicting cutTypes keep template + note');
  const carrot = ingredient({ id: 'car2', name: '白蘿蔔', category: '根莖類' });
  const item = prepItem({
    ingredientId: 'car2', ingredientNameSnapshot: '白蘿蔔', requiredBaseQuantity: 2000,
    recipeContributions: [
      { recipeId: 'r1', recipeNameSnapshot: '蘿蔔絲', sourceServings: 10, contributedBaseQuantity: 1000, cutType: 'julienne' },
      { recipeId: 'r2', recipeNameSnapshot: '燉蘿蔔', sourceServings: 10, contributedBaseQuantity: 1000, cutType: 'rollCut' },
    ],
  });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [carrot], []);
  const cut = result.tasks.filter((t) => t.ingredientId && t.processType === 'cut')[0];
  check('conflicting cuts keep template default (rollCut)', cut.cutType, 'rollCut');
  checkTrue('note flags 跨菜不同切法', result.generationNotes.some((n) => n.includes('跨菜有不同指定切法')));
}

// ── (q) Feature 101: 食材預設切法在配方未指定時生效 ─────────────────────────
{
  console.log('(q) ingredient defaultCutType fallback');
  const potato = ingredient({ id: 'pot1', name: '馬鈴薯', category: '根莖類', defaultCutType: 'chunk' });
  // 配方未指定切法（無 cutType）→ 應回落食材預設 chunk（切塊），覆蓋範本 rollCut。
  const item = prepItem({
    ingredientId: 'pot1', ingredientNameSnapshot: '馬鈴薯', requiredBaseQuantity: 1000,
    recipeContributions: [{ recipeId: 'r1', recipeNameSnapshot: '咖哩', sourceServings: 10, contributedBaseQuantity: 1000 }],
  });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [potato], []);
  const cut = result.tasks.filter((t) => t.ingredientId && t.processType === 'cut')[0];
  check('cut uses ingredient default chunk', cut.cutType, 'chunk');
  check('cut name reflects 切塊', cut.taskName, '馬鈴薯：切割（切塊）');
  checkTrue('guidance marks 食材預設切法', (cut.notes ?? '').includes('依食材預設切法'));
}

// ── (r) Feature 101: 配方指定切法優先於食材預設 ─────────────────────────────
{
  console.log('(r) recipe cutType wins over ingredient default');
  const potato = ingredient({ id: 'pot2', name: '馬鈴薯', category: '根莖類', defaultCutType: 'chunk' });
  const item = prepItem({
    ingredientId: 'pot2', ingredientNameSnapshot: '馬鈴薯', requiredBaseQuantity: 1000,
    recipeContributions: [{ recipeId: 'r1', recipeNameSnapshot: '馬鈴薯絲', sourceServings: 10, contributedBaseQuantity: 1000, cutType: 'julienne' }],
  });
  const result = generateTaskDraftsFromPrepPlan(plan([item]), [potato], []);
  const cut = result.tasks.filter((t) => t.ingredientId && t.processType === 'cut')[0];
  check('recipe julienne wins over ingredient chunk', cut.cutType, 'julienne');
  checkTrue('guidance marks 配方指定切法', (cut.notes ?? '').includes('依配方指定切法'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
