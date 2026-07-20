/**
 * productionScheduleService.test.ts
 *
 * Validation tests for Feature 034: 人力與製作順序自動排程建議.
 * Covers `calculateProductionSchedule` (pure, end-to-end on small fixtures).
 * Run with: npx tsx src/services/__tests__/productionScheduleService.test.ts
 */

import { calculateProductionSchedule } from '../productionScheduleService';
import type { ProductionScheduleInput } from '../productionScheduleService';
import type {
  ProductionWorkflowPlan,
  ProductionWorkflowTask,
  ScheduledTaskAssignment,
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

function task(overrides: Partial<ProductionWorkflowTask> = {}): ProductionWorkflowTask {
  return {
    id: 'task_default',
    taskStatus: 'active',
    taskName: '預設任務',
    processType: 'cut',
    equipmentType: 'none',
    estimatedMinutes: 10,
    staffCount: 1,
    sequence: 1,
    dependsOnTaskIds: [],
    canRunInParallel: true,
    ...overrides,
  };
}

function plan(
  tasks: ProductionWorkflowTask[],
  overrides: Partial<ProductionWorkflowPlan> = {},
): ProductionWorkflowPlan {
  return {
    id: 'plan_default',
    sourcePrepPlanId: 'prep_default',
    sourcePrepPlanNameSnapshot: '預設備料快照',
    planName: '預設製程規劃',
    status: 'draft',
    isActive: true,
    tasks,
    createdBy: 'tester',
    updatedBy: 'tester',
    ...overrides,
  };
}

function baseInput(overrides: Partial<ProductionScheduleInput> = {}): ProductionScheduleInput {
  return {
    targetServiceDateTime: new Date(2026, 6, 6, 11, 30, 0),
    capacityWindowMinutes: 240,
    bufferMinutes: 30,
    availableStaff: [{ role: '廚師', count: 2 }],
    availableEquipment: [{ type: 'wok', count: 2 }],
    ...overrides,
  };
}

function byId(tasks: ScheduledTaskAssignment[], id: string): ScheduledTaskAssignment | undefined {
  return tasks.find((t) => t.taskId === id);
}

// ── (a) linear dependency chain schedules sequentially ───────────────────
{
  console.log('(a) linear dependency chain');
  const tasks = [
    task({ id: 'A', taskName: 'A', sequence: 1, staffRole: '廚師', estimatedMinutes: 10 }),
    task({ id: 'B', taskName: 'B', sequence: 2, staffRole: '廚師', estimatedMinutes: 20, dependsOnTaskIds: ['A'] }),
    task({ id: 'C', taskName: 'C', sequence: 3, staffRole: '廚師', estimatedMinutes: 15, dependsOnTaskIds: ['B'] }),
  ];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ availableStaff: [{ role: '廚師', count: 1 }], availableEquipment: [] }),
  );
  check('A starts at 0, ends 10', [byId(result.scheduledTasks, 'A')?.startOffsetMinutes, byId(result.scheduledTasks, 'A')?.endOffsetMinutes], [0, 10]);
  check('B starts at 10, ends 30', [byId(result.scheduledTasks, 'B')?.startOffsetMinutes, byId(result.scheduledTasks, 'B')?.endOffsetMinutes], [10, 30]);
  check('C starts at 30, ends 45', [byId(result.scheduledTasks, 'C')?.startOffsetMinutes, byId(result.scheduledTasks, 'C')?.endOffsetMinutes], [30, 45]);
  check('makespan is 45', result.makespanMinutes, 45);
  check('status fits (window-buffer=210)', result.scheduleStatus, 'fits');
}

// ── (b) two independent tasks + 2 staff slots run in parallel ────────────
{
  console.log('(b) parallel independent tasks');
  const tasks = [
    task({ id: 'A', taskName: 'A', sequence: 1, staffRole: '廚師', estimatedMinutes: 10 }),
    task({ id: 'B', taskName: 'B', sequence: 2, staffRole: '廚師', estimatedMinutes: 15 }),
  ];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ availableStaff: [{ role: '廚師', count: 2 }], availableEquipment: [] }),
  );
  check('A starts at 0', byId(result.scheduledTasks, 'A')?.startOffsetMinutes, 0);
  check('B starts at 0', byId(result.scheduledTasks, 'B')?.startOffsetMinutes, 0);
  check('makespan is 15', result.makespanMinutes, 15);
}

