/**
 * productionScheduleService — Feature 034: 人力與製作順序自動排程建議
 * (Production Schedule Suggestion — labor assignment + task ordering).
 *
 * A deterministic list scheduler over one ProductionWorkflowPlan's ACTIVE
 * tasks. This is SUGGESTION-ONLY: it never writes to productionWorkflowPlans
 * and never auto-executes anything — a human reads the schedule and decides.
 *
 * Algorithm (see calculateProductionSchedule):
 *  1. Normalize active tasks — clamp invalid estimatedMinutes/staffCount to
 *     valid minimums (with a warning), and drop dependsOnTaskIds referencing
 *     archived/missing tasks (with a warning).
 *  2. Detect dependency cycles via Kahn's algorithm. Tasks that never reach
 *     in-degree 0 (cycle members + anything downstream of them) are marked
 *     unschedulable; the acyclic remainder is still scheduled.
 *  3. Expand availableStaff/availableEquipment into individual slots.
 *  4. List-schedule the acyclic remainder: repeatedly pick the READY task
 *     (all deps resolved) with the longest critical-path length to any leaf
 *     (tiebreak: lower sequence, then larger estimatedMinutes, then taskName,
 *     then taskId for full determinism). Place it at the earliest event-driven
 *     candidate time (0, or an existing busy-interval end) where its staff and
 *     equipment requirements are simultaneously satisfiable. A task whose
 *     equipment type has zero available slots, or whose staff role (after
 *     fallback) has fewer slots than required, is marked unschedulable
 *     without blocking the rest of the loop; anything depending on an
 *     unschedulable task is also unschedulable (propagated).
 *  5. `canRunInParallel: false` tasks may not overlap ANY other task sharing
 *     the same recipeId (regardless of that other task's own flag) — see
 *     the recipe-exclusivity bookkeeping below.
 *  6. Derive makespan, scheduleStatus (fits/overrun/infeasible),
 *     workStartSuggestion, and per-role/per-equipment utilization.
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getProductionWorkflowPlan } from './productionWorkflowService';
import type {
  ProductionWorkflowPlan,
  ProductionWorkflowTask,
  ProcessType,
  EquipmentType,
  AvailableStaffInput,
  AvailableEquipmentInput,
  ScheduledTaskAssignment,
  ProductionScheduleStatus,
  ProductionScheduleSuggestion,
} from './types';

export interface ProductionScheduleInput {
  targetServiceDateTime: Date;
  capacityWindowMinutes: number;
  bufferMinutes: number;
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
}

// ── Internal helpers ──────────────────────────────────────────────────────

interface Interval {
  start: number;
  end: number;
}

function overlaps(iv: Interval, s: number, e: number): boolean {
  return iv.start < e && s < iv.end;
}

function isFree(intervals: Interval[], s: number, e: number): boolean {
  return !intervals.some((iv) => overlaps(iv, s, e));
}

interface StaffSlot {
  slotId: string;
  role: string;
  index: number;
  intervals: Interval[];
}

interface EquipmentSlot {
  slotId: string;
  type: EquipmentType;
  index: number;
  intervals: Interval[];
}

function buildStaffSlots(availableStaff: AvailableStaffInput[]): {
  byRole: Map<string, StaffSlot[]>;
  all: StaffSlot[];
} {
  const byRole = new Map<string, StaffSlot[]>();
  for (const row of availableStaff) {
    const existing = byRole.get(row.role) ?? [];
    const startIdx = existing.length;
    for (let i = 0; i < row.count; i++) {
      const index = startIdx + i + 1;
      existing.push({ slotId: `${row.role}#${index}`, role: row.role, index, intervals: [] });
    }
    byRole.set(row.role, existing);
  }
  const all = Array.from(byRole.values())
    .flat()
    .sort((a, b) => a.role.localeCompare(b.role, 'zh-TW') || a.index - b.index);
  return { byRole, all };
}

function buildEquipmentSlots(
  availableEquipment: AvailableEquipmentInput[],
): Map<EquipmentType, EquipmentSlot[]> {
  const byType = new Map<EquipmentType, EquipmentSlot[]>();
  for (const row of availableEquipment) {
    const existing = byType.get(row.type) ?? [];
    const startIdx = existing.length;
    for (let i = 0; i < row.count; i++) {
      const index = startIdx + i + 1;
      existing.push({ slotId: `${row.type}#${index}`, type: row.type, index, intervals: [] });
    }
    byType.set(row.type, existing);
  }
  return byType;
}

/** Earliest time >= earliestStart at which all supplied resource pools have
 * enough free capacity, searching only event-driven candidate times. */
