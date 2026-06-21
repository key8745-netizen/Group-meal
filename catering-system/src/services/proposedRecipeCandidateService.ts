/**
 * proposedRecipeCandidateService — Feature 024 (菜名比對與推定配方建立).
 *
 * Staging-only. `ingredients` are free-text strings, never formal
 * ingredientId/recipeIngredientId references. Confirming/rejecting a
 * candidate is a human-review status change only — it never creates a
 * formal recipe/ingredient/recipeIngredients document.
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
import type { ProposedRecipeCandidate } from './types';

const COLLECTION = 'proposedRecipeCandidates';

export async function createCandidate(
  db: Firestore,
  input: { sourceItemId: string; sourceBatchId: string; rawDishNameSnapshot: string; ingredients: string[] },
  uid: string,
): Promise<string> {
  const ingredients = input.ingredients.map((s) => s.trim()).filter((s) => s.length > 0);
  const ref = await addDoc(collection(db, COLLECTION), {
    sourceItemId: input.sourceItemId,
    sourceBatchId: input.sourceBatchId,
    rawDishNameSnapshot: input.rawDishNameSnapshot,
    ingredients,
    status: 'pending',
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return ref.id;
}

/** Human-review confirmation only — does not create any formal recipe data. */
export async function confirmCandidate(db: Firestore, candidateId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, candidateId), {
    status: 'confirmed',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function rejectCandidate(db: Firestore, candidateId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, candidateId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function getCandidate(db: Firestore, candidateId: string): Promise<ProposedRecipeCandidate | null> {
  const snap = await getDoc(doc(db, COLLECTION, candidateId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ProposedRecipeCandidate;
}

export async function listCandidatesForBatch(db: Firestore, batchId: string): Promise<ProposedRecipeCandidate[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ProposedRecipeCandidate))
    .filter((c) => c.sourceBatchId === batchId);
}
