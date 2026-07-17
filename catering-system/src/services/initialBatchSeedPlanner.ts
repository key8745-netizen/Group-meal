/**
 * initialBatchSeedPlanner — Feature 087: 從現有 currentStock 建立「初始批次」（純函式）。
 *
 * 保鮮系統靠批次（batches）運作，但只有「批次功能上線後的收貨/加工」才會建批次；
 * 架上原本就有的 currentStock 沒有對應批次，因此完全不會觸發保鮮警示。此規劃器
 * 替這些「有庫存但無批次」的易腐食材，規劃一筆初始批次，讓保鮮系統看得見既有庫存。
 *
 * 安全原則（沿用 backfill）：merge-only（已有批次者不動）、乾貨略過、無庫存略過、
 * 無保存天數則略過（不臆測效期）。初始批次的實際進貨日未知，保守以 receivedDate
 * 當日起算完整保存期，並在 sourceNote 標明為估計，使用者可再調整。
 *
 * 純函式、僅 type-import，可單測。
 */

import type { IngredientFreshnessParams, StorageType } from '@/services/types';
import { deriveExpirationDate } from '@/services/inventoryBatchPlanner';

export type InitialBatchSeedAction =
  | 'willSeed'
  | 'alreadyHasBatches'
  | 'skippedNonPerishable'
  | 'noStock'
  | 'noShelfLife';

export interface InitialBatchSeedIngredient {
  id: string;
  name: string;
  currentStockKg: number;
  /** 該食材是否已有任何批次（有則不重複種子，避免雙重計數）。 */
  hasBatches: boolean;
  params: IngredientFreshnessParams;
}

export interface InitialBatchSpec {
  storageType: StorageType;
  receivedDate: string;
  expirationDate: string;
  qtyKg: number;
  sourceNote: string;
}

export interface InitialBatchSeedResult {
  id: string;
  name: string;
  action: InitialBatchSeedAction;
  /** willSeed 時要建立的批次規格。 */
  batch?: InitialBatchSpec;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 規劃單一食材的初始批次種子。
 * @param ing         食材（含庫存量、是否已有批次、保鮮參數）。
 * @param receivedDateIso 初始批次的入庫日（通常帶今日）。
 */
export function planInitialBatchSeed(
  ing: InitialBatchSeedIngredient,
  receivedDateIso: string,
): InitialBatchSeedResult {
  const base = { id: ing.id, name: ing.name };

  if (ing.params.isPerishable === false) return { ...base, action: 'skippedNonPerishable' };
  if (!(ing.currentStockKg > 0)) return { ...base, action: 'noStock' };
  if (ing.hasBatches) return { ...base, action: 'alreadyHasBatches' };

  const storageType: StorageType = ing.params.defaultStorageType ?? 'chilled';
  const expirationDate = deriveExpirationDate(receivedDateIso, ing.params, storageType);
  if (expirationDate == null) return { ...base, action: 'noShelfLife' };

  return {
    ...base,
    action: 'willSeed',
    batch: {
      storageType,
      receivedDate: receivedDateIso,
      expirationDate,
      qtyKg: round3(ing.currentStockKg),
      sourceNote: `初始庫存種子（依現有庫存 ${round3(ing.currentStockKg)}kg 建立，入庫日與效期為估計，可調整）`,
    },
  };
}

/** 批次規劃：對整份食材清單各自計算初始批次種子。 */
export function planInitialBatchSeedBatch(
  list: InitialBatchSeedIngredient[],
  receivedDateIso: string,
): InitialBatchSeedResult[] {
  return (list ?? []).map((ing) => planInitialBatchSeed(ing, receivedDateIso));
}
