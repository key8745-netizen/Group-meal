/**
 * shoppingListService — Feature 062: 待採購彙總清單（純函式，無 Firestore）。
 *
 * 便當店常同時有多張待採購（PENDING）採購單（每日、每週、安全補貨…）。
 * 到市場前把這些單彙總成「一張採買清單」：同一食材跨單加總，方便一次買齊。
 * 純函式方便測試；列印由 ShoppingListPrintView 呈現。
 */

import type { PurchaseOrder } from './purchaseOrderService';

export interface ShoppingListLine {
  ingredientId: string;
  name: string;
  /** 跨單加總的採購量（kg，3 位小數）。 */
  totalKg: number;
  /** 跨單加總的採購量（台斤，2 位小數）。 */
  totalTaijin: number;
  /** 此食材出現在幾張採購單（>1 表示由多張單彙總而來）。 */
  orderCount: number;
}

export interface ShoppingListSummary {
  lines: ShoppingListLine[];
  /** 納入彙總的採購單張數。 */
  sourceOrderCount: number;
  /** 品項數。 */
  itemCount: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 把多張採購單彙總成一份採買清單，同一 ingredientId 跨單加總，依名稱排序。
 * 僅計入 purchaseQtyKg > 0 的品項。
 */
export function buildConsolidatedShoppingList(orders: PurchaseOrder[]): ShoppingListSummary {
  const byId = new Map<string, ShoppingListLine & { _orders: Set<string> }>();

  orders.forEach((order, orderIdx) => {
    const orderKey = order.id ?? `#${orderIdx}`;
    for (const item of order.items) {
      if (!(item.purchaseQtyKg > 0)) continue;
      const existing = byId.get(item.ingredientId);
      if (existing) {
        existing.totalKg += item.purchaseQtyKg;
        existing.totalTaijin += item.purchaseTaijin;
        existing._orders.add(orderKey);
      } else {
        byId.set(item.ingredientId, {
          ingredientId: item.ingredientId,
          name: item.name,
          totalKg: item.purchaseQtyKg,
          totalTaijin: item.purchaseTaijin,
          orderCount: 0,
          _orders: new Set([orderKey]),
        });
      }
    }
  });

  const lines: ShoppingListLine[] = [...byId.values()]
    .map((l) => ({
      ingredientId: l.ingredientId,
      name: l.name,
      totalKg: round3(l.totalKg),
      totalTaijin: round2(l.totalTaijin),
      orderCount: l._orders.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  return {
    lines,
    sourceOrderCount: orders.length,
    itemCount: lines.length,
  };
}
