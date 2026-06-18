/**
 * dishNameMatchingService — Feature 024 (菜名比對與推定配方建立).
 *
 * Attempts to match a staging MenuImportItem.rawDishName against an
 * existing /recipes/{recipeId} (Feature 011 collection — reference-only, no
 * write). On success, advances MenuImportItem.matchStatus to 'mapped'. On
 * failure, either advances to 'pending_review' with a staging
 * ProposedRecipeCandidate, or to 'unresolved' if even candidate creation is
 * not possible.
 *
 * Never writes to recipes/ingredients/recipeIngredients.
 */

import { collection, doc, getDoc, getDocs, updateDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { MenuImportItem, MatchSource, Recipe } from './types';
import { findConfirmedAliasByNormalizedName } from './recipeAliasService';
import { createCandidate } from './proposedRecipeCandidateService';

const RECIPES = 'recipes';

function normalizeDishName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

async function findExactRecipeMatch(db: Firestore, normalizedDishName: string): Promise<Recipe | null> {
  const snap = await getDocs(collection(db, RECIPES));
  const match = snap.docs.find(
    (d) => normalizeDishName((d.data() as Recipe).name ?? '') === normalizedDishName,
  );
  return match ? ({ id: match.id, ...match.data() } as Recipe) : null;
}

interface MatchResult {
  matchedRecipeId?: string;
  matchSource: MatchSource;
  matchConfidence: number;
}

async function attemptMatch(db: Firestore, rawDishName: string): Promise<MatchResult> {
  const normalized = normalizeDishName(rawDishName);

  const alias = await findConfirmedAliasByNormalizedName(db, normalized);
  if (alias) {
    return { matchedRecipeId: alias.recipeId, matchSource: 'alias', matchConfidence: 1 };
  }

  const recipe = await findExactRecipeMatch(db, normalized);
  if (recipe) {
    return { matchedRecipeId: recipe.id, matchSource: 'exact', matchConfidence: 1 };
  }

  return { matchSource: 'none', matchConfidence: 0 };
}

/**
 * Runs matching for a single unmatched/unresolved staging item and writes
 * only the additive Feature 024 fields + matchStatus. Safe to call multiple
 * times (idempotent for already-mapped items — no-op).
 */
export async function matchItem(
  db: Firestore,
  batchId: string,
  item: MenuImportItem,
  uid: string,
): Promise<void> {
  if (item.matchStatus === 'mapped' || item.matchStatus === 'rejected') return;

  const itemRef = doc(db, 'menuImportBatches', batchId, 'items', item.id);

  try {
    const result = await attemptMatch(db, item.rawDishName);

    if (result.matchedRecipeId) {
      await updateDoc(itemRef, {
        matchStatus: 'mapped',
        matchedRecipeId: result.matchedRecipeId,
        matchSource: result.matchSource,
        matchConfidence: result.matchConfidence,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      return;
    }

    const candidateId = await createCandidate(
      db,
      {
        sourceItemId: item.id,
        sourceBatchId: batchId,
        rawDishNameSnapshot: item.rawDishName,
        ingredients: [],
      },
      uid,
    );

    await updateDoc(itemRef, {
      matchStatus: 'pending_review',
      candidateId,
      matchSource: 'none',
      matchConfidence: 0,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  } catch (err) {
    await updateDoc(itemRef, {
      matchStatus: 'unresolved',
      matchingError: err instanceof Error ? err.message : String(err),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  }
}

/** Human reviewer confirms a pending_review/unresolved item against a recipe. */
export async function confirmMapping(
  db: Firestore,
  batchId: string,
  itemId: string,
  recipeId: string,
  uid: string,
): Promise<void> {
  const recipeSnap = await getDoc(doc(db, RECIPES, recipeId));
  if (!recipeSnap.exists()) {
    throw new Error(`找不到配方（ID: ${recipeId}）`);
  }
  await updateDoc(doc(db, 'menuImportBatches', batchId, 'items', itemId), {
    matchStatus: 'mapped',
    matchedRecipeId: recipeId,
    matchSource: 'manual',
    matchConfidence: 1,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/** Human reviewer rejects a pending_review item — terminal, no further transitions. */
export async function rejectMapping(db: Firestore, batchId: string, itemId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'menuImportBatches', batchId, 'items', itemId), {
    matchStatus: 'rejected',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/** Human reviewer reopens an unresolved item for review. */
export async function reopenForReview(db: Firestore, batchId: string, itemId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'menuImportBatches', batchId, 'items', itemId), {
    matchStatus: 'pending_review',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
