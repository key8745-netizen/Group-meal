/**
 * marketPriceService — Feature 032: 果菜市場市價整合 (Wholesale Produce Market
 * Price Integration).
 *
 * Fetches daily wholesale produce prices via the `market-price` Netlify
 * function (a proxy to the Taiwan MOA AMIS open-data API) and caches the
 * result at `/marketPrices/{date}` (doc ID = ISO date). Follows the `db:
 * Firestore` dependency-injection convention used by inventoryService /
 * purchaseService / recipeMatchingService.
 */

import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, serverTimestamp, type Firestore,
} from 'firebase/firestore';
import type { IngredientMaster, MarketPriceEntry, MarketPriceSnapshot } from './types';

const COLLECTION = 'marketPrices';

/** Converts an ISO "YYYY-MM-DD" date into the ROC "YYY.MM.DD" format used by the AMIS API. */
export function toRocDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  const roc = parseInt(y, 10) - 1911;
  return `${roc}.${m}.${d}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Converts an ingredient's `defaultPrice`/`defaultPriceUnit` into an
 * approximate NT$/kg figure, for comparison against AMIS market prices
 * (also denominated in NT$/kg).
 *
 * Assumptions (documented since the source data is inherently imprecise):
 * - `defaultPriceUnit === 'kg'` → price is already NT$/kg, used as-is.
 * - `defaultPriceUnit === '台斤'` → 1 台斤 = 0.6kg, so NT$/kg = price / 0.6.
 * - `defaultPriceUnit === 'g'` → NT$/kg = price * 1000.
 * - `defaultPriceUnit === purchaseUnit` (e.g. "箱", "包") and `baseUnit` is
 *   'g' or 'ml': `defaultPrice` is per purchase unit; converting via
 *   `conversionFactorToBaseUnit` gives price per base gram/ml, and 'ml' is
 *   assumed to be ~1g (water-density approximation) for produce items.
 * - Anything else (e.g. `baseUnit === 'pcs'`, or an unrecognized unit with
 *   no base-unit conversion available) cannot be meaningfully converted to
 *   a per-kg price, so this returns `null`.
 *
 * Result is rounded to 2 decimal places.
 */
export function pricePerKgFromDefault(ing: IngredientMaster): number | null {
  const price = ing.defaultPrice;
  const unit = ing.defaultPriceUnit;
  if (typeof price !== 'number' || !(price >= 0)) return null;

  if (unit === 'kg') return round2(price);
  if (unit === '台斤') return round2(price / 0.6);
  if (unit === 'g') return round2(price * 1000);

  if (unit === ing.purchaseUnit && (ing.baseUnit === 'g' || ing.baseUnit === 'ml')) {
    const factor = ing.conversionFactorToBaseUnit;
    if (!(factor > 0)) return null;
    // price per purchaseUnit -> price per base gram/ml -> price per kg (x1000)
    return round2((price / factor) * 1000);
  }

  return null;
}

/** A single upstream AMIS transaction row, as relevant to aggregation. */
export interface AmisTransactionRow {
  CropName: string;
  Avg_Price: number | null | undefined;
  Trans_Quantity: number | null | undefined;
}

/** Result of aggregating a single crop's upstream rows for one day. */
export interface AggregatedMarketPrice {
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  totalQuantity: number;
  marketCount: number;
  sampleCropNames: string[];
}

/**
 * Aggregates upstream AMIS transaction rows for a single crop query.
 * Only rows with `Avg_Price > 0` are treated as real data (no-trade days
 * report 0/null and are excluded). Uses a quantity-weighted average of
 * `Avg_Price`, falling back to a simple mean when all quantities are
 * 0/missing. Mirrored (duplicated, not imported) in
 * netlify/functions/market-price.ts since Netlify Functions cannot import
 * from src/.
 */
export function aggregateAmisRows(rows: AmisTransactionRow[]): AggregatedMarketPrice {
  const validRows = rows.filter((r) => typeof r.Avg_Price === 'number' && r.Avg_Price > 0);
  if (validRows.length === 0) {
    return { avgPrice: null, minPrice: null, maxPrice: null, totalQuantity: 0, marketCount: 0, sampleCropNames: [] };
  }

  const qty = (r: AmisTransactionRow) => (typeof r.Trans_Quantity === 'number' && r.Trans_Quantity > 0 ? r.Trans_Quantity : 0);
  const totalQuantity = validRows.reduce((sum, r) => sum + qty(r), 0);
  const avgPrice = totalQuantity > 0
    ? validRows.reduce((sum, r) => sum + (r.Avg_Price as number) * qty(r), 0) / totalQuantity
    : validRows.reduce((sum, r) => sum + (r.Avg_Price as number), 0) / validRows.length;

  const allPrices = validRows.map((r) => r.Avg_Price as number);
  const sampleCropNames: string[] = [];
  for (const r of validRows) {
    if (!sampleCropNames.includes(r.CropName)) sampleCropNames.push(r.CropName);
    if (sampleCropNames.length >= 5) break;
  }

  return {
    avgPrice: round2(avgPrice),
    minPrice: round2(Math.min(...allPrices)),
    maxPrice: round2(Math.max(...allPrices)),
    totalQuantity,
    marketCount: validRows.length,
    sampleCropNames,
  };
}

/**
 * Splits the crop name list into request-sized batches. The Netlify function
 * caps one request at 30 crops, and each crop costs an upstream AMIS fetch —
 * batches must stay well under the function's ~10s execution limit, so we
 * send at most 10 crops per invocation.
 */
export const FETCH_BATCH_SIZE = 10;

export function chunkCropNames(cropNames: string[], size: number = FETCH_BATCH_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < cropNames.length; i += size) {
    chunks.push(cropNames.slice(i, i + size));
  }
  return chunks;
}

interface MarketPriceFunctionResponse {
  date: string;
  rocDate: string;
  prices: MarketPriceEntry[];
  warnings?: string[];
}

async function fetchMarketPriceBatch(date: string, cropNames: string[]): Promise<MarketPriceFunctionResponse> {
  const res = await fetch('/.netlify/functions/market-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, cropNames }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const message = text && !text.trim().startsWith('<')
      ? text
      : `市場行情查詢失敗（HTTP ${res.status}），請確認 Netlify function 已部署`;
    throw new Error(message);
  }

  try {
    return await res.json();
  } catch {
    throw new Error('市場行情查詢失敗：伺服器未回傳有效資料，請確認 Netlify function 已部署');
  }
}

/**
 * Calls the `market-price` Netlify function for the given date/crop names —
 * in sequential batches of FETCH_BATCH_SIZE so large tracked-ingredient lists
 * stay within the function's per-request crop cap and execution time limit —
 * merges the results, then caches the full snapshot at `/marketPrices/{date}`
 * (merge-overwrite of the whole doc). A failed batch degrades to warnings for
 * its crops instead of failing the whole refresh; only total failure throws.
 */
export async function fetchAndCacheMarketPrices(
  db: Firestore,
  date: string,
  cropNames: string[],
  uid: string,
): Promise<MarketPriceSnapshot> {
  const batches = chunkCropNames(cropNames);
  const entries: MarketPriceEntry[] = [];
  const warnings: string[] = [];
  let rocDate = '';
  let anySucceeded = false;
  let firstError: Error | null = null;

  for (const batch of batches) {
    try {
      const data = await fetchMarketPriceBatch(date, batch);
      anySucceeded = true;
      rocDate = data.rocDate || rocDate;
      entries.push(...data.prices);
      warnings.push(...(data.warnings ?? []));
    } catch (err) {
      firstError = firstError ?? (err instanceof Error ? err : new Error(String(err)));
      warnings.push(`批次查詢失敗（${batch.join('、')}）`);
    }
  }

  if (!anySucceeded) {
    throw firstError ?? new Error('市場行情查詢失敗');
  }

  const snapshot: MarketPriceSnapshot = {
    id: date,
    date,
    rocDate,
    entries,
    warnings,
    fetchedBy: uid,
  };

  await setDoc(doc(db, COLLECTION, date), {
    date: snapshot.date,
    rocDate: snapshot.rocDate,
    entries: snapshot.entries,
    warnings: snapshot.warnings,
    fetchedAt: serverTimestamp(),
    fetchedBy: uid,
  });

  return snapshot;
}

/** Reads the cached market price snapshot for a given ISO date, or null if not yet fetched. */
export async function getMarketPriceSnapshot(db: Firestore, date: string): Promise<MarketPriceSnapshot | null> {
  const snap = await getDoc(doc(db, COLLECTION, date));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as MarketPriceSnapshot;
}

/**
 * Feature 063: Reads the most recent N daily snapshots (newest first) for
 * building per-ingredient price-history sparklines. Ordered by the `date`
 * field so the caller can feed them to buildPriceHistory (which re-sorts).
 */
export async function fetchRecentMarketSnapshots(
  db: Firestore,
  n = 14,
): Promise<MarketPriceSnapshot[]> {
  const q = query(collection(db, COLLECTION), orderBy('date', 'desc'), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MarketPriceSnapshot));
}

/**
 * Local (browser-timezone) ISO date "YYYY-MM-DD" for "today". Used to key
 * the daily `/marketPrices/{date}` cache consistently between manual
 * refresh (Feature 032) and the Feature 035 auto-refresh helpers below.
 */
export function todayLocalIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Feature 035: 每日市價自動更新 — pure staleness check.
 *
 * Returns true when there is something worth fetching (`cropNames` non-empty)
 * AND the cached snapshot doesn't already cover every requested crop name
 * (compared as sets — extra entries already cached for other crops are
 * fine). A null snapshot is always stale when there is at least one crop to
 * track.
 */
export function shouldRefreshSnapshot(snapshot: MarketPriceSnapshot | null, cropNames: string[]): boolean {
  if (cropNames.length === 0) return false;
  if (!snapshot) return true;
  const covered = new Set(snapshot.entries.map((e) => e.cropName));
  return cropNames.some((name) => !covered.has(name));
}

/**
 * Feature 035: ensures today's market price snapshot is cached and covers
 * every ingredient's `marketCropName`, fetching only when necessary
 * (`shouldRefreshSnapshot`). Best-effort: never throws — on any read/fetch
 * failure it falls back to whatever snapshot (possibly null) was already
 * available, so callers can render partial/stale data instead of breaking.
 */
export async function ensureTodayMarketPrices(
  db: Firestore,
  ingredients: IngredientMaster[],
  uid: string,
): Promise<MarketPriceSnapshot | null> {
  const date = todayLocalIsoDate();
  const cropNames = Array.from(new Set(
    ingredients
      .map((i) => i.marketCropName)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
  ));

  let existing: MarketPriceSnapshot | null = null;
  try {
    existing = await getMarketPriceSnapshot(db, date);
  } catch {
    existing = null;
  }

  if (!shouldRefreshSnapshot(existing, cropNames)) {
    return existing;
  }

  try {
    return await fetchAndCacheMarketPrices(db, date, cropNames, uid);
  } catch {
    return existing;
  }
}
