/**
 * marketPriceHistoryService — Feature 063: 食材市價歷史（純函式，無 Firestore）。
 *
 * 從多天的 marketPrices 快照中，抽出某一作物（cropName = 食材的
 * marketCropName）的每日均價序列，供食材主檔顯示近期走勢小圖，判斷進貨時機。
 * 讀取近 N 筆快照由 marketPriceService.fetchRecentMarketSnapshots 負責。
 */

import type { MarketPriceSnapshot } from './types';

export interface PricePoint {
  /** ISO 日期 "YYYY-MM-DD"。 */
  date: string;
  /** 當日均價（NT$/kg）。 */
  avgPrice: number;
}

export interface PriceHistory {
  /** 依日期由舊到新排序的價格點（只含有均價的日子）。 */
  points: PricePoint[];
  latest: number | null;
  earliest: number | null;
  min: number | null;
  max: number | null;
  /** (最新 − 最早) / 最早 × 100，四捨五入到 1 位；不足兩點為 null。 */
  changePercent: number | null;
}

const EMPTY: PriceHistory = {
  points: [], latest: null, earliest: null, min: null, max: null, changePercent: null,
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 抽出指定作物的每日均價序列並計算摘要。cropName 空白或無資料時回傳空歷史。
 */
export function buildPriceHistory(
  snapshots: MarketPriceSnapshot[],
  cropName: string | null | undefined,
): PriceHistory {
  const crop = (cropName ?? '').trim();
  if (!crop) return EMPTY;

  const points: PricePoint[] = [];
  for (const snap of snapshots) {
    const entry = snap.entries.find((e) => e.cropName === crop);
    if (entry && typeof entry.avgPrice === 'number' && entry.avgPrice > 0) {
      points.push({ date: snap.date, avgPrice: entry.avgPrice });
    }
  }
  if (points.length === 0) return EMPTY;

  points.sort((a, b) => a.date.localeCompare(b.date));

  const prices = points.map((p) => p.avgPrice);
  const earliest = prices[0];
  const latest = prices[prices.length - 1];
  const changePercent =
    points.length >= 2 && earliest > 0 ? round1(((latest - earliest) / earliest) * 100) : null;

  return {
    points,
    latest,
    earliest,
    min: Math.min(...prices),
    max: Math.max(...prices),
    changePercent,
  };
}
