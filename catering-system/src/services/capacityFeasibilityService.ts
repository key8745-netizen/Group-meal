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
  EquipmentType,
  AvailableStaffInput,
  AvailableEquipmentInput,
  CapacityResult,
  CapacityFeasibilityCheck,
  FeasibilityStatus,
  CapacityRiskLevel,
} from './types';

export interface CapacityFeasibilityInput {
  targetServiceDateTime: Date;
  capacityWindowMinutes: number;
  bufferMinutes: number;
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
}

export function calculateCapacityFeasibility(
  plan: ProductionWorkflowPlan,
  input: CapacityFeasibilityInput,
): CapacityResult {
  const { capacityWindowMinutes, bufferMinutes, availableStaff, availableEquipment } = input;

  const activeTasks = plan.tasks.filter((t) => t.taskStatus === 'active');
  if (activeTasks.length === 0) {
    throw new Error('No active tasks in plan — cannot calculate feasibility');
  }

  const effectiveWindowMinutes = capacityWindowMinutes - bufferMinutes;

  // Equipment load
  const equipmentLoadMinutes: Record<string, number> = {};
  for (const task of activeTasks) {
    if (task.equipmentType !== 'none') {
      equipmentLoadMinutes[task.equipmentType] =
        (equipmentLoadMinutes[task.equipmentType] ?? 0) + task.estimatedMinutes;
    }
  }

  const availableEquipmentMap = new Map<string, number>(
    availableEquipment.map((e) => [e.type, e.count]),
  );

  const equipmentLoadRatios: Record<string, number> = {};
  for (const [equipType, loadMins] of Object.entries(equipmentLoadMinutes)) {
    const avail = availableEquipmentMap.get(equipType) ?? 0;
    if (avail === 0) {
      equipmentLoadRatios[equipType] = Infinity;
    } else {
      equipmentLoadRatios[equipType] = loadMins / (avail * effectiveWindowMinutes);
    }
  }

  const bottleneckEquipmentTypes = Object.entries(equipmentLoadRatios)
    .filter(([, r]) => r > 0.8)
    .map(([t]) => t as EquipmentType);

  // Staff load
  const staffLoadMinutes: Record<string, number> = {};
  for (const task of activeTasks) {
    if (task.staffRole) {
      staffLoadMinutes[task.staffRole] =
        (staffLoadMinutes[task.staffRole] ?? 0) + task.estimatedMinutes * task.staffCount;
    }
  }

  const availableStaffMap = new Map<string, number>(
    availableStaff.map((s) => [s.role, s.count]),
  );

  const staffLoadRatios: Record<string, number> = {};
  for (const [role, loadMins] of Object.entries(staffLoadMinutes)) {
    const avail = availableStaffMap.get(role) ?? 0;
    if (avail === 0) {
      staffLoadRatios[role] = Infinity;
    } else {
      staffLoadRatios[role] = loadMins / (avail * effectiveWindowMinutes);
    }
  }

  const bottleneckStaffRoles = Object.entries(staffLoadRatios)
    .filter(([, r]) => r > 0.8)
    .map(([role]) => role);

  // Feasibility decision
  const anyEquipOver1 = Object.values(equipmentLoadRatios).some((r) => r > 1.0);
  const anyStaffOver1 = Object.values(staffLoadRatios).some((r) => r > 1.0);
  const anyEquipOver08 = Object.values(equipmentLoadRatios).some((r) => r > 0.8);
  const anyStaffOver08 = Object.values(staffLoadRatios).some((r) => r > 0.8);

  let feasibilityStatus: FeasibilityStatus;
  let riskLevel: CapacityRiskLevel;

  if (anyEquipOver1 || anyStaffOver1) {
    feasibilityStatus = 'notRecommended';
    riskLevel = 'high';
  } else if (anyEquipOver08 || anyStaffOver08) {
    feasibilityStatus = 'risky';
    riskLevel = 'medium';
  } else {
    feasibilityStatus = 'feasible';
    riskLevel = 'low';
  }

  // Supplementary fields
  const estimatedTotalTaskMinutes = activeTasks.reduce(
    (sum, t) => sum + t.estimatedMinutes,
    0,
  );
  const parallelizableTaskCount = activeTasks.filter((t) => t.canRunInParallel).length;
  const parallelizationRatio = parallelizableTaskCount / activeTasks.length;
  const dependencyEdgeCount = activeTasks.reduce(
    (sum, t) => sum + t.dependsOnTaskIds.length,
    0,
  );
  const maxDependencyCountPerTask = activeTasks.reduce(
    (max, t) => Math.max(max, t.dependsOnTaskIds.length),
    0,
  );
  const maxSequence = activeTasks.reduce((max, t) => Math.max(max, t.sequence), 0);
  const lastMinuteTaskCount = activeTasks.filter((t) => t.sequence === maxSequence).length;

  const sequenceRiskNotes: string[] = [];
  if (maxDependencyCountPerTask >= 3) {
    sequenceRiskNotes.push(`單一任務最多相依 ${maxDependencyCountPerTask} 個前置任務，請人工確認執行順序`);
  }
  if (dependencyEdgeCount > activeTasks.length) {
    sequenceRiskNotes.push(`相依邊數 (${dependencyEdgeCount}) 超過任務數，依賴鏈較複雜`);
  }

  const manualReviewNotes: string[] = [];
  for (const [equipType, ratio] of Object.entries(equipmentLoadRatios)) {
    if (!isFinite(ratio)) {
      manualReviewNotes.push(`設備 ${equipType} 無可用數量，請人工確認資源`);
    } else if (ratio > 1.0) {
      manualReviewNotes.push(
        `設備 ${equipType} 負載率 ${Math.round(ratio * 100)}%，超過容量上限，請人工確認`,
      );
    }
  }
  for (const [role, ratio] of Object.entries(staffLoadRatios)) {
    if (!isFinite(ratio)) {
      manualReviewNotes.push(`人員 ${role} 無可用人數，請人工確認資源`);
    } else if (ratio > 1.0) {
      manualReviewNotes.push(
        `人員 ${role} 負載率 ${Math.round(ratio * 100)}%，超過容量上限，請人工確認`,
      );
    }
  }

  return {
    feasibilityStatus,
    riskLevel,
    activeTaskCount: activeTasks.length,
    capacityWindowMinutes,
    estimatedTotalTaskMinutes,
    estimatedCriticalEquipmentMinutes: equipmentLoadMinutes,
    equipmentLoadRatios,
    staffLoadRatios,
    bottleneckEquipmentTypes,
    bottleneckStaffRoles,
    lastMinuteTaskCount,
    parallelizableTaskCount,
    parallelizationRatio,
    dependencyEdgeCount,
    maxDependencyCountPerTask,
    sequenceRiskNotes,
    manualReviewNotes,
  };
}

