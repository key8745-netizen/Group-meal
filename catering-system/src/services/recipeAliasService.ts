/**
 * recipeAliasService — Feature 024 (菜名比對與推定配方建立), RecipeAlias
 * governance. Staging-only dish-name alias records used to match menu
 * import item names against /recipes/{recipeId} (reference-only).
 *
 * No org/tenant scoping exists in this app (see
 * docs/features/feature-024/SSOT_RECONCILIATION_PACKAGE.md Section 7A) — all
 * duplicate-alias handling below is global, not per-organization.
 */

import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { RecipeAlias } from './types';

const COLLECTION = 'recipeAliases';

export function normalizeAlias(rawAlias: string): string {
  return rawAlias.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Creates a pending alias. Uses a transaction to detect duplicates
 * atomically under concurrent creation:
 *  - same normalizedAlias + same recipeId  -> idempotent, returns existing id
 *  - same normalizedAlias + different recipeId -> throws conflict error
 */
export async function createAlias(
  db: Firestore,
  rawAlias: string,
  recipeId: string,
  uid: string,
): Promise<string> {
  const trimmed = rawAlias.trim();
  if (!trimmed) throw new Error('rawAlias 不可為空');
  const normalizedAlias = normalizeAlias(trimmed);

  const existingSnap = await getDocs(
    query(collection(db, COLLECTION), where('normalizedAlias', '==', normalizedAlias)),
  );
  const conflict = existingSnap.docs.find((d) => (d.data() as RecipeAlias).recipeId !== recipeId);
  if (conflict) {
    throw new Error(`別名「${trimmed}」已對應到其他配方，無法重複建立（衝突）`);
  }
  const sameRecipe = existingSnap.docs.find((d) => (d.data() as RecipeAlias).recipeId === recipeId);
  if (sameRecipe) {
    return sameRecipe.id;
  }

  return runTransaction(db, async (tx) => {
    const recheck = await getDocs(
      query(collection(db, COLLECTION), where('normalizedAlias', '==', normalizedAlias)),
    );
    const recheckConflict = recheck.docs.find((d) => (d.data() as RecipeAlias).recipeId !== recipeId);
    if (recheckConflict) {
      throw new Error(`別名「${trimmed}」已對應到其他配方，無法重複建立（衝突）`);
    }
    const recheckSame = recheck.docs.find((d) => (d.data() as RecipeAlias).recipeId === recipeId);
    if (recheckSame) {
      return recheckSame.id;
    }
    const ref = doc(collection(db, COLLECTION));
    tx.set(ref, {
      rawAlias: trimmed,
      normalizedAlias,
      recipeId,
      status: 'pending',
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    return ref.id;
  });
}

export async function confirmAlias(db: Firestore, aliasId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, aliasId), {
    status: 'confirmed',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function rejectAlias(db: Firestore, aliasId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, aliasId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function findConfirmedAliasByNormalizedName(
  db: Firestore,
  normalizedAlias: string,
): Promise<RecipeAlias | null> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('normalizedAlias', '==', normalizedAlias),
      where('status', '==', 'confirmed'),
    ),
  );
  const d = snap.docs[0];
  return d ? ({ id: d.id, ...d.data() } as RecipeAlias) : null;
}

export async function listAliases(db: Firestore): Promise<RecipeAlias[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecipeAlias));
}
