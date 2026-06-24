/**
 * menuFinalizationService — Feature 028 (匯入月菜單轉正式營運菜單).
 *
 * Converts a reviewed `/menuImportBatches/{batchId}` into operational
 * `/recipeMenus/{menuId}` docs (Feature 012's existing collection), grouped
 * by (date, mealType). Purely additive: never creates recipes/ingredients,
 * never alters RecipeMenuItem's required `recipeId` cardinality — only
 * `matchStatus === 'mapped'` items are converted.
 */

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { MatchStatus, MenuImportBatch, MenuImportItem, Recipe, RecipeMenu, RecipeMenuItem } from './types';

const BATCHES = 'menuImportBatches';
const RECIPE_MENUS = 'recipeMenus';

export interface FinalizeEligibility {
  eligible: boolean;
  blockedReasons: string[];
  statusCounts: Record<MatchStatus, number>;
  alreadyFinalized: boolean;
}

/**
 * Pure, synchronous eligibility check — no Firestore reads. Blocks unless
 * the batch is in `finalized` import status, has not already been
 * operationally finalized, has at least one item, and has zero items left
 * in `unmatched` / `pending_review` / `unresolved` (rejected items are
 * simply excluded from conversion, not blockers).
 */
export function evaluateOperationalFinalizeEligibility(
  batch: MenuImportBatch,
  items: MenuImportItem[],
): FinalizeEligibility {
  const statusCounts: Record<MatchStatus, number> = {
    unmatched: 0,
    pending_review: 0,
    mapped: 0,
    rejected: 0,
    unresolved: 0,
  };
  for (const item of items) {
    statusCounts[item.matchStatus] = (statusCounts[item.matchStatus] ?? 0) + 1;
  }

  const blockedReasons: string[] = [];
  const alreadyFinalized = !!batch.operationalFinalizedAt;

  if (alreadyFinalized) {
    blockedReasons.push('此批次已轉為正式營運菜單，無法重複轉換');
  }
  if (batch.importStatus !== 'finalized') {
    blockedReasons.push(`批次狀態為「${batch.importStatus}」，須先完成審查並標記為已完成才能轉換`);
  }
  if (items.length === 0) {
    blockedReasons.push('批次沒有任何匯入項目');
  }
  if (statusCounts.unmatched > 0) {
    blockedReasons.push(`尚有 ${statusCounts.unmatched} 筆未比對項目`);
  }
  if (statusCounts.pending_review > 0) {
    blockedReasons.push(`尚有 ${statusCounts.pending_review} 筆待審查項目`);
  }
  if (statusCounts.unresolved > 0) {
    blockedReasons.push(`尚有 ${statusCounts.unresolved} 筆無法比對項目`);
  }
  if (statusCounts.mapped === 0 && blockedReasons.length === 0) {
    blockedReasons.push('沒有任何已比對成功的項目可供轉換');
  }

  return {
    eligible: blockedReasons.length === 0,
    blockedReasons,
    statusCounts,
    alreadyFinalized,
  };
}

export interface OperationalMenuConflict {
  date: string;
  mealType: string;
  existingMenuId: string;
  existingMenuSourceBatchId?: string;
}

/**
 * Queries `/recipeMenus` for an existing active doc matching each
 * (date, mealType) pair. Never mutates anything.
 */
export async function findOperationalMenuConflicts(
  db: Firestore,
  pairs: Array<{ date: string; mealType: string }>,
): Promise<OperationalMenuConflict[]> {
  const conflicts: OperationalMenuConflict[] = [];
  for (const { date, mealType } of pairs) {
    const snap = await getDocs(
      query(collection(db, RECIPE_MENUS), where('date', '==', date), where('mealType', '==', mealType)),
    );
    for (const d of snap.docs) {
      const menu = d.data() as RecipeMenu;
      if (menu.isActive === false) continue;
      conflicts.push({
        date,
        mealType,
        existingMenuId: d.id,
        existingMenuSourceBatchId: menu.sourceMenuImportBatchId,
      });
    }
  }
  return conflicts;
}

export interface FinalizeToOperationalMenuResult {
  createdMenuIds: string[];
  skippedExistingMenuIds: string[];
}

