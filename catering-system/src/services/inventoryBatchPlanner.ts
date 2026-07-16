/**
 * inventoryBatchPlanner — Feature 071 Phase 2: 批次資料層的純運算（無 Firestore）。
 *
 * 提供批次庫存的核心推導，供後續 executor（收貨建批次、FEFO 扣料、currentStock
 * 推導）呼叫。全部純函式、僅 type-import，可用 tsx 直接單測。
 */

import type { InventoryBatch, IngredientFreshnessParams, StorageType } from './types';
import { isoAddDays } from './freshnessService';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 解析某儲存環境的保存天數：優先該環境欄位 → 退化到預設環境 → 再退化到任一有值者。
 * 全無設定回 null（呼叫端須改為人工填效期）。
 */
export function resolveShelfLifeDays(
  params: IngredientFreshnessParams,
  storageType: StorageType,
): number | null {
  const byType: Record<StorageType, number | undefined> = {
    ambient: params.shelfLifeDaysAmbient,
    chilled: params.shelfLifeDaysChilled,
    frozen: params.shelfLifeDaysFrozen,
  };
  if (byType[storageType] != null && byType[storageType]! > 0) return byType[storageType]!;
  const def = params.defaultStorageType;
  if (def && byType[def] != null && byType[def]! > 0) return byType[def]!;
  for (const v of [params.shelfLifeDaysChilled, params.shelfLifeDaysAmbient, params.shelfLifeDaysFrozen]) {
    if (v != null && v > 0) return v;
  }
  return null;
}

/**
 * 依入庫日 + 該環境保存天數推導效期（ISO "YYYY-MM-DD"）。
 * 無保存天數時回 null——此時 UI 應要求人工填效期（見設計 E 節「無效期資料」）。
 */
export function deriveExpirationDate(
  receivedDateIso: string,
  params: IngredientFreshnessParams,
  storageType: StorageType,
): string | null {
  const days = resolveShelfLifeDays(params, storageType);
  if (days == null) return null;
  return isoAddDays(receivedDateIso, days);
}

/** currentStock（推導值）＝ 各批次剩餘量加總（kg，3 位小數）。 */
export function computeCurrentStockFromBatches(batches: InventoryBatch[]): number {
  let sum = 0;
  for (const b of batches) {
    if (typeof b.qtyRemainingKg === 'number' && b.qtyRemainingKg > 0) sum += b.qtyRemainingKg;
  }
  return round3(sum);
}

/**
 * 產生下一個批次編號 "YYYYMMDD-NN"（同一入庫日序號遞增）。
 */
export function nextBatchId(receivedDateIso: string, existingIds: string[]): string {
  const datePart = receivedDateIso.slice(0, 10).replace(/-/g, '');
  const prefix = `${datePart}-`;
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

export interface FefoDeduction {
  batchId: string;
  deductKg: number;
}

export interface FefoPlan {
  /** 逐批扣除計畫（先到期先扣）。 */
  deductions: FefoDeduction[];
  /** 全部批次仍不足的缺口（kg，>0 表示庫存不足）。 */
  shortfallKg: number;
}

/**
 * FEFO 扣料計畫：先到期（expirationDate 早）先扣，效期同則入庫日早先扣。
 * 只動剩餘量 > 0 的批次；不足時回報缺口，呼叫端決定是否整批不扣（同 deductStock 慣例）。
 */
export function planFefoDeduction(batches: InventoryBatch[], needKg: number): FefoPlan {
  const sorted = batches
    .filter((b) => b.qtyRemainingKg > 0)
    .sort((a, b) => {
      if (a.expirationDate !== b.expirationDate) return a.expirationDate < b.expirationDate ? -1 : 1;
      return a.receivedDate < b.receivedDate ? -1 : a.receivedDate > b.receivedDate ? 1 : 0;
    });

  let need = round3(Math.max(0, needKg));
  const deductions: FefoDeduction[] = [];
  for (const b of sorted) {
    if (need <= 0) break;
    const take = round3(Math.min(b.qtyRemainingKg, need));
    if (take > 0) {
      deductions.push({ batchId: b.id, deductKg: take });
      need = round3(need - take);
    }
  }
  return { deductions, shortfallKg: round3(Math.max(0, need)) };
}
