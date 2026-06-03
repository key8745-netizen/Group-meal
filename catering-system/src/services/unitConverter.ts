/**
 * Unit conversion rules:
 *  - ALL internal storage is in kg (Firestore, services, AI suggestions)
 *  - UI components may display in 台斤 but MUST convert back to kg before writing
 *  - purchaseTaijin on PurchaseOrderItem is DISPLAY-ONLY — never use it for arithmetic
 *  - All results are rounded to 3 decimal places (r3) to prevent floating-point accumulation
 *
 * 1 台斤 (Taiwanese catty) = 0.6 kg  (exact, defined by law)
 * 1 kg = 1.66666… 台斤  → always round after conversion, never chain without rounding
 */

const TW_JIN_TO_KG = 0.6;

/** Round to 3 decimal places — applied to every conversion output to prevent drift */
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export class UnitConverter {
  static twJinToKg(value: number): number {
    return r3(value * TW_JIN_TO_KG);
  }

  static kgToTwJin(value: number): number {
    // 5dp then r3: 1/0.6 = 1.66667, keep 3dp for display purposes
    return r3(value / TW_JIN_TO_KG);
  }

  /**
   * Normalises any supported unit to kg.
   * Every result is rounded to 3dp to prevent floating-point accumulation.
   * Volume units (L) are treated as 1:1 with kg (water density assumption).
   * Throws for unknown units so callers notice schema mismatches early.
   */
  static toKg(value: number, unit: string): number {
    if (!Number.isFinite(value)) {
      throw new Error(`UnitConverter: non-finite value ${value} for unit "${unit}"`);
    }
    switch (unit.toLowerCase()) {
      case 'kg':
        return r3(value);
      case 'g':
        return r3(value / 1000);
      case '台斤':
        return UnitConverter.twJinToKg(value);
      case 'l':
      case 'liter':
        return r3(value);
      case 'piece':
        return r3(value);
      default:
        throw new Error(`UnitConverter: unsupported unit "${unit}"`);
    }
  }
}
