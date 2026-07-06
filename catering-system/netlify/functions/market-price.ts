/**
 * Netlify Function: market-price
 *
 * Feature 032: 果菜市場市價整合 (Wholesale Produce Market Price Integration)
 *
 * Proxies the Taiwan MOA (Ministry of Agriculture) AMIS open-data API so the
 * browser can query wholesale produce transaction prices without hitting
 * cross-origin restrictions. No API key required.
 *
 * Upstream: GET https://data.moa.gov.tw/api/v1/AgriProductsTransType/
 *           ?Start_time={ROC}&End_time={ROC}&CropName={name}&Page=1
 * Dates are ROC format `YYY.MM.DD` (e.g. 2026-07-06 -> `115.07.06`).
 *
 * POST body: { date: "YYYY-MM-DD", cropNames: string[] } (max 30 crop names)
 * Response:  { date, rocDate, prices: PriceEntry[], warnings: string[] }
 *
 * NOTE: This dev/CI environment is network-blocked from data.moa.gov.tw, so
 * the upstream call cannot be live-tested here. Parsing/aggregation logic is
 * defensive and unit-tested separately via the mirrored pure helper
 * `aggregateAmisRows` in src/services/marketPriceService.ts (this file keeps
 * its own copy since Netlify Functions cannot import from src/).
 */

import type { Handler } from '@netlify/functions';

interface AmisRow {
  TransDate: string;
  TcType: string;
  CropCode: string;
  CropName: string;
  MarketCode: string;
  MarketName: string;
  Upper_Price: number;
  Middle_Price: number;
  Lower_Price: number;
  Avg_Price: number;
  Trans_Quantity: number;
}

interface AmisResponse {
  Next?: boolean;
  Page?: number | string;
  RS?: string;
  Data?: AmisRow[];
}

interface PriceEntry {
  cropName: string;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  totalQuantity: number;
  marketCount: number;
  sampleCropNames: string[];
}

const UPSTREAM_BASE = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
const CHUNK_SIZE = 5;
const TIMEOUT_MS = 10_000;
const MAX_CROPS = 30;

/** Converts an ISO "YYYY-MM-DD" date into ROC "YYY.MM.DD" format. */
function toRocDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  const roc = parseInt(y, 10) - 1911;
  return `${roc}.${m}.${d}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Aggregates upstream AMIS rows for a single crop query into a summary price
 * entry. Only rows with Avg_Price > 0 are considered "data" (no-trade days
 * return 0/null and are excluded). Uses a quantity-weighted average of
 * Avg_Price, falling back to a simple mean when all quantities are 0/missing.
 */
function aggregateRows(cropName: string, rows: AmisRow[]): PriceEntry {
  const validRows = rows.filter((r) => typeof r.Avg_Price === 'number' && r.Avg_Price > 0);
  if (validRows.length === 0) {
    return {
      cropName, avgPrice: null, minPrice: null, maxPrice: null,
      totalQuantity: 0, marketCount: 0, sampleCropNames: [],
    };
  }

  const qty = (r: AmisRow) => (typeof r.Trans_Quantity === 'number' && r.Trans_Quantity > 0 ? r.Trans_Quantity : 0);
  const totalQuantity = validRows.reduce((sum, r) => sum + qty(r), 0);
  const avgPrice = totalQuantity > 0
    ? validRows.reduce((sum, r) => sum + r.Avg_Price * qty(r), 0) / totalQuantity
    : validRows.reduce((sum, r) => sum + r.Avg_Price, 0) / validRows.length;

  const allPrices = validRows.map((r) => r.Avg_Price);
  const sampleCropNames: string[] = [];
  for (const r of validRows) {
    if (!sampleCropNames.includes(r.CropName)) sampleCropNames.push(r.CropName);
    if (sampleCropNames.length >= 5) break;
  }

  return {
    cropName,
    avgPrice: round2(avgPrice),
    minPrice: round2(Math.min(...allPrices)),
    maxPrice: round2(Math.max(...allPrices)),
    totalQuantity,
    marketCount: validRows.length,
    sampleCropNames,
  };
}

/** Fetches upstream data for a single crop. Returns null on any failure (network, timeout, bad RS, malformed body). */
async function fetchCrop(rocDate: string, cropName: string): Promise<AmisRow[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${UPSTREAM_BASE}?Start_time=${encodeURIComponent(rocDate)}&End_time=${encodeURIComponent(rocDate)}&CropName=${encodeURIComponent(cropName)}&Page=1`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as AmisResponse;
    if (json.RS !== 'OK' || !Array.isArray(json.Data)) return null;
    return json.Data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let date: string;
  let cropNames: string[];
  try {
    const body = JSON.parse(event.body ?? '{}');
    date = body.date;
    cropNames = body.cropNames;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('invalid date');
    }
    if (!Array.isArray(cropNames) || cropNames.length === 0 || cropNames.length > MAX_CROPS) {
      throw new Error('invalid cropNames');
    }
    if (!cropNames.every((c) => typeof c === 'string' && c.trim().length > 0)) {
      throw new Error('invalid cropNames');
    }
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  const rocDate = toRocDate(date);
  const prices: PriceEntry[] = [];
  const warnings: string[] = [];

  // Chunk to at most CHUNK_SIZE concurrent upstream requests.
  for (let i = 0; i < cropNames.length; i += CHUNK_SIZE) {
    const chunk = cropNames.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(chunk.map((name) => fetchCrop(rocDate, name)));
    results.forEach((rows, idx) => {
      const cropName = chunk[idx];
      if (rows === null) {
        warnings.push(`無法取得「${cropName}」的市場行情資料`);
        return;
      }
      prices.push(aggregateRows(cropName, rows));
    });
  }

  if (prices.length === 0) {
    return { statusCode: 502, body: '所有作物的市場行情查詢皆失敗' };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, rocDate, prices, warnings }),
  };
};
