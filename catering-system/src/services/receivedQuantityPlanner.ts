/**
 * receivedQuantityPlanner — Feature 061: 收貨實收數量微調（純函式，無 Firestore）。
 *
 * 收貨（PENDING → RECEIVED）時，實際到貨量常與下單量不符。此純函式把
 * 每項下單量與使用者填入的「實收量覆寫」解析成最終入庫清單：
 *   - 未覆寫 → 沿用下單量（purchaseQtyKg）
 *   - 覆寫為 0 → 該項未到貨，不入庫（但仍列入紀錄，receivedKg = 0）
 *   - 覆寫為負值 / 非數字 → 視為 0
 * 執行器（purchaseOrderService.completeOrder）只對 receivedKg > 0 者補庫存，
 * 但會把全部項目（含 0）寫入績效紀錄，讓入庫資料誠實反映到貨狀況。
 *
 * 型別以 type-only 匯入 PurchaseOrderItem，避免在 tsx 測試中觸發
 * import.meta.env（同 stockAlertService 的作法）。
 */

import type { PurchaseOrderItem } from './purchaseOrderService';

export interface ResolvedReceiveLine {
  ingredientId: string;
  name: string;
  /** 原下單量（kg）。 */
  orderedKg: number;
  /** 最終實收量（kg，3 位小數；0 = 未到貨）。 */
  receivedKg: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 解析每項的實收量。overridesKg 以 ingredientId 為鍵；未提供的鍵沿用下單量。
 */
export function resolveReceivedQuantities(
  items: Pick<PurchaseOrderItem, 'ingredientId' | 'name' | 'purchaseQtyKg'>[],
  overridesKg?: Map<string, number>,
): ResolvedReceiveLine[] {
  return items.map((item) => {
    const override = overridesKg?.get(item.ingredientId);
    const raw = override === undefined ? item.purchaseQtyKg : override;
    const receivedKg = Number.isFinite(raw) && raw > 0 ? round3(raw) : 0;
    return {
      ingredientId: item.ingredientId,
      name: item.name,
      orderedKg: round3(item.purchaseQtyKg),
      receivedKg,
    };
  });
}
