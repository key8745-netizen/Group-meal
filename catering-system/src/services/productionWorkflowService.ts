import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type {
  PrepPlan,
  ProductionWorkflowPlan,
  ProductionWorkflowTask,
} from './types';

const COLLECTION = 'productionWorkflowPlans';

export interface CreateWorkflowPlanInput {
  planName: string;
  serviceDate?: string;
  notes?: string;
}

export interface UpdateWorkflowPlanInput {
  planName: string;
  serviceDate?: string;
  notes?: string;
  tasks: ProductionWorkflowTask[];
}

export async function listProductionWorkflowPlans(
  db: Firestore,
  options: { includeInactive?: boolean } = {},
): Promise<ProductionWorkflowPlan[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionWorkflowPlan));
  const filtered = options.includeInactive ? all : all.filter((p) => p.isActive !== false);
  return filtered.sort((a, b) => a.planName.localeCompare(b.planName, 'zh-TW'));
}

export async function getProductionWorkflowPlan(
  db: Firestore,
  id: string,
): Promise<ProductionWorkflowPlan> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) {
    throw new Error(`找不到製程規劃（ID: ${id}）`);
  }
  return { id: snap.id, ...snap.data() } as ProductionWorkflowPlan;
}

export async function createProductionWorkflowPlanFromPrepPlan(
  db: Firestore,
  prepPlanId: string,
  input: CreateWorkflowPlanInput,
  uid: string,
): Promise<string> {
  const prepPlanSnap = await getDoc(doc(db, 'prepPlans', prepPlanId));
  if (!prepPlanSnap.exists()) {
    throw new Error(`找不到備料快照（ID: ${prepPlanId}）`);
  }
  const prepPlan = { id: prepPlanSnap.id, ...prepPlanSnap.data() } as PrepPlan;

  const ref = await addDoc(collection(db, COLLECTION), {
    sourcePrepPlanId: prepPlanId,
    sourcePrepPlanNameSnapshot: prepPlan.name,
    planName: input.planName,
    serviceDate: input.serviceDate ?? '',
    status: 'draft',
    isActive: true,
    tasks: [],
    notes: input.notes ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateProductionWorkflowPlan(
  db: Firestore,
  id: string,
  input: UpdateWorkflowPlanInput,
  uid: string,
): Promise<void> {
  const existing = await getProductionWorkflowPlan(db, id);

  const existingIds = new Set(existing.tasks.map((t) => t.id));
  const incomingIds = new Set(input.tasks.map((t) => t.id));
  for (const existingId of existingIds) {
    if (!incomingIds.has(existingId)) {
      throw new Error(`已儲存的任務（ID: ${existingId}）不可移除，只能將 taskStatus 設為 archived。`);
    }
  }

  await updateDoc(doc(db, COLLECTION, id), {
    sourcePrepPlanId: existing.sourcePrepPlanId,
    sourcePrepPlanNameSnapshot: existing.sourcePrepPlanNameSnapshot,
    planName: input.planName,
    serviceDate: input.serviceDate ?? '',
    status: existing.status,
    isActive: existing.isActive,
    tasks: input.tasks,
    notes: input.notes ?? '',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function archiveProductionWorkflowPlan(
  db: Firestore,
  id: string,
  isArchived: boolean,
  uid: string,
): Promise<void> {
  const existing = await getProductionWorkflowPlan(db, id);
  await updateDoc(doc(db, COLLECTION, id), {
    sourcePrepPlanId: existing.sourcePrepPlanId,
    sourcePrepPlanNameSnapshot: existing.sourcePrepPlanNameSnapshot,
    planName: existing.planName,
    serviceDate: existing.serviceDate ?? '',
    status: isArchived ? 'archived' : 'draft',
    isActive: !isArchived,
    tasks: existing.tasks,
    notes: existing.notes ?? '',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
