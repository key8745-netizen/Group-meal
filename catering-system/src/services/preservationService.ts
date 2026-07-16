/**
 * preservationService — Feature 079: 加工延壽執行層（交易安全寫入）。
 *
 * 消費 preservationPlanner 算出的計畫，於單一 runTransaction 內原子完成：
 *   1) 扣減來源批次剩餘量（耗用的原料）。
 *   2) 在同一食材下新建「加工批次」（改儲存/重設效期/記來源＋加工標籤）。
 *   3) 依烹煮失重調整該食材 currentStock（淨變化 = 產出 − 耗用）。
 *   4) 寫一筆 adjustment 稽核記錄。
 *
 * 因加工批次掛回同一 ingredientId，延壽後仍會被既有配方推薦與保鮮警示網羅。
 */

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { InventoryBatch, InventoryDoc, InventoryTransaction } from './types';
import type { PreservationPlan } from './preservationPlanner';
import { listBatchesForIngredient } from './inventoryBatchService';
import { nextBatchId } from './inventoryBatchPlanner';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 執行加工延壽。plan 必須是 planPreservation 回傳的成功計畫。
 * 回傳新建的加工批次 id。來源批次剩餘不足時擲錯（交易回滾）。
 */
export async function recordPreservation(
  db: Firestore,
  plan: PreservationPlan,
  ingredientName: string,
  performedBy: string,
): Promise<string> {
  // 交易外先讀既有批次，推導人類可讀的新批號（YYYYMMDD-NN）。
  const existing = await listBatchesForIngredient(db, plan.ingredientId);
  const newBatchId = nextBatchId(plan.newBatch.receivedDate, existing.map((b) => b.id));

  const sourceBatchRef = doc(db, 'inventory', plan.ingredientId, 'batches', plan.newBatch.sourceBatchId);
  const newBatchRef = doc(db, 'inventory', plan.ingredientId, 'batches', newBatchId);
  const invRef = doc(db, 'inventory', plan.ingredientId);
  const txRef = doc(collection(db, 'inventory', plan.ingredientId, 'transactions'));

  await runTransaction(db, async (t) => {
    const [srcSnap, invSnap] = await Promise.all([t.get(sourceBatchRef), t.get(invRef)]);

    if (!srcSnap.exists()) throw new Error('來源批次不存在，無法加工延壽');
    const src = srcSnap.data() as Omit<InventoryBatch, 'id'>;
    if ((src.qtyRemainingKg ?? 0) + 1e-9 < plan.consumeKg) {
      throw new Error(`來源批次剩餘不足（剩 ${round3(src.qtyRemainingKg ?? 0)}kg，需 ${plan.consumeKg}kg）`);
    }

    // 1) 扣來源批次
    t.update(sourceBatchRef, { qtyRemainingKg: round3((src.qtyRemainingKg ?? 0) - plan.consumeKg) });

    // 2) 建加工批次
    const newData: Omit<InventoryBatch, 'id'> = {
      ingredientId: plan.ingredientId,
      storageType: plan.newBatch.storageType,
      receivedDate: plan.newBatch.receivedDate,
      expirationDate: plan.newBatch.expirationDate,
      qtyReceivedKg: plan.newBatch.qtyKg,
      qtyRemainingKg: plan.newBatch.qtyKg,
      sourceBatchId: plan.newBatch.sourceBatchId,
      sourceNote: plan.newBatch.sourceNote,
      processedLabel: plan.newBatch.processedLabel,
    };
    t.set(newBatchRef, newData);

    // 3) 依失重調整 currentStock（淨變化 = 產出 − 耗用）
    const currentStock = invSnap.exists() ? (invSnap.data() as InventoryDoc).currentStock ?? 0 : 0;
    const newStock = round3(currentStock + plan.netStockChangeKg);
    if (invSnap.exists()) {
      t.update(invRef, { currentStock: Math.max(0, newStock), lastUpdated: serverTimestamp() });
    } else {
      t.set(invRef, {
        ingredientId: plan.ingredientId,
        ingredientName,
        currentStock: Math.max(0, newStock),
        unit: 'kg',
        lastUpdated: serverTimestamp(),
      });
    }

    // 4) 稽核記錄
    t.set(txRef, {
      type: 'adjustment',
      quantity: plan.netStockChangeKg,
      referenceId: `preserve:${newBatchId}`,
      reason: `加工延壽（${plan.newBatch.processedLabel}）耗用 ${plan.consumeKg}kg → 產出 ${plan.outputKg}kg（來源 #${plan.newBatch.sourceBatchId}）`,
      performedBy,
      timestamp: serverTimestamp(),
    } satisfies Omit<InventoryTransaction, 'timestamp'> & { timestamp: ReturnType<typeof serverTimestamp> });
  });

  return newBatchId;
}
