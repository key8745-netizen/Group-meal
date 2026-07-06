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
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { IngredientBaseUnit, IngredientMaster } from './types';
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
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateIngredient(
  db: Firestore,
  id: string,
  input: IngredientMasterInput,
  uid: string,
): Promise<void> {
  // createdAt / createdBy are preserved automatically — we never write them
  // here, so the existing values on the document remain untouched.
  await updateDoc(doc(db, COLLECTION, id), {
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
