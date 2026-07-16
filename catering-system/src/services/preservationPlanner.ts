/**
 * preservationPlanner — Feature 079: 加工延壽計畫（純函式）。
 *
 * 折衷方案：加工延壽不另建食材主檔，而是在「同一個食材」下產生一筆獨立的
 * 「加工批次」——改儲存方式（生鮮→煮熟冷藏/冷凍）、重設效期時鐘、記住來源
 * 批次與備註。這讓延壽後的食材仍掛在同一 ingredientId，會被既有配方推薦與
 * 保鮮警示自動網羅（惜食迴圈不中斷）。
 *
 * 本模組只負責「算」：驗證耗用量、依良率算產出、推導新效期與來源備註。
 * 實際寫入（扣來源批次量、調整 currentStock、建加工批次）由 preservationService
 * 以交易完成。純函式、僅 type-import，可單測。
 */

import type { InventoryBatch, StorageType } from '@/services/types';
import { isoAddDays } from '@/services/freshnessService';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface PreservationInput {
  /** 來源批次（快到期的原料批次）。 */
  sourceBatch: Pick<InventoryBatch, 'id' | 'ingredientId' | 'qtyRemainingKg'>;
  /** 食材顯示名（供來源備註）。 */
  ingredientName: string;
  /** 要加工的原料量（kg）。 */
  consumeKg: number;
  /** 良率（產出kg = 耗用kg × 此值）；一般 <1（煮過失重），由呼叫端解析預設/覆蓋。 */
  yieldRatio: number;
  /** 加工後儲存方式（如 chilled=煮熟冷藏）。 */
  targetStorageType: StorageType;
  /** 加工後保存天數（新效期時鐘長度）。 */
  targetShelfLifeDays: number;
  /** 加工標籤（如「煮熟冷藏」）。 */
  processedLabel: string;
  /** 加工日 ISO。 */
  todayIso: string;
}

export interface PreservationPlan {
  ok: true;
  ingredientId: string;
  consumeKg: number;
  outputKg: number;
  /** 烹煮失重（consumeKg − outputKg；良率>1 時可為負，代表增重）。 */
  lossKg: number;
  /** 來源批次加工後剩餘量。 */
  sourceRemainingAfterKg: number;
  /** 同食材 currentStock 淨變化（= outputKg − consumeKg = −lossKg）。 */
  netStockChangeKg: number;
  /** 要新建的加工批次規格（batchId 由 executor 產生）。 */
  newBatch: {
    ingredientId: string;
    storageType: StorageType;
    receivedDate: string;
    expirationDate: string;
    qtyKg: number;
    sourceBatchId: string;
    sourceNote: string;
    processedLabel: string;
  };
}

export interface PreservationError {
  ok: false;
  errors: string[];
}

/** 驗證並計算加工延壽計畫。回傳成功計畫或錯誤清單。 */
export function planPreservation(input: PreservationInput): PreservationPlan | PreservationError {
  const errors: string[] = [];
  const remaining = input.sourceBatch?.qtyRemainingKg ?? 0;
  const consumeKg = input.consumeKg;
  const yieldRatio = input.yieldRatio;

  if (!(consumeKg > 0)) errors.push('耗用量必須大於 0');
  else if (consumeKg > remaining + 1e-9) {
    errors.push(`耗用量超過來源批次剩餘（剩 ${round3(remaining)}kg，欲用 ${round3(consumeKg)}kg）`);
  }
  if (!(yieldRatio > 0)) errors.push('良率必須大於 0');
  if (!(input.targetShelfLifeDays > 0)) errors.push('加工後保存天數必須大於 0');
  if (!input.processedLabel?.trim()) errors.push('請填加工標籤（如「煮熟冷藏」）');
  if (!input.todayIso) errors.push('缺少加工日期');

  if (errors.length > 0) return { ok: false, errors };

  const outputKg = round3(consumeKg * yieldRatio);
  const lossKg = round3(consumeKg - outputKg);
  const sourceRemainingAfterKg = round3(remaining - consumeKg);
  const expirationDate = isoAddDays(input.todayIso, input.targetShelfLifeDays);
  const sourceNote =
    `由 ${input.ingredientName} #${input.sourceBatch.id} 加工延壽（${input.processedLabel}）；` +
    `耗用 ${round3(consumeKg)}kg × 良率 ${yieldRatio} = ${outputKg}kg，加工日 ${input.todayIso}`;

  return {
    ok: true,
    ingredientId: input.sourceBatch.ingredientId,
    consumeKg: round3(consumeKg),
    outputKg,
    lossKg,
    sourceRemainingAfterKg,
    netStockChangeKg: round3(outputKg - consumeKg),
    newBatch: {
      ingredientId: input.sourceBatch.ingredientId,
      storageType: input.targetStorageType,
      receivedDate: input.todayIso,
      expirationDate,
      qtyKg: outputKg,
      sourceBatchId: input.sourceBatch.id,
      sourceNote,
      processedLabel: input.processedLabel.trim(),
    },
  };
}

/**
 * 解析加工延壽的預設參數（供 UI 帶入初值）：良率取食材 processedYieldRatio（否則 1），
 * 保存天數依目標儲存方式取食材對應保存天數（否則保守 3 天）。
 */
export function resolvePreservationDefaults(
  params: { processedYieldRatio?: number; shelfLifeDaysChilled?: number; shelfLifeDaysFrozen?: number; shelfLifeDaysAmbient?: number },
  targetStorageType: StorageType,
): { yieldRatio: number; shelfLifeDays: number } {
  const yieldRatio = params.processedYieldRatio != null && params.processedYieldRatio > 0
    ? params.processedYieldRatio
    : 1;
  const byType: Record<StorageType, number | undefined> = {
    ambient: params.shelfLifeDaysAmbient,
    chilled: params.shelfLifeDaysChilled,
    frozen: params.shelfLifeDaysFrozen,
  };
  const shelfLifeDays = byType[targetStorageType] != null && byType[targetStorageType]! > 0
    ? byType[targetStorageType]!
    : 3;
  return { yieldRatio, shelfLifeDays };
}
