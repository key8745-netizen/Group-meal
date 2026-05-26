/** 1 台斤 (Taiwanese catty) = 0.6 kg */
const TW_JIN_TO_KG = 0.6;

export class UnitConverter {
  static twJinToKg(value: number): number {
    return value * TW_JIN_TO_KG;
  }

  static kgToTwJin(value: number): number {
    return value / TW_JIN_TO_KG;
  }

  /**
   * Normalises any supported unit to kg.
   * Volume units (L) are treated as 1:1 with kg (water density assumption).
   * Throws for unknown units so callers notice schema mismatches early.
   */
  static toKg(value: number, unit: string): number {
    switch (unit.toLowerCase()) {
      case 'kg':
        return value;
      case 'g':
        return value / 1000;
      case '台斤':
        return UnitConverter.twJinToKg(value);
      case 'l':
      case 'liter':
        return value;
      case 'piece':
        return value;
      default:
        throw new Error(`UnitConverter: unsupported unit "${unit}"`);
    }
  }
}
