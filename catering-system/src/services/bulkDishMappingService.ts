/**
 * bulkDishMappingService — Feature 029 (批次將匯入菜色對應既有配方).
 *
 * Pure grouping/eligibility helpers plus a thin orchestration layer over
 * Feature 024's `dishNameMatchingService.confirmMapping()`. Introduces no new
 * Firestore writes or rules — every per-item write is the exact same
 * `confirmMapping()` call Feature 024 already uses for single-item human
 * confirmation; this module only adds "loop it over a same-dish-name group".
 *
 * Never writes to recipes/ingredients/recipeIngredients. Never overrides an
 * already-`mapped` item (blocked both here and by itemMatchStatusTransition()
 * in firestore.rules — `mapped` has no outgoing transition).
 */

import type { Firestore } from 'firebase/firestore';
import type { MenuImportItem } from './types';
import { confirmMapping } from './dishNameMatchingService';

/** Statuses eligible for bulk human-confirm mapping in v1. */
const MAPPABLE_STATUSES = new Set<MenuImportItem['matchStatus']>(['unmatched', 'pending_review', 'unresolved']);

export interface DishNameGroup {
  normalizedDishName: string;
  /** One representative raw name for display (first occurrence). */
  sampleRawDishName: string;
  items: MenuImportItem[];
  mappableItems: MenuImportItem[];
  /** Items already `mapped` — displayed but never re-targeted in v1. */
  alreadyMappedCount: number;
  /** Items `rejected` — terminal, displayed but never targeted. */
  rejectedCount: number;
}

/**
 * Groups items by normalizedDishName. Only items still eligible for bulk
 * mapping (`unmatched` / `pending_review` / `unresolved`) populate
 * `mappableItems`; `mapped`/`rejected` items are counted but excluded from
 * any write path.
 */
export function groupItemsByDishName(items: MenuImportItem[]): DishNameGroup[] {
  const groups = new Map<string, DishNameGroup>();
  for (const item of items) {
    const key = item.normalizedDishName;
    if (!groups.has(key)) {
      groups.set(key, {
        normalizedDishName: key,
        sampleRawDishName: item.rawDishName,
        items: [],
        mappableItems: [],
        alreadyMappedCount: 0,
        rejectedCount: 0,
      });
    }
    const group = groups.get(key)!;
    group.items.push(item);
    if (MAPPABLE_STATUSES.has(item.matchStatus)) {
      group.mappableItems.push(item);
    } else if (item.matchStatus === 'mapped') {
      group.alreadyMappedCount += 1;
    } else if (item.matchStatus === 'rejected') {
      group.rejectedCount += 1;
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.mappableItems.length - a.mappableItems.length);
}

/** Only groups that still have at least one mappable item are actionable. */
export function actionableGroups(items: MenuImportItem[]): DishNameGroup[] {
  return groupItemsByDishName(items).filter((g) => g.mappableItems.length > 0);
}

export interface BulkMapResult {
  succeededItemIds: string[];
  failedItems: Array<{ itemId: string; error: string }>;
}

/**
 * Applies `confirmMapping()` to every given item, sequentially, against the
 * same `recipeId`. Each write is independently validated by the existing
 * Firestore rules (no new rules, no multi-doc transaction) — a failure on one
 * item does not abort the rest.
 */
export async function bulkConfirmMapping(
  db: Firestore,
  batchId: string,
  items: MenuImportItem[],
  recipeId: string,
  uid: string,
): Promise<BulkMapResult> {
  const succeededItemIds: string[] = [];
  const failedItems: Array<{ itemId: string; error: string }> = [];

  for (const item of items) {
    if (!MAPPABLE_STATUSES.has(item.matchStatus)) {
      failedItems.push({ itemId: item.id, error: `項目狀態為「${item.matchStatus}」，不可重複對應` });
      continue;
    }
    try {
      await confirmMapping(db, batchId, item.id, recipeId, uid);
      succeededItemIds.push(item.id);
    } catch (err) {
      failedItems.push({ itemId: item.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeededItemIds, failedItems };
}