// ── (c) staff bottleneck (1 slot) serializes them ─────────────────────────
{
  console.log('(c) staff bottleneck serializes');
  const tasks = [
    task({ id: 'A', taskName: 'A', sequence: 1, staffRole: '廚師', estimatedMinutes: 10 }),
    task({ id: 'B', taskName: 'B', sequence: 2, staffRole: '廚師', estimatedMinutes: 15 }),
  ];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ availableStaff: [{ role: '廚師', count: 1 }], availableEquipment: [] }),
  );
  // B has the longer critical-path length (15 > 10) so it is prioritized first.
  check('B starts at 0, ends 15', [byId(result.scheduledTasks, 'B')?.startOffsetMinutes, byId(result.scheduledTasks, 'B')?.endOffsetMinutes], [0, 15]);
  check('A starts at 15, ends 25', [byId(result.scheduledTasks, 'A')?.startOffsetMinutes, byId(result.scheduledTasks, 'A')?.endOffsetMinutes], [15, 25]);
  check('makespan is 25', result.makespanMinutes, 25);
}

// ── (d) equipment bottleneck (1 wok, 2 wok tasks) serializes ──────────────
{
  console.log('(d) equipment bottleneck serializes');
  const tasks = [
    task({ id: 'A', taskName: 'A', sequence: 1, equipmentType: 'wok', estimatedMinutes: 10, staffRole: '廚師' }),
    task({ id: 'B', taskName: 'B', sequence: 2, equipmentType: 'wok', estimatedMinutes: 10, staffRole: '廚師' }),
  ];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ availableStaff: [{ role: '廚師', count: 2 }], availableEquipment: [{ type: 'wok', count: 1 }] }),
  );
  // Equal cpl (both duration 10) -> tiebreak on lower sequence -> A first.
  check('A starts at 0, ends 10', [byId(result.scheduledTasks, 'A')?.startOffsetMinutes, byId(result.scheduledTasks, 'A')?.endOffsetMinutes], [0, 10]);
  check('B starts at 10, ends 20', [byId(result.scheduledTasks, 'B')?.startOffsetMinutes, byId(result.scheduledTasks, 'B')?.endOffsetMinutes], [10, 20]);
  check('makespan is 20', result.makespanMinutes, 20);
  check('equipmentUtilization has wok entry', result.equipmentUtilization.wok > 0, true);
}

// ── (e) missing equipment type → unschedulable + infeasible ──────────────
{
  console.log('(e) missing equipment type');
  const tasks = [
    task({ id: 'OVEN', taskName: 'OVEN', sequence: 1, equipmentType: 'oven', estimatedMinutes: 10 }),
    task({ id: 'PLAIN', taskName: 'PLAIN', sequence: 2, equipmentType: 'none', estimatedMinutes: 5 }),
  ];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ availableStaff: [{ role: '廚師', count: 2 }], availableEquipment: [{ type: 'wok', count: 1 }] }),
  );
  check('scheduleStatus infeasible', result.scheduleStatus, 'infeasible');
  checkTrue('OVEN is unschedulable', result.unschedulableTaskIds.includes('OVEN'));
  checkTrue('PLAIN is still scheduled', byId(result.scheduledTasks, 'PLAIN') !== undefined);
}

