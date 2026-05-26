/**
 * Lightweight kg ↔ 台斤 conversion utilities.
 *
 * Conversion basis: 1 台斤 = 0.6 kg  →  1 kg = 1.66667 台斤
 *
 * All outputs are rounded to 2 decimal places.
 *
 * Note: src/services/unitConverter.ts is the full-featured multi-unit converter
 * used internally by the purchase / performance services.  This module provides
 * a simple, import-friendly API for UI components and scripts.
 */

const KG_PER_TAIJIN   = 0.6;
const TAIJIN_PER_KG   = 1 / KG_PER_TAIJIN; // ≈ 1.66667

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Convert kilograms to 台斤 (Taiwanese catty).
 * @example toTaijin(1)   // 1.67
 * @example toTaijin(0.6) // 1
 */
export function toTaijin(kg: number): number {
  return round2(kg * TAIJIN_PER_KG);
}

/**
 * Convert 台斤 (Taiwanese catty) to kilograms.
 * @example toKg(1)    // 0.6
 * @example toKg(1.67) // 1
 */
export function toKg(taijin: number): number {
  return round2(taijin * KG_PER_TAIJIN);
}
