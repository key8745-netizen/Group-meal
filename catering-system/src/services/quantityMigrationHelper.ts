/**
 * quantityMigrationHelper.ts
 *
 * Phase A compatibility reader for documents that may store quantities in kg
 * (legacy format) instead of grams (new canonical format).
 *
 * HARD RULES FOR THIS FILE:
 *  1. Read-only — never writes to Firestore.
 *  2. Never starts a migration job.
 *  3. Never modifies production data.
 *  4. Any AI suggestion that used a legacy kg fallback cannot be HIGH confidence.
 *  5. grams + kg mismatch → always BLOCKED, never silently resolved.
 *
 * Usage:
 *   Call readQuantityAsGrams() when reading a Firestore document field that
 *   might be stored in either the new (grams) or legacy (kg) format.
 *   Inspect warnings and blockedReasons before using the result.
 */

import type { Grams, BlockedReason } from '@/types/aiBoundary';
import { kgToGrams } from './unitConversionService';

// ─── Tolerance ────────────────────────────────────────────────────────────────

/**
 * Maximum allowed difference in grams between a stored grams value and the
 * grams value derived from a stored kg value, before declaring UNIT_MIGRATION_MISMATCH.
 *
 * Set to 1 gram — rounding differences of ≤1g are acceptable during migration;
 * larger differences indicate a genuine data inconsistency.
 */
const MISMATCH_TOLERANCE_GRAMS = 1;

// ─── Result type ──────────────────────────────────────────────────────────────

export interface QuantityReadResult {
  /** Resolved gram value, or undefined when blocked */
  valueGrams?: Grams;
  /** When non-empty, valueGrams is undefined and the caller must not proceed */
  blockedReasons: BlockedReason[];
  /** Non-fatal observations — HIGH confidence must be downgraded if non-empty */
  warnings: BlockedReason[];
  /** true when kg was used because grams was absent — degrades max confidence to MEDIUM */
  usedLegacyFallback: boolean;
}

// ─── readQuantityAsGrams ──────────────────────────────────────────────────────

/**
 * Reads a quantity field from a Firestore document that may be stored in either
 * the new grams format or the legacy kg format.
 *
 * Priority and validation rules:
 *  1. If grams is present and valid → use grams (preferred path).
 *  2. If only kg is present → convert to grams + add LEGACY_KG_FALLBACK_USED warning.
 *  3. If both grams and kg are present and consistent (≤1g diff) → use grams.
 *  4. If both grams and kg are present but inconsistent → BLOCKED: UNIT_MIGRATION_MISMATCH.
 *  5. If neither is present → BLOCKED: MISSING_GRAMS_FIELD.
 *
 * @param input.grams      Raw grams value from the Firestore document (if present)
 * @param input.kg         Raw kg value from the Firestore document (if present)
 * @param input.fieldName  The logical field name for error messages
 */
export function readQuantityAsGrams(input: {
  grams?: number;
  kg?: number;
  fieldName: string;
}): QuantityReadResult {
  const { grams, kg } = input;

  const hasGrams = grams !== undefined && grams !== null;
  const hasKg    = kg    !== undefined && kg    !== null;

  // ── Neither present ───────────────────────────────────────────────────────
  if (!hasGrams && !hasKg) {
    return {
      valueGrams:        undefined,
      blockedReasons:    ['MISSING_GRAMS_FIELD'],
      warnings:          [],
      usedLegacyFallback: false,
    };
  }

  // ── Both present — check consistency ─────────────────────────────────────
  if (hasGrams && hasKg) {
    if (!Number.isFinite(grams!) || grams! < 0) {
      return {
        valueGrams:        undefined,
        blockedReasons:    ['UNIT_MIGRATION_MISMATCH'],
        warnings:          [],
        usedLegacyFallback: false,
      };
    }
    if (!Number.isFinite(kg!) || kg! < 0) {
      return {
        valueGrams:        undefined,
        blockedReasons:    ['UNIT_MIGRATION_MISMATCH'],
        warnings:          [],
        usedLegacyFallback: false,
      };
    }

    let derivedFromKg: Grams;
    try {
      derivedFromKg = kgToGrams(kg!);
    } catch {
      return {
        valueGrams:        undefined,
        blockedReasons:    ['UNIT_MIGRATION_MISMATCH'],
        warnings:          [],
        usedLegacyFallback: false,
      };
    }

    const storedGramsRounded = Math.round(grams!);
    const diff = Math.abs(storedGramsRounded - derivedFromKg);

    if (diff > MISMATCH_TOLERANCE_GRAMS) {
      return {
        valueGrams:        undefined,
        blockedReasons:    ['UNIT_MIGRATION_MISMATCH'],
        warnings:          [],
        usedLegacyFallback: false,
      };
    }

    // Consistent — use the grams value (rounded to integer)
    const validated = storedGramsRounded as Grams;
    return {
      valueGrams:        validated,
      blockedReasons:    [],
      warnings:          [],
      usedLegacyFallback: false,
    };
  }

  // ── Only grams present ────────────────────────────────────────────────────
  if (hasGrams && !hasKg) {
    if (!Number.isFinite(grams!) || grams! < 0) {
      return {
        valueGrams:        undefined,
        blockedReasons:    ['MISSING_GRAMS_FIELD'],
        warnings:          [],
        usedLegacyFallback: false,
      };
    }
    const rounded = Math.round(grams!) as Grams;
    return {
      valueGrams:        rounded,
      blockedReasons:    [],
      warnings:          [],
      usedLegacyFallback: false,
    };
  }

  // ── Only kg present — legacy fallback ─────────────────────────────────────
  // hasKg === true, hasGrams === false
  if (!Number.isFinite(kg!) || kg! < 0) {
    return {
      valueGrams:        undefined,
      blockedReasons:    ['MISSING_GRAMS_FIELD'],
      warnings:          [],
      usedLegacyFallback: false,
    };
  }

  let converted: Grams;
  try {
    converted = kgToGrams(kg!);
  } catch {
    return {
      valueGrams:        undefined,
      blockedReasons:    ['MISSING_GRAMS_FIELD'],
      warnings:          [`LEGACY_KG_FALLBACK_USED` as BlockedReason],
      usedLegacyFallback: true,
    };
  }

  // Legacy fallback succeeded — caller must not assign HIGH confidence
  return {
    valueGrams:        converted,
    blockedReasons:    [],
    warnings:          ['LEGACY_KG_FALLBACK_USED'],
    usedLegacyFallback: true,
  };
}

// ─── legacyKgDegradedConfidence ───────────────────────────────────────────────

/**
 * Returns the maximum confidence level allowed when a legacy kg fallback was used.
 * Any AI suggestion built from legacy data cannot be HIGH confidence.
 *
 * Usage:
 *   if (result.usedLegacyFallback) {
 *     maxLevel = legacyKgDegradedConfidence(); // 'MEDIUM'
 *   }
 */
export function legacyKgMaxConfidence(): 'MEDIUM' {
  return 'MEDIUM';
}
