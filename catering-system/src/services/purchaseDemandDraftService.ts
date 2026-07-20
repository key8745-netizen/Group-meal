/**
 * purchaseDemandDraftService — CRUD for purchase demand drafts on
 * `/purchaseDemandDrafts/{draftId}` (Feature 014: 採購需求草稿).
 *
 * A purchase demand draft is derived from a `/prepPlans/{sourcePrepPlanId}`
 * document at creation time: each `prepItems[]` entry becomes a
 * `PurchaseDemandDraftItem` with `demandQuantity` initialized to
 * `requiredBaseQuantity`.
 *
 * `status` and `isActive` must always be set together:
 *   status === 'draft'    <=> isActive === true
 *   status === 'archived' <=> isActive === false
 *
 * No delete is exposed — drafts are archived via `archiveDraft`, never
 * removed.
 */

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
  PurchaseDemandDraft,
  PurchaseDemandDraftItem,
  PurchaseDemandDraftWorkflowStatus,
} from './types';

const COLLECTION = 'purchaseDemandDrafts';

/** Fields a user can supply when creating a draft from a prep plan. */
export interface CreateDraftFromPrepPlanInput {
  draftName: string;
  sourcePrepPlanId: string;
  notes?: string;
}

/** Per-item fields a user can edit on an existing draft. */
export interface UpdateDraftItemInput {
  ingredientId: string;
  baseUnit: PurchaseDemandDraftItem['baseUnit'];
  demandQuantity: number;
  notes?: string;
}

/** Fields a user can edit on an existing draft. */
export interface UpdateDraftInput {
  draftName: string;
  notes?: string;
  items: UpdateDraftItemInput[];
}

export async function listPurchaseDemandDrafts(
  db: Firestore,
  options: { includeInactive?: boolean } = {},
): Promise<PurchaseDemandDraft[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseDemandDraft));
  const filtered = options.includeInactive ? all : all.filter((d) => d.isActive !== false);
  return filtered.sort((a, b) => a.draftName.localeCompare(b.draftName, 'zh-TW'));
}

export async function getPurchaseDemandDraft(db: Firestore, id: string): Promise<PurchaseDemandDraft> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) {
    throw new Error(`找不到採購需求草稿（ID: ${id}）`);
  }
  return { id: snap.id, ...snap.data() } as PurchaseDemandDraft;
}

export async function createDraftFromPrepPlan(
  db: Firestore,
  input: CreateDraftFromPrepPlanInput,
  uid: string,
): Promise<string> {
  const prepPlanSnap = await getDoc(doc(db, 'prepPlans', input.sourcePrepPlanId));
  if (!prepPlanSnap.exists()) {
    throw new Error(`找不到備料規劃（ID: ${input.sourcePrepPlanId}）`);
  }
  const prepPlan = { id: prepPlanSnap.id, ...prepPlanSnap.data() } as PrepPlan;

  for (const prepItem of prepPlan.prepItems ?? []) {
    if (!(prepItem.requiredBaseQuantity > 0)) {
      throw new Error(`食材「${prepItem.ingredientNameSnapshot}」的所需數量必須大於 0`);
    }
  }

  const items: PurchaseDemandDraftItem[] = (prepPlan.prepItems ?? []).map((prepItem) => ({
    ingredientId: prepItem.ingredientId,
    ingredientNameSnapshot: prepItem.ingredientNameSnapshot,
    demandQuantity: prepItem.requiredBaseQuantity,
    baseUnit: prepItem.baseUnit,
    sourceRequiredBaseQuantity: prepItem.requiredBaseQuantity,
    prepPlanTraceability: {
      prepPlanId: input.sourcePrepPlanId,
      prepPlanNameSnapshot: prepPlan.name,
    },
    // notes 省略——Firestore（未開 ignoreUndefinedProperties）拒收 undefined 欄位值。
  }));

  const ref = await addDoc(collection(db, COLLECTION), {
    draftName: input.draftName,
    sourcePrepPlanId: input.sourcePrepPlanId,
    sourcePrepPlanNameSnapshot: prepPlan.name,
    status: 'draft',
    items,
    isActive: true,
    workflowStatus: 'draft',
    notes: input.notes ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateDraft(
  db: Firestore,
  id: string,
  input: UpdateDraftInput,
  uid: string,
): Promise<void> {
  const existing = await getPurchaseDemandDraft(db, id);

  const items: PurchaseDemandDraftItem[] = existing.items.map((existingItem) => {
    const edited = input.items.find(
      (i) => i.ingredientId === existingItem.ingredientId && i.baseUnit === existingItem.baseUnit,
    );
    // 丟掉既有的 notes，再依編輯結果決定是否帶回——避免寫入 undefined（Firestore 拒收）。
    const { notes: _prevNotes, ...rest } = existingItem;
    const noteVal = edited ? edited.notes : existingItem.notes;
    return {
      ...rest,
      demandQuantity: edited ? edited.demandQuantity : existingItem.demandQuantity,
      ...(typeof noteVal === 'string' && noteVal.length > 0 ? { notes: noteVal } : {}),
    };
  });

  await updateDoc(doc(db, COLLECTION, id), {
    draftName: input.draftName,
    sourcePrepPlanId: existing.sourcePrepPlanId,
    sourcePrepPlanNameSnapshot: existing.sourcePrepPlanNameSnapshot,
    status: existing.status,
    items,
    isActive: existing.isActive,
    workflowStatus: existing.workflowStatus ?? 'draft',
    notes: input.notes ?? '',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function archiveDraft(
  db: Firestore,
  id: string,
  archived: boolean,
  uid: string,
): Promise<void> {
  const existing = await getPurchaseDemandDraft(db, id);
  await updateDoc(doc(db, COLLECTION, id), {
    status: archived ? 'archived' : 'draft',
    isActive: !archived,
    workflowStatus: existing.workflowStatus ?? 'draft',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/**
 * Update only the human-managed procurement workflow marker.
 * Does not modify status/isActive or any other draft fields.
 */
export async function updateDraftWorkflowStatus(
  db: Firestore,
  id: string,
  workflowStatus: PurchaseDemandDraftWorkflowStatus,
  uid: string,
): Promise<void> {
  const existing = await getPurchaseDemandDraft(db, id);
  await updateDoc(doc(db, COLLECTION, id), {
    draftName: existing.draftName,
    sourcePrepPlanId: existing.sourcePrepPlanId,
    sourcePrepPlanNameSnapshot: existing.sourcePrepPlanNameSnapshot,
    status: existing.status,
    items: existing.items,
    isActive: existing.isActive,
    workflowStatus,
    notes: existing.notes ?? '',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
