/**
 * marketPriceTrendService — Feature 037: 市價趨勢與採購時機建議
 * (Market Price Trends + Buy-Timing Signal).
 *
 * Builds per-crop price trend series from the accumulated daily
 * `/marketPrices/{date}` cache (Feature 032/035) and derives a simple
 * buy-timing signal by comparing the latest cached price against the
 * trailing 7-day average within the loaded range. Pure & deterministic —
 * no new Firestore collections, no forecasting, no auto-purchasing.
 */

import {
  collection, getDocs, query, where, orderBy, type Firestore,
} from 'firebase/firestore';
import type { MarketPriceSnapshot } from './types';
import { todayLocalIsoDate } from './marketPriceService';

const COLLECTION = 'marketPrices';
const MAX_DAYS = 60;

/** One day's average price for a single crop. */
export interface CropTrendPoint {
  date: string;
  avgPrice: number;
}

export type BuySignal = 'goodBuy' | 'normal' | 'wait' | 'noData';

export interface CropTrend {
  cropName: string;
  /** Ascending by date; only days with a non-null avgPrice for this crop. */
  points: CropTrendPoint[];
  latestPrice: number | null;
  latestDate: string | null;
  /** Mean of points within the last 7 calendar days of the range end (inclusive of the latest point). */
  sevenDayAvg: number | null;
  periodMin: number | null;
  periodMax: number | null;
  /** (latest - sevenDayAvg) / sevenDayAvg * 100, rounded to 1dp. */
  changePct: number | null;
  signal: BuySignal;
  signalNote: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Adds `days` (may be negative) to an ISO "YYYY-MM-DD" date string, returning an ISO date string. */
function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Builds trend + buy-timing signal data for each requested crop name from a
 * set of (possibly unordered, possibly duplicate-dated) market price
 * snapshots. Snapshots whose entry for a crop is missing or has a null
 * `avgPrice` are simply skipped for that crop (not treated as zero).
 */
export function buildCropTrends(snapshots: MarketPriceSnapshot[], cropNames: string[]): CropTrend[] {
  const sorted = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return cropNames.map((cropName) => {
    const points: CropTrendPoint[] = [];
    for (const snap of sorted) {
      const entry = snap.entries.find((e) => e.cropName === cropName);
      if (!entry || typeof entry.avgPrice !== 'number') continue;
      points.push({ date: snap.date, avgPrice: round2(entry.avgPrice) });
    }

    if (points.length < 2) {
      return {
        cropName,
        points,
        latestPrice: points.length === 1 ? points[0].avgPrice : null,
        latestDate: points.length === 1 ? points[0].date : null,
        sevenDayAvg: null,
        periodMin: points.length === 1 ? points[0].avgPrice : null,
        periodMax: points.length === 1 ? points[0].avgPrice : null,
        changePct: null,
        signal: 'noData',
        signalNote: '資料不足，尚無法判斷採購時機。',
      };
    }

    const latest = points[points.length - 1];
    const rangeEnd = latest.date;
    const windowStart = addDaysIso(rangeEnd, -7);
    const windowPoints = points.filter((p) => p.date > windowStart);
    const sevenDayAvg = windowPoints.length > 0
      ? round2(windowPoints.reduce((sum, p) => sum + p.avgPrice, 0) / windowPoints.length)
      : null;

    const periodMin = round2(Math.min(...points.map((p) => p.avgPrice)));
    const periodMax = round2(Math.max(...points.map((p) => p.avgPrice)));

    let changePct: number | null = null;
    if (sevenDayAvg != null && sevenDayAvg !== 0) {
      changePct = round1(((latest.avgPrice - sevenDayAvg) / sevenDayAvg) * 100);
    }

    let signal: BuySignal = 'noData';
    let signalNote: string;
    if (changePct == null) {
      signal = 'noData';
      signalNote = '資料不足，尚無法判斷採購時機。';
    } else if (changePct <= -10) {
      signal = 'goodBuy';
      signalNote = `最新價 $${latest.avgPrice.toFixed(2)} 較近7日均價 $${(sevenDayAvg as number).toFixed(2)} 低 ${Math.abs(changePct).toFixed(1)}%，適合採購。`;
    } else if (changePct >= 10) {
      signal = 'wait';
      signalNote = `最新價 $${latest.avgPrice.toFixed(2)} 較近7日均價 $${(sevenDayAvg as number).toFixed(2)} 高 ${changePct.toFixed(1)}%，建議觀望。`;
    } else {
      signal = 'normal';
      signalNote = `最新價 $${latest.avgPrice.toFixed(2)} 與近7日均價 $${(sevenDayAvg as number).toFixed(2)} 相近（${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%），價格平穩。`;
    }

    return {
      cropName,
      points,
      latestPrice: latest.avgPrice,
      latestDate: latest.date,
      sevenDayAvg,
      periodMin,
      periodMax,
      changePct,
      signal,
      signalNote,
    };
  });
}

/**
 * Reads cached `/marketPrices/{date}` snapshots for the last `days` days
 * (doc date >= today - days), ordered ascending by date. `days` is capped
 * at 60. Uses a single-field where+orderBy on `date` (no composite index
 * required).
 */
export async function listRecentMarketPriceSnapshots(db: Firestore, days: number): Promise<MarketPriceSnapshot[]> {
  const cappedDays = Math.min(days, MAX_DAYS);
  const cutoffIso = addDaysIso(todayLocalIsoDate(), -cappedDays);

  const q = query(
    collection(db, COLLECTION),
    where('date', '>=', cutoffIso),
    orderBy('date', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MarketPriceSnapshot);
}