/**
 * Re-reads the batch and its items, re-validates eligibility server-side,
 * groups mapped items by (date, mealType), and creates one /recipeMenus doc
 * per group. The batch's `operationalFinalizedAt/By` is set only after all
 * group writes succeed, so a half-finished run never falsely marks the
 * batch as done; a retry detects this batch's own already-created menus
 * (matching `sourceMenuImportBatchId`) and skips recreating them.
 */
export async function finalizeToOperationalMenu(
  db: Firestore,
  batchId: string,
  uid: string,
): Promise<FinalizeToOperationalMenuResult> {
  const batchSnap = await getDoc(doc(db, BATCHES, batchId));
  if (!batchSnap.exists()) {
    throw new Error(`menuImportBatch ${batchId} not found`);
  }
  const batch = { id: batchSnap.id, ...(batchSnap.data() as Omit<MenuImportBatch, 'id'>) };

  const itemsSnap = await getDocs(collection(db, BATCHES, batchId, 'items'));
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuImportItem, 'id'>) }));

  const eligibility = evaluateOperationalFinalizeEligibility(batch, items);
  if (!eligibility.eligible) {
    throw new Error(`批次未符合轉換條件：${eligibility.blockedReasons.join('；')}`);
  }

  const mappedItems = items.filter((item) => item.matchStatus === 'mapped' && item.matchedRecipeId);

  const groups = new Map<string, { date: string; mealType: string; items: MenuImportItem[] }>();
  for (const item of mappedItems) {
    const key = `${item.date}__${item.mealType}`;
    if (!groups.has(key)) {
      groups.set(key, { date: item.date, mealType: item.mealType, items: [] });
    }
    groups.get(key)!.items.push(item);
  }

  const pairs = Array.from(groups.values()).map(({ date, mealType }) => ({ date, mealType }));
  const conflicts = await findOperationalMenuConflicts(db, pairs);

  const skippedExistingMenuIds: string[] = [];
  const groupsToCreate: Array<{ date: string; mealType: string; items: MenuImportItem[] }> = [];

  for (const group of groups.values()) {
    const matchingConflicts = conflicts.filter((c) => c.date === group.date && c.mealType === group.mealType);
    const trueConflict = matchingConflicts.find((c) => c.existingMenuSourceBatchId !== batchId);
    if (trueConflict) {
      throw new Error(
        `${group.date} ${group.mealType} 已存在由其他批次建立的正式營運菜單（ID: ${trueConflict.existingMenuId}），無法轉換`,
      );
    }
    const sameBatchExisting = matchingConflicts.find((c) => c.existingMenuSourceBatchId === batchId);
    if (sameBatchExisting) {
      skippedExistingMenuIds.push(sameBatchExisting.existingMenuId);
      continue;
    }
    groupsToCreate.push(group);
  }

  const createdMenuIds: string[] = [];
  for (const group of groupsToCreate) {
    const menuRecipes: RecipeMenuItem[] = [];
    for (const item of group.items) {
      const recipeSnap = await getDoc(doc(db, 'recipes', item.matchedRecipeId!));
      if (!recipeSnap.exists()) {
        throw new Error(`找不到配方（ID: ${item.matchedRecipeId}，來源項目: ${item.rawDishName}）`);
      }
      const recipeData = recipeSnap.data() as Recipe;
      if (recipeData.isActive !== true) {
        throw new Error(`配方「${recipeData.name ?? item.matchedRecipeId}」已停用，無法用於正式營運菜單（來源項目: ${item.rawDishName}）`);
      }
      menuRecipes.push({
        recipeId: item.matchedRecipeId!,
        recipeNameSnapshot: recipeData.name,
        servings: batch.servingBaseline,
        sourceMenuImportItemId: item.id,
      });
    }

    const ref = await addDoc(collection(db, RECIPE_MENUS), {
      name: `${batch.organizationName} ${batch.yearMonth} ${group.mealType}`,
      date: group.date,
      mealType: group.mealType,
      menuRecipes,
      isActive: true,
      notes: '',
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      sourceMenuImportBatchId: batchId,
      sourceMenuImportBatchSnapshot: {
        organizationName: batch.organizationName,
        yearMonth: batch.yearMonth,
        mealProgram: batch.mealProgram,
        sourceFileName: batch.sourceFileName,
      },
    });
    createdMenuIds.push(ref.id);
  }

  await updateDoc(doc(db, BATCHES, batchId), {
    operationalFinalizedAt: serverTimestamp(),
    operationalFinalizedBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });

  return { createdMenuIds, skippedExistingMenuIds };
}
