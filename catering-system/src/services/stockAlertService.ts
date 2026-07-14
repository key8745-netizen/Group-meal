/**
 * stockAlertService — Feature 057: 安全庫存警示（純函式，無 Firestore）。
 *
 * `minStockLevel`（kg，食材主檔可編輯；0/未設定 = 不追蹤）對比
 * `inventory/{id}.currentStock`（kg）。低於安全量的食材由首頁與儀表板
 * 顯示警示，並可經 `planSafetyRestock` 產生「補到安全量」的採購單行
 * （走既有 purchaseOrderService.createOrder，人工確認後才建單）。
 */

import { toTaijin } from '@/utils/unitConverter';
import type { PurchaseOrderItem } from './purchaseOrderService';
import type { IngredientMaster } from './types';

export interface LowStockItem {
  ingredientId: string;
  ingredientName: string;
  /** 現有庫存（kg，無庫存文件視為 0）。 */
  currentKg: number;
  /** 安全庫存（kg）。 */
  safetyKg: number;
  /** 補到安全量所需（kg，3 位小數）。 */
  deficitKg: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 找出低於安全量的食材，依「現有/安全」比例由低到高排序（最缺的在前）。
 * 只看啟用中且 minStockLevel > 0 的食材。
 */
export function computeLowStock(
  ingredients: IngredientMaster[],
  stockKgByIngredientId: Map<string, number>,
): LowStockItem[] {
  const items: LowStockItem[] = [];
  for (const ing of ingredients) {
    if (ing.isActive === false) continue;
    const safetyKg = typeof ing.minStockLevel === 'number' ? ing.minStockLevel : 0;
    if (!(safetyKg > 0)) continue;
    const currentKg = Math.max(0, stockKgByIngredientId.get(ing.id) ?? 0);
    if (currentKg >= safetyKg) continue;
    items.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      currentKg: round3(currentKg),
      safetyKg: round3(safetyKg),
      deficitKg: round3(safetyKg - currentKg),
    });
  }
  return items.sort((a, b) => a.currentKg / a.safetyKg - b.currentKg / b.safetyKg);
}

/** 低庫存 → 「補到安全量」採購單行（kg＋台斤）。 */
export function planSafetyRestock(items: LowStockItem[]): PurchaseOrderItem[] {
  return items
    .filter((i) => i.deficitKg > 0)
    .map((i) => ({
      ingredientId: i.ingredientId,
      name: i.ingredientName,
      purchaseQtyKg: i.deficitKg,
      purchaseTaijin: toTaijin(i.deficitKg),
    }));
}
