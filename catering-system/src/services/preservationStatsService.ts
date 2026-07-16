/**
 * preservationStatsService — Feature 084: 加工延壽（惜食）成效統計（純函式）。
 *
 * 加工延壽會產生帶 processedLabel 的批次（Feature 079/081），且 receivedDate 即加工日。
 * 本模組直接從既有批次資料彙整成效，不需額外查詢或新規則：
 *   - 累計延壽批次數與產出量（qtyReceivedKg）。
 *   - 尚未用完的延壽庫存（qtyRemainingKg）。
 *   - 近 N 天的延壽活動。
 * 純函式、僅 type-import，可單測。
 */

import type { InventoryBatch } from '@/services/types';
import { daysBetween } from '@/services/freshnessService';

export interface PreservationSummary {
  /** 累計加工延壽批次數。 */
  processedBatchCount: number;
  /** 累計延壽產出量（kg，各批 qtyReceivedKg 加總）。 */
  processedKg: number;
  /** 仍有剩餘的延壽批次數。 */
  activeBatchCount: number;
  /** 仍有剩餘的延壽庫存（kg）。 */
  activeRemainingKg: number;
  /** 近 N 天內加工的批次數。 */
  recentBatchCount: number;
  /** 近 N 天內加工的產出量（kg）。 */
  recentKg: number;
  /** 統計視窗天數（供顯示）。 */
  windowDays: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 是否為加工延壽產出批次（帶 processedLabel）。 */
function isProcessed(b: InventoryBatch): boolean {
  return typeof b.processedLabel === 'string' && b.processedLabel.trim().length > 0;
}

/**
 * 彙整加工延壽成效。
 * @param batches   全部批次（listAllBatches）。
 * @param todayIso  今日 ISO（判斷「近 N 天」）。
 * @param windowDays 近期視窗天數（預設 30）。
 */
export function summarizePreservation(
  batches: InventoryBatch[],
  todayIso: string,
  windowDays = 30,
): PreservationSummary {
  let processedBatchCount = 0;
  let processedKg = 0;
  let activeBatchCount = 0;
  let activeRemainingKg = 0;
  let recentBatchCount = 0;
  let recentKg = 0;

  for (const b of batches ?? []) {
    if (!isProcessed(b)) continue;
    processedBatchCount += 1;
    processedKg += b.qtyReceivedKg ?? 0;

    if ((b.qtyRemainingKg ?? 0) > 0) {
      activeBatchCount += 1;
      activeRemainingKg += b.qtyRemainingKg ?? 0;
    }

    // receivedDate = 加工日；近 N 天內（0 <= age <= windowDays）。
    if (b.receivedDate) {
      const age = daysBetween(b.receivedDate, todayIso);
      if (age >= 0 && age <= windowDays) {
        recentBatchCount += 1;
        recentKg += b.qtyReceivedKg ?? 0;
      }
    }
  }

  return {
    processedBatchCount,
    processedKg: round2(processedKg),
    activeBatchCount,
    activeRemainingKg: round2(activeRemainingKg),
    recentBatchCount,
    recentKg: round2(recentKg),
    windowDays,
  };
}