function findEarliestFeasibleTime(
  earliestStart: number,
  check: (t: number) => boolean,
  intervalPools: Interval[][],
): number {
  const candidates = new Set<number>([earliestStart]);
  for (const pool of intervalPools) {
    for (const iv of pool) {
      if (iv.end >= earliestStart) candidates.add(iv.end);
    }
  }
  const sorted = Array.from(candidates).sort((a, b) => a - b);
  for (const t of sorted) {
    if (check(t)) return t;
  }
  // Should be unreachable given upfront capacity checks — fall back to the
  // last candidate (by then every relevant interval has ended).
  const last = sorted[sorted.length - 1] ?? earliestStart;
  return last;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Pure core algorithm ───────────────────────────────────────────────────

function validateInput(input: ProductionScheduleInput): void {
  if (input.capacityWindowMinutes <= 0) {
    throw new Error('capacityWindowMinutes must be > 0');
  }
  if (input.bufferMinutes < 0) {
    throw new Error('bufferMinutes must be >= 0');
  }
  if (input.bufferMinutes >= input.capacityWindowMinutes) {
    throw new Error('bufferMinutes must be < capacityWindowMinutes');
  }
  for (const s of input.availableStaff) {
    if (!s.role.trim()) throw new Error('Staff role must not be empty');
    if (s.count <= 0) throw new Error('Staff count must be > 0');
  }
  for (const e of input.availableEquipment) {
    if (e.count <= 0) throw new Error('Equipment count must be > 0');
  }
}

export function calculateProductionSchedule(
  plan: ProductionWorkflowPlan,
  input: ProductionScheduleInput,
): Omit<ProductionScheduleSuggestion, 'id' | 'createdAt' | 'createdBy'> {
  validateInput(input);

  const { capacityWindowMinutes, bufferMinutes, availableStaff, availableEquipment } = input;
  const effectiveWindowMinutes = capacityWindowMinutes - bufferMinutes;

  const activeTasks = plan.tasks.filter((t) => t.taskStatus === 'active');
  if (activeTasks.length === 0) {
    throw new Error('No active tasks in plan — cannot calculate schedule');
  }

  const allTasksById = new Map<string, ProductionWorkflowTask>(plan.tasks.map((t) => [t.id, t]));
  const activeTasksById = new Map<string, ProductionWorkflowTask>(
    activeTasks.map((t) => [t.id, t]),
  );

  // ── Step 1: normalize + validate deps ──────────────────────────────────
  const effectiveMinutes = new Map<string, number>();
  const effectiveStaffCount = new Map<string, number>();
  const effectiveAttention = new Map<string, number>(); // Feature 104: hands-on 分鐘
  const taskWarnings = new Map<string, string[]>();
  const validDeps = new Map<string, string[]>();

  for (const task of activeTasks) {
    const warnings: string[] = [];

    let minutes = task.estimatedMinutes;
    if (!(minutes > 0)) {
      warnings.push(
        `任務「${task.taskName}」預估分鐘數不合法（${task.estimatedMinutes}），已修正為 1 分鐘`,
      );
      minutes = 1;
    }
    effectiveMinutes.set(task.id, minutes);

    let staffCount = task.staffCount;
    if (!(staffCount >= 1)) {
      warnings.push(
        `任務「${task.taskName}」人力人數不合法（${task.staffCount}），已修正為 1 人`,
      );
      staffCount = 1;
    }
    effectiveStaffCount.set(task.id, staffCount);

    // Feature 104: hands-on 分鐘 clamp 到 [1, minutes]；未設 = 全程要顧（= minutes）。
    const rawAttention = task.attentionMinutes;
    const attention =
      rawAttention != null && Number.isFinite(rawAttention)
        ? Math.min(minutes, Math.max(1, rawAttention))
        : minutes;
    effectiveAttention.set(task.id, attention);

    const deps: string[] = [];
    for (const depId of task.dependsOnTaskIds) {
      const depTask = allTasksById.get(depId);
      if (depTask && activeTasksById.has(depId)) {
        deps.push(depId);
      } else {
        warnings.push(
          `任務「${task.taskName}」相依任務 ID「${depId}」不存在或已封存，已忽略此相依`,
        );
      }
    }
    validDeps.set(task.id, deps);

    taskWarnings.set(task.id, warnings);
  }

  // ── Step 2: cycle detection via Kahn's algorithm ───────────────────────
  const activeIds = activeTasks.map((t) => t.id).sort((a, b) => a.localeCompare(b));

  const dependentsMap = new Map<string, string[]>();
  for (const id of activeIds) dependentsMap.set(id, []);
  for (const id of activeIds) {
    for (const depId of validDeps.get(id)!) {
      dependentsMap.get(depId)!.push(id);
    }
  }
  // Keep dependent lists deterministic.
  for (const id of activeIds) {
    dependentsMap.get(id)!.sort((a, b) => a.localeCompare(b));
  }

  const kahnInDegree = new Map<string, number>(
    activeIds.map((id) => [id, validDeps.get(id)!.length]),
  );
  const topoOrder: string[] = [];
  let frontier = activeIds.filter((id) => kahnInDegree.get(id) === 0).sort((a, b) => a.localeCompare(b));
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      topoOrder.push(id);
      for (const dependent of dependentsMap.get(id)!) {
        const d = kahnInDegree.get(dependent)! - 1;
        kahnInDegree.set(dependent, d);
        if (d === 0) next.push(dependent);
      }
    }
    frontier = next.sort((a, b) => a.localeCompare(b));
  }
  const topoOrderSet = new Set(topoOrder);
  const cyclicTaskIds = activeIds.filter((id) => !topoOrderSet.has(id));

  // ── Step 3: critical-path length (longest downstream duration chain) ──
  const cpl = new Map<string, number>();
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const dur = effectiveMinutes.get(id)!;
    const dependents = dependentsMap.get(id)!.filter((d) => topoOrderSet.has(d));
    let maxDependentCpl = 0;
    for (const dep of dependents) maxDependentCpl = Math.max(maxDependentCpl, cpl.get(dep) ?? 0);
    cpl.set(id, dur + maxDependentCpl);
  }

  // ── Step 4: resource pools ──────────────────────────────────────────────
  const { byRole: staffByRole, all: staffAll } = buildStaffSlots(availableStaff);
  const equipmentByType = buildEquipmentSlots(availableEquipment);

  const recipeAllIntervals = new Map<string, Interval[]>();
  const recipeExclusiveIntervals = new Map<string, Interval[]>();
  const recipeConstraintAffectedTaskNames: string[] = [];

  // ── Step 5: list scheduling loop (priority + Kahn traversal combined) ─
  const inDegree2 = new Map<string, number>(
    topoOrder.map((id) => [id, validDeps.get(id)!.length]),
  );
  const resolvedEnd = new Map<string, number>();
  const unschedulableSet = new Set<string>();
  const unschedulableReasons = new Map<string, 'equipment' | 'staffCapacity' | 'propagated'>();
  const scheduledTasks: ScheduledTaskAssignment[] = [];

  function priorityCompare(aId: string, bId: string): number {
    const a = activeTasksById.get(aId)!;
    const b = activeTasksById.get(bId)!;
    const cplDiff = (cpl.get(bId) ?? 0) - (cpl.get(aId) ?? 0);
    if (cplDiff !== 0) return cplDiff;
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    const durDiff = effectiveMinutes.get(bId)! - effectiveMinutes.get(aId)!;
    if (durDiff !== 0) return durDiff;
    const nameCmp = a.taskName.localeCompare(b.taskName, 'zh-TW');
    if (nameCmp !== 0) return nameCmp;
    return aId.localeCompare(bId);
  }

  let ready: string[] = topoOrder.filter((id) => inDegree2.get(id) === 0);

  while (ready.length > 0) {
    ready.sort(priorityCompare);
    const pickedId = ready.shift()!;
    const task = activeTasksById.get(pickedId)!;
    const deps = validDeps.get(pickedId)!;
    const warnings = [...taskWarnings.get(pickedId)!];

    const anyDepUnschedulable = deps.some((d) => unschedulableSet.has(d));

    if (anyDepUnschedulable) {
      unschedulableSet.add(pickedId);
      unschedulableReasons.set(pickedId, 'propagated');
    } else {
      const earliestStart = deps.length > 0 ? Math.max(...deps.map((d) => resolvedEnd.get(d)!)) : 0;
      const duration = effectiveMinutes.get(pickedId)!;
      const attention = effectiveAttention.get(pickedId)!; // Feature 104: 人力只佔用這段
      const requiredStaff = effectiveStaffCount.get(pickedId)!;

      // Resolve staff pool (with fallback for unknown/undefined role).
      let staffPool: StaffSlot[];
      if (task.staffRole && staffByRole.has(task.staffRole)) {
        staffPool = staffByRole.get(task.staffRole)!;
      } else {
        if (task.staffRole) {
          warnings.push(`找不到職務角色「${task.staffRole}」，已使用任意可用人力排班`);
        }
        staffPool = staffAll;
      }

      // Resolve equipment slots.
      const needsEquipment = task.equipmentType !== 'none';
      const equipmentSlots = needsEquipment ? equipmentByType.get(task.equipmentType) : undefined;

      if (needsEquipment && (!equipmentSlots || equipmentSlots.length === 0)) {
        unschedulableSet.add(pickedId);
        unschedulableReasons.set(pickedId, 'equipment');
      } else if (staffPool.length < requiredStaff) {
        unschedulableSet.add(pickedId);
        unschedulableReasons.set(pickedId, 'staffCapacity');
      } else {
        const recipeId = task.recipeId;
        const blockedIntervals: Interval[] = recipeId
          ? [
              ...(recipeExclusiveIntervals.get(recipeId) ?? []),
              ...(task.canRunInParallel === false ? recipeAllIntervals.get(recipeId) ?? [] : []),
            ]
          : [];

        // Feature 104: 人力只需在「要顧」窗 [t, t+attention) 有空；設備/配方佔用整個時長。
        const staffOk = (t: number) =>
          staffPool.filter((s) => isFree(s.intervals, t, t + attention)).length >= requiredStaff;
        const equipOk = (t: number) =>
          !needsEquipment || equipmentSlots!.some((s) => isFree(s.intervals, t, t + duration));
        const recipeOk = (t: number) => !recipeId || isFree(blockedIntervals, t, t + duration);

        const basePools = [
          staffPool.map((s) => s.intervals).flat(),
          needsEquipment ? equipmentSlots!.map((s) => s.intervals).flat() : [],
        ];

        const tBase = findEarliestFeasibleTime(
          earliestStart,
          (t) => staffOk(t) && equipOk(t),
          basePools,
        );

        const tFinal = recipeId
          ? findEarliestFeasibleTime(
              earliestStart,
              (t) => staffOk(t) && equipOk(t) && recipeOk(t),
              [...basePools, blockedIntervals],
            )
          : tBase;

        if (recipeId && tFinal > tBase) {
          warnings.push('因與相依配方相同且不可並行，已延後排程');
          recipeConstraintAffectedTaskNames.push(task.taskName);
        }

        // Feature 104: 人力只選在「要顧」窗有空的 slot，佔用 [tFinal, staffEnd)；
        // 設備/配方佔用整個時長 [tFinal, end)。
        const staffEnd = tFinal + attention;
        const chosenStaffSlots = staffPool
          .filter((s) => isFree(s.intervals, tFinal, staffEnd))
          .slice(0, requiredStaff);
        const chosenEquipmentSlot = needsEquipment
          ? equipmentSlots!.find((s) => isFree(s.intervals, tFinal, tFinal + duration)) ?? null
          : null;

        const end = tFinal + duration;
        for (const slot of chosenStaffSlots) slot.intervals.push({ start: tFinal, end: staffEnd });
        if (chosenEquipmentSlot) chosenEquipmentSlot.intervals.push({ start: tFinal, end });
        if (recipeId) {
          const list = recipeAllIntervals.get(recipeId) ?? [];
          list.push({ start: tFinal, end });
          recipeAllIntervals.set(recipeId, list);
          if (task.canRunInParallel === false) {
            const exList = recipeExclusiveIntervals.get(recipeId) ?? [];
            exList.push({ start: tFinal, end });
            recipeExclusiveIntervals.set(recipeId, exList);
          }
        }

        resolvedEnd.set(pickedId, end);
        scheduledTasks.push({
          taskId: task.id,
          taskName: task.taskName,
          processType: task.processType,
          equipmentType: task.equipmentType,
          startOffsetMinutes: tFinal,
          endOffsetMinutes: end,
          attentionMinutes: attention,
          assignedStaffSlots: chosenStaffSlots.map((s) => s.slotId),
          assignedEquipmentSlot: chosenEquipmentSlot ? chosenEquipmentSlot.slotId : null,
          dependsOnTaskIds: deps,
          warnings,
        });
      }
    }

    for (const dependent of dependentsMap.get(pickedId)!.filter((d) => topoOrderSet.has(d))) {
      const d = inDegree2.get(dependent)! - 1;
      inDegree2.set(dependent, d);
      if (d === 0) ready.push(dependent);
    }
  }

  for (const id of cyclicTaskIds) unschedulableSet.add(id);

  // ── Step 6: derive summary fields ──────────────────────────────────────
  scheduledTasks.sort(
    (a, b) => a.startOffsetMinutes - b.startOffsetMinutes || a.taskName.localeCompare(b.taskName, 'zh-TW'),
  );

  const makespanMinutes =
    scheduledTasks.length > 0 ? Math.max(...scheduledTasks.map((t) => t.endOffsetMinutes)) : 0;

  const unschedulableTaskIds = Array.from(unschedulableSet).sort((a, b) => {
    const nameA = activeTasksById.get(a)?.taskName ?? a;
    const nameB = activeTasksById.get(b)?.taskName ?? b;
    return nameA.localeCompare(nameB, 'zh-TW') || a.localeCompare(b);
  });

  const scheduleStatus: ProductionScheduleStatus =
    unschedulableTaskIds.length > 0
      ? 'infeasible'
      : makespanMinutes > effectiveWindowMinutes
        ? 'overrun'
        : 'fits';

  const workStartSuggestion = new Date(
    input.targetServiceDateTime.getTime() - (makespanMinutes + bufferMinutes) * 60000,
  ).toISOString();

  // Utilization
  const busyMinutesByRole = new Map<string, number>();
  for (const t of scheduledTasks) {
    // Feature 104: 人力只在「要顧」時段忙碌；免顧（燉煮中）不算佔用。
    const staffBusy = t.attentionMinutes;
    for (const slotId of t.assignedStaffSlots) {
      const role = slotId.slice(0, slotId.lastIndexOf('#'));
      busyMinutesByRole.set(role, (busyMinutesByRole.get(role) ?? 0) + staffBusy);
    }
  }
  const staffCountByRole = new Map<string, number>();
  for (const row of availableStaff) {
    staffCountByRole.set(row.role, (staffCountByRole.get(row.role) ?? 0) + row.count);
  }
  const staffUtilization: Record<string, number> = {};
  for (const [role, minutes] of busyMinutesByRole.entries()) {
    const count = staffCountByRole.get(role) ?? 0;
    const denom = count * effectiveWindowMinutes;
    staffUtilization[role] = denom > 0 ? round2(minutes / denom) : 0;
  }

  const busyMinutesByEquipmentType = new Map<string, number>();
  for (const t of scheduledTasks) {
    if (!t.assignedEquipmentSlot) continue;
    const duration = t.endOffsetMinutes - t.startOffsetMinutes;
    const type = t.assignedEquipmentSlot.slice(0, t.assignedEquipmentSlot.lastIndexOf('#'));
    busyMinutesByEquipmentType.set(type, (busyMinutesByEquipmentType.get(type) ?? 0) + duration);
  }
  const equipmentCountByType = new Map<string, number>();
  for (const row of availableEquipment) {
    equipmentCountByType.set(row.type, (equipmentCountByType.get(row.type) ?? 0) + row.count);
  }
  const equipmentUtilization: Record<string, number> = {};
  for (const [type, minutes] of busyMinutesByEquipmentType.entries()) {
    const count = equipmentCountByType.get(type) ?? 0;
    const denom = count * effectiveWindowMinutes;
    equipmentUtilization[type] = denom > 0 ? round2(minutes / denom) : 0;
  }

  // Manual review notes
  const manualReviewNotes: string[] = [
    '本排程為建議僅供人工參考，不會回寫製程規劃',
    `已排程 ${scheduledTasks.length} 個任務，${unschedulableTaskIds.length} 個任務無法排入`,
  ];

  const cyclicNames = cyclicTaskIds
    .map((id) => activeTasksById.get(id)!.taskName)
    .sort((a, b) => a.localeCompare(b, 'zh-TW'));
  if (cyclicNames.length > 0) {
    manualReviewNotes.push(
      `以下任務因相依關係形成循環，無法排入排程：${cyclicNames.join('、')}，請人工確認相依設定`,
    );
  }

  const equipmentMissingNames = Array.from(unschedulableReasons.entries())
    .filter(([, reason]) => reason === 'equipment')
    .map(([id]) => activeTasksById.get(id)!.taskName)
    .sort((a, b) => a.localeCompare(b, 'zh-TW'));
  if (equipmentMissingNames.length > 0) {
    manualReviewNotes.push(
      `以下任務因所需設備無可用數量，無法排入排程：${equipmentMissingNames.join('、')}，請人工確認資源`,
    );
  }

  const staffCapacityNames = Array.from(unschedulableReasons.entries())
    .filter(([, reason]) => reason === 'staffCapacity')
    .map(([id]) => activeTasksById.get(id)!.taskName)
    .sort((a, b) => a.localeCompare(b, 'zh-TW'));
  if (staffCapacityNames.length > 0) {
    manualReviewNotes.push(
      `以下任務因所需人力數量超過可用人力上限，無法排入排程：${staffCapacityNames.join('、')}，請人工確認資源`,
    );
  }

  const propagatedNames = Array.from(unschedulableReasons.entries())
    .filter(([, reason]) => reason === 'propagated')
    .map(([id]) => activeTasksById.get(id)!.taskName)
    .sort((a, b) => a.localeCompare(b, 'zh-TW'));
  if (propagatedNames.length > 0) {
    manualReviewNotes.push(
      `以下任務因相依任務未能排入，無法排入排程：${propagatedNames.join('、')}`,
    );
  }

  if (recipeConstraintAffectedTaskNames.length > 0) {
    const uniqueNames = Array.from(new Set(recipeConstraintAffectedTaskNames)).sort((a, b) =>
      a.localeCompare(b, 'zh-TW'),
    );
    manualReviewNotes.push(
      `以下任務因同配方不可並行限制而延後排程：${uniqueNames.join('、')}，請人工確認`,
    );
  }

  return {
    sourceProductionWorkflowPlanId: plan.id,
    sourcePlanNameSnapshot: plan.planName,
    targetServiceDateTime: Timestamp.fromDate(input.targetServiceDateTime),
    capacityWindowMinutes,
    bufferMinutes,
    availableStaff,
    availableEquipment,
    scheduledTasks,
    makespanMinutes,
    scheduleStatus,
    unschedulableTaskIds,
    staffUtilization,
    equipmentUtilization,
    workStartSuggestion,
    manualReviewNotes,
  };
}

// ── Firestore functions (immutable create-only records) ──────────────────

const COLLECTION = 'productionScheduleSuggestions';

export async function createProductionScheduleSuggestion(
  db: Firestore,
  planId: string,
  input: ProductionScheduleInput,
  uid: string,
): Promise<ProductionScheduleSuggestion> {
  const plan = await getProductionWorkflowPlan(db, planId);
  const result = calculateProductionSchedule(plan, input);

  const docData = {
    ...result,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };

  const ref = await addDoc(collection(db, COLLECTION), docData);

  return {
    id: ref.id,
    ...result,
    createdBy: uid,
  };
}

export async function listProductionScheduleSuggestions(
  db: Firestore,
  planId: string,
): Promise<ProductionScheduleSuggestion[]> {
  const q = query(
    collection(db, COLLECTION),
    where('sourceProductionWorkflowPlanId', '==', planId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ProductionScheduleSuggestion, 'id'>),
  }));
}

// Re-exported for tests/consumers that only need types alongside process/equipment vocab.
export type { ProcessType, EquipmentType };