// ── (f) cycle detection → infeasible, acyclic rest still scheduled ───────
{
  console.log('(f) cycle detection');
  const tasks = [
    task({ id: 'A', taskName: 'A', sequence: 1, dependsOnTaskIds: ['B'] }),
    task({ id: 'B', taskName: 'B', sequence: 2, dependsOnTaskIds: ['A'] }),
    task({ id: 'C', taskName: 'C', sequence: 3, estimatedMinutes: 5 }),
  ];
  const result = calculateProductionSchedule(plan(tasks), baseInput());
  check('scheduleStatus infeasible', result.scheduleStatus, 'infeasible');
  checkTrue('A is unschedulable', result.unschedulableTaskIds.includes('A'));
  checkTrue('B is unschedulable', result.unschedulableTaskIds.includes('B'));
  checkTrue('C is still scheduled', byId(result.scheduledTasks, 'C') !== undefined);
  checkTrue('manualReviewNotes mentions cycle', result.manualReviewNotes.some((n) => n.includes('循環')));
}

// ── (g) fits vs overrun threshold ─────────────────────────────────────────
{
  console.log('(g) fits vs overrun');
  const fitsResult = calculateProductionSchedule(
    plan([task({ id: 'A', taskName: 'A', estimatedMinutes: 30 })]),
    baseInput({ capacityWindowMinutes: 60, bufferMinutes: 10 }),
  );
  check('fits when makespan <= window-buffer', fitsResult.scheduleStatus, 'fits');

  const overrunResult = calculateProductionSchedule(
    plan([task({ id: 'A', taskName: 'A', estimatedMinutes: 60 })]),
    baseInput({ capacityWindowMinutes: 60, bufferMinutes: 10 }),
  );
  check('overrun when makespan > window-buffer', overrunResult.scheduleStatus, 'overrun');
}

// ── (h) staffRole fallback warning ────────────────────────────────────────
{
  console.log('(h) staffRole fallback');
  const tasks = [
    task({ id: 'A', taskName: 'A', staffRole: '不存在角色', estimatedMinutes: 10 }),
  ];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ availableStaff: [{ role: '廚師', count: 1 }], availableEquipment: [] }),
  );
  const a = byId(result.scheduledTasks, 'A');
  checkTrue('A is scheduled via fallback', a !== undefined);
  check('A assigned to 廚師#1 via fallback', a?.assignedStaffSlots, ['廚師#1']);
  checkTrue('warning mentions fallback', (a?.warnings ?? []).some((w) => w.includes('不存在角色')));
}

// ── (i) canRunInParallel=false same-recipe non-overlap ────────────────────
{
  console.log('(i) canRunInParallel=false same-recipe exclusivity');
  const tasks = [
    task({ id: 'A', taskName: 'A', sequence: 1, recipeId: 'r1', canRunInParallel: false, estimatedMinutes: 10, staffRole: '廚師' }),
    task({ id: 'B', taskName: 'B', sequence: 2, recipeId: 'r1', canRunInParallel: true, estimatedMinutes: 10, staffRole: '廚師' }),
  ];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ availableStaff: [{ role: '廚師', count: 2 }], availableEquipment: [] }),
  );
  const a = byId(result.scheduledTasks, 'A');
  const b = byId(result.scheduledTasks, 'B');
  check('A starts at 0, ends 10', [a?.startOffsetMinutes, a?.endOffsetMinutes], [0, 10]);
  check('B starts at 10 (delayed to avoid overlap)', b?.startOffsetMinutes, 10);
  checkTrue('B warnings mention recipe exclusivity delay', (b?.warnings ?? []).some((w) => w.includes('不可並行')));
  checkTrue('manualReviewNotes mentions recipe constraint', result.manualReviewNotes.some((n) => n.includes('同配方')));
  check('makespan is 20', result.makespanMinutes, 20);
}

// ── (j) workStartSuggestion arithmetic ─────────────────────────────────────
{
  console.log('(j) workStartSuggestion arithmetic');
  const target = new Date(2026, 6, 6, 11, 30, 0);
  const tasks = [task({ id: 'A', taskName: 'A', estimatedMinutes: 40 })];
  const result = calculateProductionSchedule(
    plan(tasks),
    baseInput({ targetServiceDateTime: target, bufferMinutes: 20 }),
  );
  const expected = new Date(target.getTime() - (40 + 20) * 60000).toISOString();
  check('workStartSuggestion = target - (makespan+buffer)', result.workStartSuggestion, expected);
}

