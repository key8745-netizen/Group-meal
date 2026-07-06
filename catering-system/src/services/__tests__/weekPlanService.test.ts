/**
 * weekPlanService.test.ts
 *
 * Validation tests for Feature 040: 週間規劃與多日彙總採購.
 * Covers `mondayOf`, `weekDates`, `buildWeekOverview`, `aggregateRangeDemand`,
 * and `rangeDemandToCsv` — all pure, no Firestore.
 * Run with: npx tsx src/services/__tests__/weekPlanService.test.ts
 */

import {
  mondayOf,
  weekDates,
  buildWeekOverview,
  aggregateRangeDemand,
  rangeDemandToCsv,
} from '../weekPlanService';
import type {
  RecipeMenu,
  PrepPlan,
  PrepPlanItem,
  ProductionWorkflowPlan,
  ProductionWorkflowTask,
  IngredientMaster,
  MarketPriceSnapshot,
} from '../types';

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

// ── Fixtures ─────────────────────────────────────────────────────────────

function menu(overrides: Partial<RecipeMenu> = {}): RecipeMenu {
  return {
    id: 'menu_1',
    name: '週一午餐',
    date: '2026-07-06',
    mealType: '午餐',
    menuRecipes: [],
    isActive: true,
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as RecipeMenu;
}

function prepPlanItem(overrides: Partial<PrepPlanItem> = {}): PrepPlanItem {
  return {
    ingredientId: 'ing_1',
    ingredientNameSnapshot: '高麗菜',
    requiredBaseQuantity: 1000,
    baseUnit: 'g',
    recipeContributions: [],
    ...overrides,
  } as PrepPlanItem;
}

function prepPlan(overrides: Partial<PrepPlan> = {}): PrepPlan {
  return {
    id: 'prep_1',
    name: '週一午餐備料',
    sourceRecipeMenuId: 'menu_1',
    sourceRecipeMenuNameSnapshot: '週一午餐',
    date: '2026-07-06',
    prepItems: [prepPlanItem()],
    isActive: true,
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as PrepPlan;
}

function task(overrides: Partial<ProductionWorkflowTask> = {}): ProductionWorkflowTask {
  return {
    id: 't1',
    taskStatus: 'active',
    taskName: '洗菜',
    processType: 'wash',
    equipmentType: 'sink',
    estimatedMinutes: 10,
    staffCount: 1,
    sequence: 1,
    dependsOnTaskIds: [],
    canRunInParallel: true,
    ...overrides,
  } as ProductionWorkflowTask;
}

function workflowPlan(overrides: Partial<ProductionWorkflowPlan> = {}): ProductionWorkflowPlan {
  return {
    id: 'wfplan_1',
    sourcePrepPlanId: 'prep_1',
    sourcePrepPlanNameSnapshot: '週一午餐備料',
    planName: '週一製程規劃',
    serviceDate: '2026-07-06',
    status: 'draft',
    isActive: true,
    tasks: [task()],
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as ProductionWorkflowPlan;
}

function ingredient(overrides: Partial<IngredientMaster> = {}): IngredientMaster {
  return {
    id: 'ing_1',
    name: '高麗菜',
    normalizedName: '高麗菜',
    category: '蔬菜',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 20,
    defaultPriceUnit: 'kg',
    isActive: true,
    ...overrides,
  } as IngredientMaster;
}

function snapshot(overrides: Partial<MarketPriceSnapshot> = {}): MarketPriceSnapshot {
  return {
    id: '2026-07-06',
    date: '2026-07-06',
    rocDate: '115.07.06',
    entries: [],
    warnings: [],
    fetchedBy: 'u1',
    ...overrides,
  } as MarketPriceSnapshot;
}

// ── 1. mondayOf ────────────────────────────────────────────────────────────
{
  // 2026-07-06 is a Monday (per CLAUDE.md "current date").
  check('mondayOf: Monday is identity', mondayOf('2026-07-06'), '2026-07-06');
  // 2026-07-08 is a Wednesday (mid-week).
  check('mondayOf: mid-week (Wed) rolls back to Monday', mondayOf('2026-07-08'), '2026-07-06');
  // 2026-07-12 is the Sunday of that same week.
  check('mondayOf: Sunday edge rolls back to Monday of same week', mondayOf('2026-07-12'), '2026-07-06');
  // 2026-07-13 is the next Monday.
  check('mondayOf: next Monday is a new week', mondayOf('2026-07-13'), '2026-07-13');
}

// ── 2. weekDates ─────────────────────────────────────────────────────────
{
  check('weekDates: 7 consecutive Mon..Sun dates', weekDates('2026-07-06'), [
    '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09',
    '2026-07-10', '2026-07-11', '2026-07-12',
  ]);
  // Month-boundary crossing.
  check('weekDates: crosses month boundary correctly', weekDates('2026-07-27'), [
    '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
    '2026-08-01', '2026-08-02',
  ]);
}

// ── 3. buildWeekOverview: linking heuristics ──────────────────────────────
{
  const overview = buildWeekOverview(
    '2026-07-06',
    [menu()],
    [prepPlan()],
    [workflowPlan()],
  );
  check('overview: 7 days returned', overview.length, 7);
  check('overview: day 1 weekdayLabel', overview[0].weekdayLabel, '週一');
  check('overview: day 7 weekdayLabel', overview[6].weekdayLabel, '週日');
  check('overview: Monday has the menu (matched by date)', overview[0].menuNames, ['週一午餐']);
  checkTrue('overview: Monday hasPrepPlan (matched by date)', overview[0].hasPrepPlan);
  checkTrue('overview: Monday hasWorkflowTasks (via sourcePrepPlanId)', overview[0].hasWorkflowTasks);
  check('overview: Tuesday has no menu', overview[1].menuNames, []);
  checkTrue('overview: Tuesday has no prep plan', !overview[1].hasPrepPlan);
}

// ── 3b. prep plan linked via sourceRecipeMenuId (different date than menu's day key) ──
{
  // Prep plan's own `date` field points elsewhere, but it references a
  // Monday menu via sourceRecipeMenuId — per the spec this still links it
  // to the menu's day.
  const overview = buildWeekOverview(
    '2026-07-06',
    [menu()],
    [prepPlan({ date: '2026-07-09', sourceRecipeMenuId: 'menu_1' })],
    [],
  );
  checkTrue('overview: prep plan linked via sourceRecipeMenuId to Monday', overview[0].hasPrepPlan);
}

// ── 3c. workflow plan linked via serviceDate only (no matching prep plan) ──
{
  const overview = buildWeekOverview(
    '2026-07-06',
    [],
    [],
    [workflowPlan({ sourcePrepPlanId: 'unrelated_prep', serviceDate: '2026-07-08' })],
  );
  checkTrue('overview: workflow plan linked via serviceDate (Wed)', overview[2].hasWorkflowTasks);
  checkTrue('overview: workflow plan not linked elsewhere', !overview[0].hasWorkflowTasks);
}

// ── 3d. inactive records excluded ──────────────────────────────────────────
{
  const overview = buildWeekOverview(
    '2026-07-06',
    [menu({ isActive: false })],
    [prepPlan({ isActive: false })],
    [workflowPlan({ isActive: false })],
  );
  check('overview: inactive menu excluded', overview[0].menuNames, []);
  checkTrue('overview: inactive prep plan excluded', !overview[0].hasPrepPlan);
  checkTrue('overview: inactive workflow plan excluded', !overview[0].hasWorkflowTasks);
}

// ── 3e. workflow plan with zero active tasks does not count ───────────────
{
  const overview = buildWeekOverview(
    '2026-07-06',
    [],
    [prepPlan()],
    [workflowPlan({ tasks: [task({ taskStatus: 'archived' })] })],
  );
  checkTrue('overview: workflow plan with only archived tasks does not count', !overview[0].hasWorkflowTasks);
}

// ── 4. aggregateRangeDemand ────────────────────────────────────────────────
{
  const plans = [
    prepPlan({ id: 'prep_mon', date: '2026-07-06', name: '週一備料', prepItems: [
      prepPlanItem({ ingredientId: 'ing_1', ingredientNameSnapshot: '高麗菜', requiredBaseQuantity: 1000, baseUnit: 'g' }),
    ] }),
    prepPlan({ id: 'prep_wed', date: '2026-07-08', name: '週三備料', prepItems: [
      prepPlanItem({ ingredientId: 'ing_1', ingredientNameSnapshot: '高麗菜', requiredBaseQuantity: 500, baseUnit: 'g' }),
      prepPlanItem({ ingredientId: 'ing_2', ingredientNameSnapshot: '不明食材', requiredBaseQuantity: 200, baseUnit: 'g' }),
    ] }),
    // Out of range — must be excluded.
    prepPlan({ id: 'prep_next_week', date: '2026-07-13', name: '下週備料', prepItems: [
      prepPlanItem({ ingredientId: 'ing_1', ingredientNameSnapshot: '高麗菜', requiredBaseQuantity: 9999, baseUnit: 'g' }),
    ] }),
    // Inactive — must be excluded.
    prepPlan({ id: 'prep_inactive', date: '2026-07-07', name: '停用備料', isActive: false, prepItems: [
      prepPlanItem({ ingredientId: 'ing_1', ingredientNameSnapshot: '高麗菜', requiredBaseQuantity: 9999, baseUnit: 'g' }),
    ] }),
  ];
  const ingredients = [ingredient()]; // only ing_1 has a master record; ing_2 is missing
  const summary = aggregateRangeDemand('2026-07-06', '2026-07-12', plans, ingredients, null);

  check('range: planCount excludes out-of-range and inactive plans', summary.planCount, 2);
  check('range: startDate/endDate echoed', [summary.startDate, summary.endDate], ['2026-07-06', '2026-07-12']);
  check('range: 2 aggregated lines (ing_1, ing_2)', summary.lines.length, 2);

  const ing1Line = summary.lines.find((l) => l.ingredientId === 'ing_1')!;
  check('range: ing_1 totalBaseQuantity summed across plans (1000+500)', ing1Line.totalBaseQuantity, 1500);
  check('range: ing_1 sourcePlanCount', ing1Line.sourcePlanCount, 2);
  check('range: ing_1 sourcePlanNames dedup', ing1Line.sourcePlanNames, ['週一備料', '週三備料']);
  check('range: ing_1 priceSource default (defaultPrice 20/kg, baseUnit g)', ing1Line.priceSource, 'default');
  check('range: ing_1 pricePerBaseUnit (20/kg -> 0.02/g)', ing1Line.pricePerBaseUnit, 0.02);
  check('range: ing_1 estimatedCost (1500g * 0.02)', ing1Line.estimatedCost, 30);

  const ing2Line = summary.lines.find((l) => l.ingredientId === 'ing_2')!;
  check('range: ing_2 (missing ingredient master) priceSource none', ing2Line.priceSource, 'none');
  check('range: ing_2 pricePerBaseUnit null', ing2Line.pricePerBaseUnit, null);
  check('range: ing_2 estimatedCost null (unpriced)', ing2Line.estimatedCost, null);

  check('range: sort order — priced line first, unpriced last', summary.lines.map((l) => l.ingredientId), ['ing_1', 'ing_2']);
  check('range: totalEstimatedCost sums only priced lines', summary.totalEstimatedCost, 30);
  check('range: unpricedLineCount', summary.unpricedLineCount, 1);
}

// ── 4b. boundary dates included (inclusive range) ─────────────────────────
{
  const plans = [
    prepPlan({ id: 'prep_start', date: '2026-07-06', name: '起始日備料' }),
    prepPlan({ id: 'prep_end', date: '2026-07-12', name: '結束日備料' }),
  ];
  const summary = aggregateRangeDemand('2026-07-06', '2026-07-12', plans, [ingredient()], null);
  check('range: both boundary dates included', summary.planCount, 2);
}

// ── 4c. sourcePlanNames capped at 5 ────────────────────────────────────────
{
  const plans = Array.from({ length: 7 }, (_, i) =>
    prepPlan({ id: `prep_${i}`, date: '2026-07-06', name: `備料${i}`, prepItems: [prepPlanItem()] }));
  const summary = aggregateRangeDemand('2026-07-06', '2026-07-12', plans, [ingredient()], null);
  const line0 = summary.lines[0];
  check('range: sourcePlanNames capped at 5', line0.sourcePlanNames.length, 5);
  check('range: sourcePlanCount reflects true total (7)', line0.sourcePlanCount, 7);
}

// ── 4d. market price source takes precedence over default ─────────────────
{
  const marketIngredient = ingredient({ marketCropName: '高麗菜' });
  const marketSnapshot = snapshot({
    entries: [{ cropName: '高麗菜', avgPrice: 30, minPrice: 25, maxPrice: 35, totalQuantity: 100, marketCount: 2, sampleCropNames: ['高麗菜'] }],
  });
  const summary = aggregateRangeDemand(
    '2026-07-06', '2026-07-12',
    [prepPlan({ date: '2026-07-06' })],
    [marketIngredient],
    marketSnapshot,
  );
  check('range: priceSource resolves to market when snapshot has priced entry', summary.lines[0].priceSource, 'market');
  check('range: pricePerBaseUnit from market (30/kg -> 0.03/g)', summary.lines[0].pricePerBaseUnit, 0.03);
}

// ── 4e. empty range ─────────────────────────────────────────────────────
{
  const summary = aggregateRangeDemand('2026-07-06', '2026-07-12', [], [ingredient()], null);
  check('range: empty plans -> empty lines', summary.lines, []);
  check('range: empty plans -> totalEstimatedCost 0', summary.totalEstimatedCost, 0);
  check('range: empty plans -> unpricedLineCount 0', summary.unpricedLineCount, 0);
}

// ── 5. rangeDemandToCsv ────────────────────────────────────────────────────
{
  const summary = aggregateRangeDemand(
    '2026-07-06', '2026-07-12',
    [prepPlan({ date: '2026-07-06', name: '含,逗號"與引號' })],
    [ingredient()],
    null,
  );
  const csv = rangeDemandToCsv(summary);
  const lines = csv.split('\n');
  check('csv: header row', lines[0], '食材,總需求量,單位,預估單價,價格來源,預估金額,來源快照數');
  check('csv: 2 lines total (header + 1 data row)', lines.length, 2);
  checkTrue('csv: data row contains ingredient name', lines[1].includes('高麗菜'));
  checkTrue('csv: data row contains price source label', lines[1].includes('基準價'));

  // Escaping: a plan name with a comma and a quote must be quoted/escaped
  // when it leaks into sourcePlanNames-derived fields is N/A here (not a
  // CSV column), so verify escaping directly via a crafted ingredient name.
  const trickySummary = aggregateRangeDemand(
    '2026-07-06', '2026-07-12',
    [prepPlan({ date: '2026-07-06', prepItems: [
      prepPlanItem({ ingredientId: 'ing_tricky', ingredientNameSnapshot: '蔥,"特選"' }),
    ] })],
    [ingredient({ id: 'ing_tricky' })],
    null,
  );
  const trickyCsv = rangeDemandToCsv(trickySummary);
  const trickyDataRow = trickyCsv.split('\n')[1];
  checkTrue(
    'csv: field with comma+quote is wrapped in quotes with doubled inner quotes',
    trickyDataRow.startsWith('"蔥,""特選"""'),
  );
}

// ── 6. Determinism ─────────────────────────────────────────────────────────
{
  const a = buildWeekOverview('2026-07-06', [menu()], [prepPlan()], [workflowPlan()]);
  const b = buildWeekOverview('2026-07-06', [menu()], [prepPlan()], [workflowPlan()]);
  check('determinism: buildWeekOverview identical for identical input', a, b);

  const plans = [prepPlan({ date: '2026-07-06' })];
  const ings = [ingredient()];
  const s1 = aggregateRangeDemand('2026-07-06', '2026-07-12', plans, ings, null);
  const s2 = aggregateRangeDemand('2026-07-06', '2026-07-12', plans, ings, null);
  check('determinism: aggregateRangeDemand identical for identical input', s1, s2);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
