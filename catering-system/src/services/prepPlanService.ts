/**
 * prepPlanService — CRUD for prep plans on `/prepPlans/{prepPlanId}`
 * (Feature 013: 備料規劃引用菜單配方).
 *
 * A prep plan is derived from a `/recipeMenus/{sourceRecipeMenuId}` document
 * at creation time: for each recipe referenced by the menu, its
 * `recipeIngredients[]` (baseQuantity) are scaled by the menu's `servings`
 * and aggregated across recipes by `ingredientId + baseUnit`.
 *
 * `prepItems` and `sourceRecipeMenuId` are immutable after creation — only
 * `name`, `date`, and `notes` may be edited.
 *
 * No delete is exposed — prep plans are deactivated via `isActive`, never
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
  PrepPlanItem,
  PrepPlanRecipeContribution,
  Recipe,
  RecipeMenu,
} from './types';

const COLLECTION = 'prepPlans';

/** Fields a user can supply when creating a prep plan. */
export interface CreatePrepPlanInput {
  name: string;
  date: string;
  sourceRecipeMenuId: string;
  notes?: string;
}

/** Fields a user can edit on an existing prep plan. */
export interface UpdatePrepPlanInput {
  name: string;
  date: string;
  notes?: string;
}

export async function listPrepPlans(
  db: Firestore,
  options: { includeInactive?: boolean } = {},
): Promise<PrepPlan[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PrepPlan));
  const filtered = options.includeInactive ? all : all.filter((p) => p.isActive !== false);
  return filtered.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'zh-TW'));
}

export async function getPrepPlan(db: Firestore, id: string): Promise<PrepPlan | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PrepPlan;
}

/**
 * Builds `prepItems` by expanding each recipe referenced by the source
 * recipe menu for its configured `servings`, then aggregating the resulting
 * ingredient quantities by `ingredientId + baseUnit`.
 *
 * Throws a descriptive Error on any missing/invalid data — the whole save is
 * rejected.
 */
async function buildPrepItems(
  db: Firestore,
  menu: RecipeMenu,
): Promise<PrepPlanItem[]> {
  // key = `${ingredientId}__${baseUnit}`
  const itemsByKey = new Map<string, PrepPlanItem>();

  for (const menuRecipe of menu.menuRecipes ?? []) {
    if (!(menuRecipe.servings > 0)) {
      throw new Error(`份數必須大於 0（配方 ID: ${menuRecipe.recipeId}）`);
    }

    const recipeSnap = await getDoc(doc(db, 'recipes', menuRecipe.recipeId));
    if (!recipeSnap.exists()) {
      throw new Error(`找不到配方（ID: ${menuRecipe.recipeId}）`);
    }
    const recipe = { id: recipeSnap.id, ...recipeSnap.data() } as Recipe;

    for (const recipeIngredient of recipe.recipeIngredients ?? []) {
      if (!(recipeIngredient.baseQuantity > 0)) {
        throw new Error(
          `配方「${recipe.name}」的食材「${recipeIngredient.ingredientNameSnapshot}」基本數量必須大於 0`,
        );
      }

      const contributedBaseQuantity = recipeIngredient.baseQuantity * menuRecipe.servings;
      const key = `${recipeIngredient.ingredientId}__${recipeIngredient.baseUnit}`;

      const contribution: PrepPlanRecipeContribution = {
        recipeId: menuRecipe.recipeId,
        recipeNameSnapshot: recipe.name,
        sourceServings: menuRecipe.servings,
        contributedBaseQuantity,
        // Feature 100: 帶下配方指定的切法，供製程任務覆蓋類別範本刀工。
        ...(recipeIngredient.cutType ? { cutType: recipeIngredient.cutType } : {}),
      };

      const existing = itemsByKey.get(key);
      if (existing) {
        existing.requiredBaseQuantity += contributedBaseQuantity;
        existing.recipeContributions.push(contribution);
      } else {
        itemsByKey.set(key, {
          ingredientId: recipeIngredient.ingredientId,
          ingredientNameSnapshot: recipeIngredient.ingredientNameSnapshot,
          requiredBaseQuantity: contributedBaseQuantity,
          baseUnit: recipeIngredient.baseUnit,
          recipeContributions: [contribution],
        });
      }
    }
  }

  return Array.from(itemsByKey.values());
}

export async function createPrepPlanFromRecipeMenu(
  db: Firestore,
  input: CreatePrepPlanInput,
  uid: string,
): Promise<string> {
  const menuSnap = await getDoc(doc(db, 'recipeMenus', input.sourceRecipeMenuId));
  if (!menuSnap.exists()) {
    throw new Error(`找不到菜單（ID: ${input.sourceRecipeMenuId}）`);
  }
  const menu = { id: menuSnap.id, ...menuSnap.data() } as RecipeMenu;

  const prepItems = await buildPrepItems(db, menu);

  const ref = await addDoc(collection(db, COLLECTION), {
    name: input.name,
    sourceRecipeMenuId: input.sourceRecipeMenuId,
    sourceRecipeMenuNameSnapshot: menu.name,
    date: input.date,
    prepItems,
    isActive: true,
    notes: input.notes ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

export async function updatePrepPlan(
  db: Firestore,
  id: string,
  input: UpdatePrepPlanInput,
  uid: string,
): Promise<void> {
  // prepItems / sourceRecipeMenuId / sourceRecipeMenuNameSnapshot / isActive
  // are immutable here — createdAt / createdBy are preserved automatically
  // since we never write them.
  await updateDoc(doc(db, COLLECTION, id), {
    name: input.name,
    date: input.date,
    notes: input.notes ?? '',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function setPrepPlanActive(
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
