/**
 * recipeMenuService — CRUD for recipe menus on `/recipeMenus/{menuId}`
 * (Feature 012: 菜單引用配方).
 *
 * Each menu recipe item references `/recipes/{recipeId}` (must be active).
 * `recipeNameSnapshot` is derived server-side and never trusted from client
 * input.
 *
 * No delete is exposed — menus are deactivated via `isActive`, never removed.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { MenuDraft, Recipe, RecipeMenu, RecipeMenuItem } from './types';

const COLLECTION = 'recipeMenus';

/** A single recipe line supplied by the caller when creating/editing a menu. */
export interface RecipeMenuItemInput {
  recipeId: string;
  servings: number;
  notes?: string;
}

/** Fields a user can supply when creating or editing a recipe menu. */
export interface RecipeMenuInput {
  name: string;
  date: string;
  mealType: string;
  isActive: boolean;
  notes?: string;
  menuRecipes: RecipeMenuItemInput[];
}

export async function listMenus(
  db: Firestore,
  options: { includeInactive?: boolean } = {},
): Promise<RecipeMenu[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecipeMenu));
  const filtered = options.includeInactive ? all : all.filter((m) => m.isActive !== false);
  return filtered.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'zh-TW'));
}

export async function getMenu(db: Firestore, id: string): Promise<RecipeMenu | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RecipeMenu;
}

/**
 * Resolves each input recipe line against `/recipes/{recipeId}`, validating
 * it exists, is active, and that servings > 0. Throws a descriptive Error on
 * any failure — the whole save is rejected.
 */
export async function resolveMenuRecipes(
  db: Firestore,
  items: RecipeMenuItemInput[],
): Promise<RecipeMenuItem[]> {
  const resolved: RecipeMenuItem[] = [];

  for (const item of items) {
    if (!(item.servings > 0)) {
      throw new Error(`份數必須大於 0（配方 ID: ${item.recipeId}）`);
    }

    const snap = await getDoc(doc(db, 'recipes', item.recipeId));
    if (!snap.exists()) {
      throw new Error(`找不到配方（ID: ${item.recipeId}）`);
    }

    const recipeData = snap.data() as Recipe;
    if (recipeData.isActive !== true) {
      throw new Error(`配方「${recipeData.name ?? item.recipeId}」已停用，無法用於菜單`);
    }

    resolved.push({
      recipeId: item.recipeId,
      recipeNameSnapshot: recipeData.name,
      servings: item.servings,
      ...(item.notes ? { notes: item.notes } : {}),
    });
  }

  return resolved;
}

export async function createMenu(
  db: Firestore,
  input: RecipeMenuInput,
  uid: string,
): Promise<string> {
  const menuRecipes = await resolveMenuRecipes(db, input.menuRecipes);

  const ref = await addDoc(collection(db, COLLECTION), {
    name: input.name,
    date: input.date,
    mealType: input.mealType,
    menuRecipes,
    isActive: input.isActive,
    notes: input.notes ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateMenu(
  db: Firestore,
  id: string,
  input: RecipeMenuInput,
  uid: string,
): Promise<void> {
  const menuRecipes = await resolveMenuRecipes(db, input.menuRecipes);

  // createdAt / createdBy are preserved automatically — we never write them
  // here, so the existing values on the document remain untouched.
  await updateDoc(doc(db, COLLECTION, id), {
    name: input.name,
    date: input.date,
    mealType: input.mealType,
    menuRecipes,
    isActive: input.isActive,
    notes: input.notes ?? '',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export interface MenuFromApprovedDraftInput {
  date: string;
  mealType: string;
}

/**
 * Feature 022: manual approval/conversion of a menuDraft into an official
 * recipeMenu. Always re-reads the source /menuDrafts/{draftId} document from
 * Firestore — never trusts a client-supplied MenuDraft object.
 *
 * Writes to the deterministic id recipeMenus/{draftId}. Duplicate conversion
 * is prevented at the Firestore Rules layer: once a recipeMenus doc carries
 * sourceMenuDraftId, further updates to it are rejected, so a second
 * conversion attempt (which would be classified as an update) fails server-side.
 */
export async function createMenuFromApprovedDraft(
  db: Firestore,
  draftId: string,
  input: MenuFromApprovedDraftInput,
  uid: string,
): Promise<RecipeMenu> {
  const draftSnap = await getDoc(doc(db, 'menuDrafts', draftId));
  if (!draftSnap.exists()) {
    throw new Error(`menuDraft ${draftId} not found`);
  }
  const draft = { id: draftSnap.id, ...(draftSnap.data() as Omit<MenuDraft, 'id'>) };

  if (draft.items.length === 0) {
    throw new Error('Cannot create a menu from a draft with no items');
  }
  if (!input.date || !input.mealType) {
    throw new Error('date and mealType are required');
  }

  const menuRecipes = await resolveMenuRecipes(
    db,
    draft.items.map((item) => ({ recipeId: item.recipeId, servings: item.servingCount })),
  );

  const docData: Omit<RecipeMenu, 'id'> = {
    name: draft.menuName,
    date: input.date,
    mealType: input.mealType,
    menuRecipes,
    isActive: true,
    notes: draft.notes ?? '',
    createdAt: serverTimestamp() as unknown as RecipeMenu['createdAt'],
    updatedAt: serverTimestamp() as unknown as RecipeMenu['updatedAt'],
    createdBy: uid,
    updatedBy: uid,
    sourceMenuDraftId: draft.id,
    sourceMenuDraftSnapshot: {
      menuName: draft.menuName,
      sourceRecommendationId: draft.sourceRecommendationId,
      sourceRecommendationStatusSnapshot: draft.sourceRecommendationStatusSnapshot,
      items: draft.items.map((item) => ({
        recipeId: item.recipeId,
        recipeNameSnapshot: item.recipeNameSnapshot,
        servingCount: item.servingCount,
        suggestedRatioSnapshot: item.suggestedRatioSnapshot,
        ...(item.primaryProcessTypeSnapshot ? { primaryProcessTypeSnapshot: item.primaryProcessTypeSnapshot } : {}),
        ...(item.primaryEquipmentTypeSnapshot ? { primaryEquipmentTypeSnapshot: item.primaryEquipmentTypeSnapshot } : {}),
      })),
    },
    manualApprovalAcknowledgement: true,
  };

  const ref = doc(db, COLLECTION, draftId);
  await setDoc(ref, docData, { merge: false });
  return { id: draftId, ...docData };
}

export async function setMenuActive(
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
