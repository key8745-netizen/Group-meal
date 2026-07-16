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
  runTransaction,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { IngredientMaster, InventoryBatch, StorageType } from './types';
import { deriveExpirationDate, nextBatchId, planFefoDeduction } from './inventoryBatchPlanner';
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

/**
 * Feature 083: Best-effort 讓批次剩餘量反映出餐扣料（FEFO：先到期先扣）。
 *
 * currentStock 仍由 inventoryService.deductStock 權威扣除；本函式「額外」把同量
 * 依效期扣到各批次的 qtyRemainingKg，讓保鮮警示不再顯示其實已用掉的幽靈批次。
 * 屬並存期附加資料——無批次時無動作；呼叫端應以 try/catch 包起，失敗不影響扣料。
 * 只降不升、不低於 0，且在單一交易內更新受影響批次。
 */
export async function applyFefoBatchDeduction(
  db: Firestore,
  ingredientId: string,
  needKg: number,
): Promise<{ deductedKg: number; shortfallKg: number }> {
  if (!(needKg > 0)) return { deductedKg: 0, shortfallKg: 0 };

  const batches = await listBatchesForIngredient(db, ingredientId);
  const plan = planFefoDeduction(batches, needKg);
  if (plan.deductions.length === 0) return { deductedKg: 0, shortfallKg: plan.shortfallKg };

  const refs = plan.deductions.map((d) => doc(db, 'inventory', ingredientId, 'batches', d.batchId));
  await runTransaction(db, async (t) => {
    const snaps = await Promise.all(refs.map((r) => t.get(r)));
    snaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      const cur = (snap.data() as Omit<InventoryBatch, 'id'>).qtyRemainingKg ?? 0;
      const next = round3(Math.max(0, cur - plan.deductions[i].deductKg));
      t.update(refs[i], { qtyRemainingKg: next });
    });
  });

  const deductedKg = round3(plan.deductions.reduce((s, d) => s + d.deductKg, 0));
  return { deductedKg, shortfallKg: plan.shortfallKg };
}
