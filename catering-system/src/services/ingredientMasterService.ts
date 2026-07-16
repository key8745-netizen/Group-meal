/**
 * ingredientMasterService — CRUD for ingredient master data on the existing
 * `/ingredients/{ingredientId}` collection (Feature 010: 食材主檔管理).
 *
 * No delete is exposed — ingredients are deactivated via `isActive`, never
 * removed. `normalizedName` is always computed server-side from `name`,
 * never trusted from client input.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { IngredientBaseUnit, IngredientMaster, StorageType } from './types';
import { normalizeIngredientName } from '@/utils/normalizeIngredientName';

const COLLECTION = 'ingredients';

/** Fields a user can supply when creating or editing an ingredient. */
export interface IngredientMasterInput {
  name: string;
  category: string;
  baseUnit: IngredientBaseUnit;
  purchaseUnit: string;
  conversionFactorToBaseUnit: number;
  defaultPrice: number;
  defaultPriceUnit: string;
  supplierId?: string | null;
  notes?: string;
  /** Feature 032: crop name used to match this ingredient against the MOA AMIS wholesale market price API. */
  marketCropName?: string | null;
  /** Feature 057: 安全庫存（kg）；0 = 不追蹤。 */
  minStockLevel?: number;
  // Feature 071: 保鮮參數（選填）。
  isPerishable?: boolean;
  defaultStorageType?: StorageType;
  shelfLifeDaysChilled?: number;
  shelfLifeDaysFrozen?: number;
  shelfLifeDaysAmbient?: number;
  warnThresholdDays?: number;
  criticalThresholdDays?: number;
  /** Feature 079: 加工延壽預設良率。 */
  processedYieldRatio?: number;
}

/**
 * Feature 071: 組出要寫入的保鮮欄位。Firestore 不接受 undefined——僅包含「有值」的
 * 欄位（表單優先，未提供則沿用既有值），故 create 傳空的 existing。
 */
function freshnessWriteFields(
  input: IngredientMasterInput,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.isPerishable = typeof input.isPerishable === 'boolean'
    ? input.isPerishable
    : (typeof existing.isPerishable === 'boolean' ? existing.isPerishable : true);
  const st = input.defaultStorageType ?? (existing.defaultStorageType as StorageType | undefined);
  if (st) out.defaultStorageType = st;
  const num = (v: number | undefined, key: string) => {
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof existing[key] === 'number') out[key] = existing[key];
  };
  num(input.shelfLifeDaysChilled, 'shelfLifeDaysChilled');
  num(input.shelfLifeDaysFrozen, 'shelfLifeDaysFrozen');
  num(input.shelfLifeDaysAmbient, 'shelfLifeDaysAmbient');
  num(input.warnThresholdDays, 'warnThresholdDays');
  num(input.criticalThresholdDays, 'criticalThresholdDays');
  num(input.processedYieldRatio, 'processedYieldRatio');
  return out;
}

export async function listIngredients(
  db: Firestore,
  options: { includeInactive?: boolean } = {},
): Promise<IngredientMaster[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as IngredientMaster));
  const filtered = options.includeInactive ? all : all.filter((i) => i.isActive !== false);
  return filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
}

export async function createIngredient(
  db: Firestore,
  input: IngredientMasterInput,
  uid: string,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    name: input.name,
    normalizedName: normalizeIngredientName(input.name),
    category: input.category,
    baseUnit: input.baseUnit,
    purchaseUnit: input.purchaseUnit,
    conversionFactorToBaseUnit: input.conversionFactorToBaseUnit,
    defaultPrice: input.defaultPrice,
    defaultPriceUnit: input.defaultPriceUnit,
    supplierId: input.supplierId ?? null,
    notes: input.notes ?? '',
    marketCropName: input.marketCropName ?? null,
    minStockLevel: input.minStockLevel ?? 0,
    ...freshnessWriteFields(input),
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

/**
 * Legacy fields (pre-Feature-010 pipeline) that must survive an edit when
 * present on the existing document. Anything NOT in this list and not part of
 * the master schema is intentionally dropped on save, because the security
 * rules' field allow-list rejects documents carrying unknown fields — legacy
 * docs with stray fields were otherwise impossible to edit at all.
 */
const LEGACY_CARRYOVER_FIELDS = [
  'id', 'unit', 'unitCost', 'minStockLevel', 'supplierIds',
  'wasteFactor', 'isOcr', 'verified',
] as const;

export async function updateIngredient(
  db: Firestore,
  id: string,
  input: IngredientMasterInput,
  uid: string,
): Promise<void> {
  // Full-document replacement (setDoc without merge) instead of updateDoc:
  // legacy documents can be missing required schema fields or carry stray
  // ones, and a partial update leaves those in place, which the security
  // rules then reject. Rewriting the whole document guarantees the saved doc
  // is schema-complete. createdAt/createdBy are preserved when present and
  // backfilled otherwise (the rules tolerate backfill on legacy docs).
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(`找不到食材（ID: ${id}）`);
  }
  const existing = snap.data();

  const carryover: Record<string, unknown> = {};
  for (const field of LEGACY_CARRYOVER_FIELDS) {
    if (existing[field] !== undefined) carryover[field] = existing[field];
  }

  await setDoc(ref, {
    ...carryover,
    name: input.name,
    normalizedName: normalizeIngredientName(input.name),
    category: input.category,
    baseUnit: input.baseUnit,
    purchaseUnit: input.purchaseUnit,
    conversionFactorToBaseUnit: input.conversionFactorToBaseUnit,
    defaultPrice: input.defaultPrice,
    defaultPriceUnit: input.defaultPriceUnit,
    supplierId: input.supplierId ?? null,
    notes: input.notes ?? '',
    marketCropName: input.marketCropName ?? null,
    // Feature 057: 表單值優先；未提供時保留既有值（含舊資料）。單位為 kg。
    minStockLevel: input.minStockLevel ?? (typeof existing.minStockLevel === 'number' ? existing.minStockLevel : 0),
    // Feature 071: 保鮮參數（表單優先，未提供沿用既有）。
    ...freshnessWriteFields(input, existing),
    isActive: existing.isActive !== false,
    createdAt: existing.createdAt ?? serverTimestamp(),
    createdBy: existing.createdBy ?? uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function setIngredientActive(
  db: Firestore,
  id: string,
  isActive: boolean,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    isActive,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