function validateInput(input: CapacityFeasibilityInput): void {
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

export async function createCapacityFeasibilityCheck(
  db: Firestore,
  planId: string,
  input: CapacityFeasibilityInput,
  uid: string,
): Promise<CapacityFeasibilityCheck> {
  validateInput(input);

  const plan = await getProductionWorkflowPlan(db, planId);
  const result = calculateCapacityFeasibility(plan, input);

  const docData = {
    sourceProductionWorkflowPlanId: planId,
    sourceProductionWorkflowPlanNameSnapshot: plan.planName,
    targetServiceDateTime: Timestamp.fromDate(input.targetServiceDateTime),
    capacityWindowMinutes: input.capacityWindowMinutes,
    bufferMinutes: input.bufferMinutes,
    availableStaff: input.availableStaff,
    availableEquipment: input.availableEquipment,
    result,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };

  const ref = await addDoc(collection(db, 'capacityFeasibilityChecks'), docData);

  return {
    id: ref.id,
    sourceProductionWorkflowPlanId: planId,
    sourceProductionWorkflowPlanNameSnapshot: plan.planName,
    targetServiceDateTime: Timestamp.fromDate(input.targetServiceDateTime),
    capacityWindowMinutes: input.capacityWindowMinutes,
    bufferMinutes: input.bufferMinutes,
    availableStaff: input.availableStaff,
    availableEquipment: input.availableEquipment,
    result,
    createdBy: uid,
  };
}

export async function listCapacityFeasibilityChecks(
  db: Firestore,
  planId: string,
): Promise<CapacityFeasibilityCheck[]> {
  const q = query(
    collection(db, 'capacityFeasibilityChecks'),
    where('sourceProductionWorkflowPlanId', '==', planId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CapacityFeasibilityCheck, 'id'>),
  }));
}
