/**
 * inventoryBatchService — Feature 071 Phase 2b: 批次 executor（薄 Firestore 層）。
 *
 * 批次儲存於 inventory/{ingredientId}/batches/{batchId}。此檔只負責讀寫，
 * 效期/編號等推導一律走 inventoryBatchPlanner 純函式。
 *
 * 並存策略（Phase 2b）：收貨時「額外」建立批次，currentStock 仍由既有
 * restockIngredient 維護；批次資料先累積、供保鮮顯示，尚未成為權威庫存值。
 */

import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { IngredientMaster, InventoryBatch, StorageType } from './types';
import { deriveExpirationDate, nextBatchId } from './inventoryBatchPlanner';
import { isoAddDays } from './freshnessService';
import { todayLocalIsoDate } from './marketPriceService';

/** 無保存天數可推導時的保守後備效期（天）。 */
const FALLBACK_SHELF_LIFE_DAYS = 7;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 讀取某食材的所有批次。 */
export async function listBatchesForIngredient(
  db: Firestore,
  ingredientId: string,
): Promise<InventoryBatch[]> {
  const snap = await getDocs(collection(db, 'inventory', ingredientId, 'batches'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryBatch));
}

/** 讀取所有批次（collectionGroup），供庫存頁一次載入計算保鮮狀態。 */
export async function listAllBatches(db: Firestore): Promise<InventoryBatch[]> {
  const snap = await getDocs(collectionGroup(db, 'batches'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryBatch));
}

/**
 * 收貨時建立一筆批次。效期依食材保鮮參數推導；無保存天數時用保守後備值。
 * 回傳 batchId；receivedKg <= 0 時不建立、回 null。
 */
export async function createReceiptBatch(
  db: Firestore,
  ingredient: IngredientMaster,
  receivedKg: number,
  receivedDateIso: string = todayLocalIsoDate(),
): Promise<string | null> {
  if (!(receivedKg > 0)) return null;
  const storageType: StorageType = ingredient.defaultStorageType ?? 'chilled';
  const expiration =
    deriveExpirationDate(receivedDateIso, ingredient, storageType)
    ?? isoAddDays(receivedDateIso, FALLBACK_SHELF_LIFE_DAYS);

  const existing = await listBatchesForIngredient(db, ingredient.id);
  const id = nextBatchId(receivedDateIso, existing.map((b) => b.id));
  const kg = round3(receivedKg);

  const data: Omit<InventoryBatch, 'id'> = {
    ingredientId: ingredient.id,
    storageType,
    receivedDate: receivedDateIso,
    expirationDate: expiration,
    qtyReceivedKg: kg,
    qtyRemainingKg: kg,
  };
  await setDoc(doc(db, 'inventory', ingredient.id, 'batches', id), data);
  return id;
}
