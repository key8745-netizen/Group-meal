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

/** 磅（lb，英制/美制通用）：1 磅 = 0.453592 kg。 */
const KG_PER_LB = 0.453592;

/** Convert kilograms to 磅 (pounds). */
export function toLb(kg: number): number {
  return round2(kg / KG_PER_LB);
}

/** Convert 磅 (pounds) to kilograms. */
export function lbToKg(lb: number): number {
  return round2(lb * KG_PER_LB);
}

/** Feature 093: 全站重量顯示單位。內部一律 kg，顯示可切換 台斤 / 磅。 */
export type WeightUnit = 'kg' | '台斤' | '磅';

/** 可選的顯示單位清單（供切換 UI）。 */
export const WEIGHT_UNITS: WeightUnit[] = ['kg', '台斤', '磅'];

/**
 * 依目前顯示單位格式化一個以 kg 儲存的重量。
 * @example formatWeight(1.2, 'kg')   // "1.20 kg"
 * @example formatWeight(0.6, '台斤') // "1.00 台斤"
 * @example formatWeight(0.453592, '磅') // "1.00 磅"
 */
export function formatWeight(kg: number, unit: WeightUnit, digits = 2): string {
  const n = unit === '台斤' ? toTaijin(kg) : unit === '磅' ? toLb(kg) : round2(kg);
  return `${n.toFixed(digits)} ${unit}`;
}

/** 將使用者於某顯示單位輸入的數值換回內部 kg（供可輸入台斤/磅的欄位）。 */
export function inputToKg(value: number, unit: WeightUnit): number {
  return unit === '台斤' ? toKg(value) : unit === '磅' ? lbToKg(value) : round2(value);
}