// ── (k) determinism: same input twice → deep-equal output ─────────────────
{
  console.log('(k) determinism');
  const tasks = [
    task({ id: 'A', taskName: 'A', sequence: 1, staffRole: '廚師', estimatedMinutes: 10 }),
    task({ id: 'B', taskName: 'B', sequence: 2, staffRole: '廚師', estimatedMinutes: 15, dependsOnTaskIds: ['A'] }),
    task({ id: 'C', taskName: 'C', sequence: 3, equipmentType: 'wok', estimatedMinutes: 12 }),
    task({ id: 'D', taskName: 'D', sequence: 4, equipmentType: 'wok', estimatedMinutes: 8, recipeId: 'r1', canRunInParallel: false }),
  ];
  const input = baseInput({ availableStaff: [{ role: '廚師', count: 1 }], availableEquipment: [{ type: 'wok', count: 1 }] });
  const p = plan(tasks);
  const r1 = calculateProductionSchedule(p, input);
  const r2 = calculateProductionSchedule(p, input);
  const norm = (r: typeof r1) => JSON.stringify({ ...r, targetServiceDateTime: r.targetServiceDateTime.toMillis() });
  check('identical results across repeated runs', norm(r1), norm(r2));
}

// ── (l) Feature 104: 免顧工序釋放人力，別的任務插進燉煮空檔 ──────────────────
{
  console.log('(l) attentionMinutes frees staff during passive cooking');
  const input = baseInput({
    availableStaff: [{ role: '廚師', count: 1 }],
    availableEquipment: [{ type: 'stockPot', count: 1 }, { type: 'wok', count: 1 }],
  });
  const tasks = [
    task({ id: 'braise', taskName: '滷肉', processType: 'cook', equipmentType: 'stockPot', staffRole: '廚師', estimatedMinutes: 40, attentionMinutes: 5 }),
    task({ id: 'stir', taskName: '炒青菜', processType: 'cook', equipmentType: 'wok', staffRole: '廚師', estimatedMinutes: 10 }),
  ];
  const r = calculateProductionSchedule(plan(tasks), input);
  const braise = byId(r.scheduledTasks, 'braise')!;
  const stir = byId(r.scheduledTasks, 'stir')!;
  check('braise runs 0–40', [braise.startOffsetMinutes, braise.endOffsetMinutes], [0, 40]);
  check('braise hands-on = 5', braise.attentionMinutes, 5);
  check('stir hands-on = full 10 (未設)', stir.attentionMinutes, 10);
  check('stir starts at 5 (廚師顧完滷肉即開炒)', stir.startOffsetMinutes, 5);
  checkTrue('stir 插進滷肉的免顧空檔內', stir.startOffsetMinutes < braise.endOffsetMinutes);
  check('makespan = 40（沒被拉長到 50）', r.makespanMinutes, 40);
}

// ── (m) 反向：不設 attentionMinutes 時，燉煮全程綁住人力（串行） ──────────────
{
  console.log('(m) without attentionMinutes staff is held for full duration');
  const input = baseInput({
    availableStaff: [{ role: '廚師', count: 1 }],
    availableEquipment: [{ type: 'stockPot', count: 1 }, { type: 'wok', count: 1 }],
  });
  const tasks = [
    task({ id: 'braise', taskName: '滷肉', processType: 'cook', equipmentType: 'stockPot', staffRole: '廚師', estimatedMinutes: 40 }),
    task({ id: 'stir', taskName: '炒青菜', processType: 'cook', equipmentType: 'wok', staffRole: '廚師', estimatedMinutes: 10 }),
  ];
  const r = calculateProductionSchedule(plan(tasks), input);
  const stir = byId(r.scheduledTasks, 'stir')!;
  check('stir 只能等滷肉整整 40 分後才開始', stir.startOffsetMinutes, 40);
  check('makespan = 50（串行）', r.makespanMinutes, 50);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
