/**
 * dailyOpsService.test.ts
 *
 * Validation tests for Feature 038: 每日工作總覽 (Daily Ops Cockpit).
 * Covers `buildDailyOpsOverview` only — pure, no Firestore.
 * Run with: npx tsx src/services/__tests__/dailyOpsService.test.ts
 */

import { buildDailyOpsOverview, type OpsStepKey, type OpsStepStatus } from '../dailyOpsService';
import type {
  RecipeMenu,
  PrepPlan,
  PurchaseDemandDraft,
  ProductionWorkflowPlan,
  ProductionWorkflowTask,
  ProductionScheduleSuggestion,
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

function statusOf(steps: { key: OpsStepKey; status: OpsStepStatus }[], key: OpsStepKey): OpsStepStatus {
  return steps.find((s) => s.key === key)!.status;
}

// ── Fixtures ─────────────────────────────────────────────────────────────

const DATE = '2026-07-06';

function menu(overrides: Partial<RecipeMenu> = {}): RecipeMenu {
  return {
    id: 'menu_1',
    name: '週一午餐',
    date: DATE,
    mealType: '午餐',
    menuRecipes: [],
    isActive: true,
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as RecipeMenu;
}

function prepPlan(overrides: Partial<PrepPlan> = {}): PrepPlan {
  return {
    id: 'prep_1',
    name: '週一午餐備料',
    sourceRecipeMenuId: 'menu_1',
    sourceRecipeMenuNameSnapshot: '週一午餐',
    date: DATE,
    prepItems: [],
    isActive: true,
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as PrepPlan;
}

function draft(overrides: Partial<PurchaseDemandDraft> = {}): PurchaseDemandDraft {
  return {
    id: 'draft_1',
    draftName: '週一採購草稿',
    sourcePrepPlanId: 'prep_1',
    sourcePrepPlanNameSnapshot: '週一午餐備料',
    status: 'draft',
    items: [],
    isActive: true,
    workflowStatus: 'draft',
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as PurchaseDemandDraft;
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
    id: 'plan_1',
    sourcePrepPlanId: 'prep_1',
    sourcePrepPlanNameSnapshot: '週一午餐備料',
    planName: '週一製程規劃',
    serviceDate: DATE,
    status: 'draft',
    isActive: true,
    tasks: [task()],
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as ProductionWorkflowPlan;
}

function suggestion(overrides: Partial<ProductionScheduleSuggestion> = {}): ProductionScheduleSuggestion {
  return {
    id: 'sug_1',
    sourceProductionWorkflowPlanId: 'plan_1',
    sourcePlanNameSnapshot: '週一製程規劃',
    targetServiceDateTime: null as unknown as ProductionScheduleSuggestion['targetServiceDateTime'],
    capacityWindowMinutes: 480,
    bufferMinutes: 30,
    availableStaff: [],
    availableEquipment: [],
    scheduledTasks: [],
    makespanMinutes: 45,
    scheduleStatus: 'fits',
    unschedulableTaskIds: [],
    staffUtilization: {},
    equipmentUtilization: {},
    workStartSuggestion: '2026-07-06T05:00:00.000Z',
    createdBy: 'u1',
    ...overrides,
  } as ProductionScheduleSuggestion;
}

function snapshot(overrides: Partial<MarketPriceSnapshot> = {}): MarketPriceSnapshot {
  return {
    id: DATE,
    date: DATE,
    rocDate: '115.07.06',
    entries: [
      { cropName: '高麗菜', avgPrice: 20, minPrice: 15, maxPrice: 25, totalQuantity: 100, marketCount: 3, sampleCropNames: ['高麗菜'] },
    ],
    warnings: [],
    fetchedBy: 'u1',
    ...overrides,
  } as MarketPriceSnapshot;
}

function emptyData() {
  return {
    menus: [] as RecipeMenu[],
    prepPlans: [] as PrepPlan[],
    drafts: [] as PurchaseDemandDraft[],
    workflowPlans: [] as ProductionWorkflowPlan[],
    scheduleSuggestions: [] as ProductionScheduleSuggestion[],
    marketSnapshot: null as MarketPriceSnapshot | null,
  };
}

// ── 1. Full chain done ────────────────────────────────────────────────────
{
  const overview = buildDailyOpsOverview(DATE, {
    ...emptyData(),
    menus: [menu()],
    prepPlans: [prepPlan()],
    drafts: [draft()],
    workflowPlans: [workflowPlan()],
    scheduleSuggestions: [suggestion()],
    marketSnapshot: snapshot(),
  });
  check('full chain: date echoed', overview.date, DATE);
  check('full chain: menu done', statusOf(overview.steps, 'menu'), 'done');
  check('full chain: prepPlan done', statusOf(overview.steps, 'prepPlan'), 'done');
  check('full chain: purchaseDraft done', statusOf(overview.steps, 'purchaseDraft'), 'done');
  check('full chain: workflowPlan done', statusOf(overview.steps, 'workflowPlan'), 'done');
  check('full chain: scheduleSuggestion done', statusOf(overview.steps, 'scheduleSuggestion'), 'done');
  check('full chain: marketPrice done', statusOf(overview.steps, 'marketPrice'), 'done');
  checkTrue(
    'full chain: no nextActionHint on done steps',
    overview.steps.every((s) => s.status !== 'done' || s.nextActionHint === null),
  );
  // Feature 069: summary — menu() has no dishes; one active 10-min task
  check('full chain: summary laborMinutes 10', overview.summary.laborMinutes, 10);
  check('full chain: summary activeTaskCount 1', overview.summary.activeTaskCount, 1);
  check('full chain: summary dishCount 0', overview.summary.dishCount, 0);
}

// ── 1b. Summary aggregates dishes/headcount/labor ─────────────────────────
{
  const overview = buildDailyOpsOverview(DATE, {
    ...emptyData(),
    menus: [menu({ menuRecipes: [
      { recipeId: 'r1', recipeNameSnapshot: '主菜', servings: 50 },
      { recipeId: 'r2', recipeNameSnapshot: '副菜', servings: 50 },
    ] })],
    workflowPlans: [workflowPlan({ tasks: [
      task({ id: 'a', estimatedMinutes: 10, staffCount: 2 }),
      task({ id: 'b', estimatedMinutes: 5, taskStatus: 'archived' }),
    ] })],
  });
  check('summary: dishCount 2', overview.summary.dishCount, 2);
  check('summary: headCount 50', overview.summary.headCount, 50);
  check('summary: laborMinutes 20 (archived excluded)', overview.summary.laborMinutes, 20);
  check('summary: activeTaskCount 1', overview.summary.activeTaskCount, 1);
}

// ── 2. Empty day: menu missing cascades to na downstream; marketPrice still evaluated ──
{
  const overview = buildDailyOpsOverview(DATE, emptyData());
  check('empty day: menu missing', statusOf(overview.steps, 'menu'), 'missing');
  check('empty day: prepPlan na', statusOf(overview.steps, 'prepPlan'), 'na');
  check('empty day: purchaseDraft na', statusOf(overview.steps, 'purchaseDraft'), 'na');
  check('empty day: workflowPlan na', statusOf(overview.steps, 'workflowPlan'), 'na');
  check('empty day: scheduleSuggestion na', statusOf(overview.steps, 'scheduleSuggestion'), 'na');
  check('empty day: marketPrice missing (not na)', statusOf(overview.steps, 'marketPrice'), 'missing');
  checkTrue(
    'empty day: menu hint present',
    overview.steps.find((s) => s.key === 'menu')!.nextActionHint !== null,
  );
  checkTrue(
    'empty day: na steps have null hint',
    overview.steps.filter((s) => s.status === 'na').every((s) => s.nextActionHint === null),
  );
}

// ── 3. Prep plan exists but no draft ──────────────────────────────────────
{
  const overview = buildDailyOpsOverview(DATE, {
    ...emptyData(),
    menus: [menu()],
    prepPlans: [prepPlan()],
  });
  check('no draft: purchaseDraft missing', statusOf(overview.steps, 'purchaseDraft'), 'missing');
  checkTrue(
    'no draft: hint present',
    overview.steps.find((s) => s.key === 'purchaseDraft')!.nextActionHint !== null,
  );
  check('no draft: workflowPlan missing (no linked plan)', statusOf(overview.steps, 'workflowPlan'), 'missing');
}

// ── 4. Workflow plan with zero active tasks → partial ─────────────────────
{
  const overview = buildDailyOpsOverview(DATE, {
    ...emptyData(),
    menus: [menu()],
    prepPlans: [prepPlan()],
    workflowPlans: [workflowPlan({ tasks: [task({ taskStatus: 'archived' })] })],
  });
  check('zero active tasks: workflowPlan partial', statusOf(overview.steps, 'workflowPlan'), 'partial');
  checkTrue(
    'zero active tasks: hint mentions 自動產生任務草稿',
    overview.steps.find((s) => s.key === 'workflowPlan')!.nextActionHint?.includes('自動產生任務草稿') ?? false,
  );
  check('zero active tasks: scheduleSuggestion na', statusOf(overview.steps, 'scheduleSuggestion'), 'na');
}

// ── 5. Cancelled-only drafts → partial ────────────────────────────────────
{
  const overview = buildDailyOpsOverview(DATE, {
    ...emptyData(),
    menus: [menu()],
    prepPlans: [prepPlan()],
    drafts: [draft({ workflowStatus: 'cancelled' }), draft({ id: 'draft_2', workflowStatus: 'cancelled' })],
  });
  check('cancelled-only drafts: purchaseDraft partial', statusOf(overview.steps, 'purchaseDraft'), 'partial');
  checkTrue(
    'cancelled-only drafts: hint present',
    overview.steps.find((s) => s.key === 'purchaseDraft')!.nextActionHint !== null,
  );
}

// ── 5b. Mixed cancelled + active drafts → done ────────────────────────────
{
  const overview = buildDailyOpsOverview(DATE, {
    ...emptyData(),
    menus: [menu()],
    prepPlans: [prepPlan()],
    drafts: [draft({ workflowStatus: 'cancelled' }), draft({ id: 'draft_2', workflowStatus: 'sent' })],
  });
  check('mixed drafts: purchaseDraft done', statusOf(overview.steps, 'purchaseDraft'), 'done');
}

// ── 6. Schedule done with status detail ───────────────────────────────────
{
  const overview = buildDailyOpsOverview(DATE, {
    ...emptyData(),
    menus: [menu()],
    prepPlans: [prepPlan()],
    workflowPlans: [workflowPlan()],
    scheduleSuggestions: [suggestion({ scheduleStatus: 'overrun', makespanMinutes: 500 })],
  });
  const step = overview.steps.find((s) => s.key === 'scheduleSuggestion')!;
  check('schedule done: status', step.status, 'done');
  checkTrue('schedule done: detail mentions 超時', step.detailLines.some((l) => l.includes('超時')));
  checkTrue('schedule done: detail mentions makespan', step.detailLines.some((l) => l.includes('500')));
}

// ── 7. detailLines overflow cap ────────────────────────────────────────────
{
  const manyMenus = Array.from({ length: 6 }, (_, i) => menu({ id: `menu_${i}`, name: `菜單${i}` }));
  const overview = buildDailyOpsOverview(DATE, { ...emptyData(), menus: manyMenus });
  const step = overview.steps.find((s) => s.key === 'menu')!;
  check('overflow: capped at 4 lines', step.detailLines.length, 4);
  checkTrue('overflow: last line is overflow marker', step.detailLines[3].includes('…等 6 筆'));
  check('overflow: count reflects true total', step.count, 6);
}

// ── 8. Determinism: same input twice yields identical output ──────────────
{
  const input = {
    ...emptyData(),
    menus: [menu()],
    prepPlans: [prepPlan()],
    drafts: [draft()],
    workflowPlans: [workflowPlan()],
    scheduleSuggestions: [suggestion()],
    marketSnapshot: snapshot(),
  };
  const a = buildDailyOpsOverview(DATE, input);
  const b = buildDailyOpsOverview(DATE, input);
  check('determinism: identical output for identical input', a, b);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
