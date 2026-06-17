import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type {
  MenuMixRecommendation,
  MenuDraft,
  MenuDraftStatus,
  DraftMenuItem,
} from './types';

export interface MenuDraftInput {
  menuName: string;
  notes?: string;
}

/**
 * Source of truth is always re-read from Firestore by recommendationId —
 * never accept a client-supplied MenuMixRecommendation object here.
 */
export async function createMenuDraftFromRecommendation(
  db: Firestore,
  recommendationId: string,
  input: MenuDraftInput,
  uid: string,
): Promise<MenuDraft> {
  const snap = await getDoc(doc(db, 'menuMixRecommendations', recommendationId));
  if (!snap.exists()) {
    throw new Error(`menuMixRecommendation ${recommendationId} not found`);
  }
  const recommendation = {
    id: snap.id,
    ...(snap.data() as Omit<MenuMixRecommendation, 'id'>),
  };

  if (recommendation.recommendedMixItems.length === 0) {
    throw new Error('Cannot create draft from a recommendation with no recommendedMixItems');
  }
  if (!input.menuName || input.menuName.trim().length === 0) {
    throw new Error('menuName is required');
  }

  const items: DraftMenuItem[] = recommendation.recommendedMixItems.map((item, index) => ({
    recipeId: item.recipeId,
    recipeNameSnapshot: item.recipeNameSnapshot,
    servingCount: item.suggestedServingCount,
    suggestedRatioSnapshot: item.suggestedRatio,
    primaryProcessTypeSnapshot: item.primaryProcessType,
    primaryEquipmentTypeSnapshot: item.primaryEquipmentType,
    sourceRecommendationItemIndex: index,
  }));

  const docData: Record<string, unknown> = {
    sourceRecommendationId: recommendation.id,
    sourceRecommendationStatusSnapshot: recommendation.recommendationStatus,
    menuName: input.menuName.trim(),
    items,
    status: 'draft' as MenuDraftStatus,
    manualReviewNotesSnapshot: recommendation.manualReviewNotes,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };
  if (recommendation.createdAt) {
    docData.sourceRecommendationCreatedAtSnapshot = recommendation.createdAt;
  }
  if (input.notes && input.notes.trim().length > 0) {
    docData.notes = input.notes.trim();
  }

  const ref = await addDoc(collection(db, 'menuDrafts'), docData);
  return { id: ref.id, ...docData } as MenuDraft;
}

export async function getMenuDraft(db: Firestore, draftId: string): Promise<MenuDraft> {
  const snap = await getDoc(doc(db, 'menuDrafts', draftId));
  if (!snap.exists()) {
    throw new Error(`menuDraft ${draftId} not found`);
  }
  return { id: snap.id, ...(snap.data() as Omit<MenuDraft, 'id'>) };
}

export async function listMenuDrafts(db: Firestore): Promise<MenuDraft[]> {
  const q = query(collection(db, 'menuDrafts'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuDraft, 'id'>) }));
}
