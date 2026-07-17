/**
 * recipeService — CRUD for recipes on the new `/recipes/{recipeId}` collection
 * (Feature 011: 配方引用食材主檔).
 *
 * Each recipe ingredient item references `/ingredients/{ingredientId}` (must
 * be active). The unit chosen for an item must match either the ingredient's
 * `baseUnit` or `purchaseUnit` — `baseQuantity`/`baseUnit` are derived
 * server-side and never trusted from client input.
 *
 * No delete is exposed — recipes are deactivated via `isActive`, never
 * removed.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { DishCategory, Ingredient, Recipe, RecipeIngredientItem } from './types';

const COLLECTION = 'recipes';

/** A single ingredient line supplied by the caller when creating/editing a recipe. */
export interface RecipeIngredientInput {
  ingredientId: string;
  quantity: number;
  unit: string;
  notes?: string;
}

/** Fields a user can supply when creating or editing a recipe. */
export interface RecipeInput {
  name: string;
  isActive: boolean;
  notes?: string;
  recipeIngredients: RecipeIngredientInput[];
  /** Feature 089: 菜色類別（選填）。 */
  category?: DishCategory;
}

export async function listRecipes(
  db: Firestore,
  options: { includeInactive?: boolean } = {},
): Promise<Recipe[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Recipe));
  const filtered = options.includeInactive ? all : all.filter((r) => r.isActive !== false);
  return filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
}

export async function getRecipe(db: Firestore, id: string): Promise<Recipe | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Recipe;
}

/**
 * Resolves each input ingredient line against `/ingredients/{ingredientId}`,
 * validating it exists, is active, and that the chosen unit matches either
 * the ingredient's baseUnit or purchaseUnit. Throws a descriptive Error on
 * any failure — the whole save is rejected.
 */
async function resolveRecipeIngredients(
  db: Firestore,
  items: RecipeIngredientInput[],
): Promise<RecipeIngredientItem[]> {
  const resolved: RecipeIngredientItem[] = [];

  for (const item of items) {
    if (!(item.quantity > 0)) {
      throw new Error(`數量必須大於 0（食材 ID: ${item.ingredientId}）`);
    }

    const snap = await getDoc(doc(db, 'ingredients', item.ingredientId));
    if (!snap.exists()) {
      throw new Error(`找不到食材（ID: ${item.ingredientId}）`);
    }

    const ingredientData = snap.data() as Ingredient;
    if (ingredientData.isActive !== true) {
      throw new Error(`食材「${ingredientData.name ?? item.ingredientId}」已停用，無法用於配方`);
    }
    if (!ingredientData.baseUnit) {
      throw new Error(`食材「${ingredientData.name}」缺少基本單位設定，無法用於配方`);
    }

    let baseQuantity: number;
    let baseUnit: RecipeIngredientItem['baseUnit'];

    if (item.unit === ingredientData.baseUnit) {
      baseQuantity = item.quantity;
      baseUnit = ingredientData.baseUnit;
    } else if (item.unit === ingredientData.purchaseUnit) {
      baseQuantity = item.quantity * (ingredientData.conversionFactorToBaseUnit ?? 0);
      baseUnit = ingredientData.baseUnit;
    } else {
      throw new Error(
        `食材「${ingredientData.name}」的單位「${item.unit}」不符 — unit must match the ingredient's baseUnit (${ingredientData.baseUnit}) or purchaseUnit (${ingredientData.purchaseUnit})`,
      );
    }

    if (!baseUnit || !(baseQuantity > 0)) {
      throw new Error(`食材「${ingredientData.name}」的基本單位設定不完整，無法換算`);
    }

    resolved.push({
      ingredientId: item.ingredientId,
      ingredientNameSnapshot: ingredientData.name,
      quantity: item.quantity,
      unit: item.unit,
      baseQuantity,
      baseUnit,
      ...(item.notes ? { notes: item.notes } : {}),
    });
  }

  return resolved;
}

export async function createRecipe(
  db: Firestore,
  input: RecipeInput,
  uid: string,
): Promise<string> {
  const recipeIngredients = await resolveRecipeIngredients(db, input.recipeIngredients);

  const ref = await addDoc(collection(db, COLLECTION), {
    name: input.name,
    recipeIngredients,
    isActive: input.isActive,
    notes: input.notes ?? '',
    ...(input.category ? { category: input.category } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateRecipe(
  db: Firestore,
  id: string,
  input: RecipeInput,
  uid: string,
): Promise<void> {
  const recipeIngredients = await resolveRecipeIngredients(db, input.recipeIngredients);

  // createdAt / createdBy are preserved automatically — we never write them
  // here, so the existing values on the document remain untouched.
  await updateDoc(doc(db, COLLECTION, id), {
    name: input.name,
    recipeIngredients,
    isActive: input.isActive,
    notes: input.notes ?? '',
    // Feature 089: 設了寫入類別；清空則移除欄位（維持規則白名單相容）。
    category: input.category ? input.category : deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function setRecipeActive(
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
