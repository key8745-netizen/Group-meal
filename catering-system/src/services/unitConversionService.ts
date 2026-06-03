/**
 * unitConversionService.ts
 *
 * The single authorised location for all unit conversions in this system.
 *
 * Design rules (enforced by types and runtime asserts):
 *  1. All internal quantities are stored and computed in integer Grams.
 *  2. kg and taijin are INPUT formats only — they must be converted to Grams
 *     before any service layer computation.
 *  3. Grams → kg/taijin conversions are OUTPUT/DISPLAY only.
 *  4. 'taijin * 0.6' is FORBIDDEN.  Use GRAMS_PER_TAIJIN = 600.
 *  5. All Grams values must be safe non-negative integers.
 *  6. Unknown units throw UnitConversionError — never silently fallback.
 *
 * Import path: '@/services/unitConversionService'
 * Do NOT use src/utils/unitConverter.ts or src/services/unitConverter.ts
 * for any quantity that will be stored or used in AI suggestions.
 */

import type { Grams, Unit } from '@/types/aiBoundary';

// ─── Constants ────────────────────────────────────────────────────────────────

/** 1 kg = 1 000 grams (exact, SI definition) */
export const GRAMS_PER_KG = 1000 as const;

/**
 * 1 台斤 (Taiwanese catty) = 600 grams (exact, legal standard)
 *
 * Do NOT use 0.6 kg as the conversion factor — floating-point multiplication
 * of 0.6 accumulates error.  Always multiply by 600 then compare against
 * the integer gram representation.
 */
export const GRAMS_PER_TAIJIN = 600 as const;

// ─── Error type ───────────────────────────────────────────────────────────────

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(`[unitConversionService] ${message}`);
    this.name = 'UnitConversionError';
  }
}

// ─── Type guards / assertions ─────────────────────────────────────────────────

/**
 * Asserts that a number is a safe non-negative integer suitable for use as Grams.
 * Throws UnitConversionError otherwise.
 *
 * Call this on any value before branding it as Grams.
 */
export function assertIntegerGrams(value: number): asserts value is Grams {
  if (!Number.isFinite(value)) {
    throw new UnitConversionError(`value must be finite, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new UnitConversionError(
      `Grams must be an integer, got ${value}. ` +
      'Round to the nearest gram before converting.',
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new UnitConversionError(
      `value ${value} exceeds Number.MAX_SAFE_INTEGER and cannot be represented exactly`,
    );
  }
  if (value < 0) {
    throw new UnitConversionError(
      `Grams must be non-negative, got ${value}. ` +
      'Use a function that explicitly permits negative values if needed.',
    );
  }
}

/**
 * Asserts that an unknown value is a known Unit string.
 * Throws UnitConversionError for unrecognised units so callers notice schema drift.
 */
export function assertKnownUnit(unit: unknown): asserts unit is Unit {
  const valid: Unit[] = ['grams', 'kg', 'taijin'];
  if (typeof unit !== 'string' || !valid.includes(unit as Unit)) {
    throw new UnitConversionError(
      `Unknown unit "${String(unit)}". Valid units: ${valid.join(', ')}. ` +
      'If this is a new unit, add it to the Unit type in aiBoundary.ts first.',
    );
  }
}

// ─── Core conversion functions ────────────────────────────────────────────────

/**
 * Converts 台斤 to integer Grams.
 *
 * Uses GRAMS_PER_TAIJIN = 600 (not 0.6 kg).
 * Rounds to the nearest gram and validates the result.
 */
export function taijinToGrams(taijin: number): Grams {
  if (!Number.isFinite(taijin)) {
    throw new UnitConversionError(`taijin value must be finite, got ${taijin}`);
  }
  if (taijin < 0) {
    throw new UnitConversionError(`taijin must be non-negative, got ${taijin}`);
  }
  const result = Math.round(taijin * GRAMS_PER_TAIJIN);
  assertIntegerGrams(result);
  return result;
}

/**
 * Converts kg to integer Grams.
 *
 * Uses GRAMS_PER_KG = 1000.
 * Rounds to the nearest gram and validates the result.
 */
export function kgToGrams(kg: number): Grams {
  if (!Number.isFinite(kg)) {
    throw new UnitConversionError(`kg value must be finite, got ${kg}`);
  }
  if (kg < 0) {
    throw new UnitConversionError(`kg must be non-negative, got ${kg}`);
  }
  const result = Math.round(kg * GRAMS_PER_KG);
  assertIntegerGrams(result);
  return result;
}

/**
 * Converts Grams to kg for display purposes.
 * Returns a number with up to 3 decimal places.
 *
 * DISPLAY ONLY — do not store the result or use it in AI computations.
 */
export function gramsToKg(grams: Grams): number {
  assertIntegerGrams(grams);
  return Math.round((grams / GRAMS_PER_KG) * 1000) / 1000;
}

/**
 * Converts Grams to 台斤 for display purposes.
 * Returns a number with up to 2 decimal places.
 *
 * DISPLAY ONLY — do not store the result or use it in AI computations.
 */
export function gramsToTaijin(grams: Grams): number {
  assertIntegerGrams(grams);
  return Math.round((grams / GRAMS_PER_TAIJIN) * 100) / 100;
}

// ─── Dispatch function ────────────────────────────────────────────────────────

/**
 * Converts any supported unit to integer Grams.
 * This is the primary entry point for all service-layer quantity handling.
 *
 * @param value  Numeric quantity in the given unit
 * @param unit   The unit of the input value
 * @returns      Integer Grams
 * @throws       UnitConversionError for unknown units or invalid values
 */
export function toGrams(value: number, unit: Unit): Grams {
  assertKnownUnit(unit);
  switch (unit) {
    case 'grams':
      if (!Number.isInteger(value)) {
        throw new UnitConversionError(
          `When unit is 'grams', value must already be an integer, got ${value}`,
        );
      }
      assertIntegerGrams(value);
      return value as Grams;
    case 'kg':
      return kgToGrams(value);
    case 'taijin':
      return taijinToGrams(value);
  }
}
