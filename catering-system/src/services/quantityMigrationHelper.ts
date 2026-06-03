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
 *  4. Legacy kg fallback produces BOTH a readable valueGrams (for human inspection)
 *     AND a blockedReason that prevents AI suggestion use.
 *  5. grams + kg mismatch → always BLOCKED, valueGrams is undefined.
 *  6. canUseForAISuggestion() is the authoritative gate — any caller that
 *     wants to use a quantity in an AI suggestion MUST call this first.
 */

import type { Grams, BlockedReason } from '@/types/aiBoundary';
import { kgToGrams } from './unitConversionService';

// ─── Tolerance ────────────────────────────────────────────────────────────────

/**
 * Maximum allowed difference in grams between a stored grams value and the
 * grams value derived from a stored kg value, before declaring UNIT_MIGRATION_MISMATCH.
 * Set to 1 gram — rounding differences of ≤1g are acceptable during migration.
 */
const MISMATCH_TOLERANCE_GRAMS = 1;

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ReadQuantityAsGramsResult {
  /**
   * Resolved gram value.
   * Present even when legacy fallback is used (for human display).
   * Absent only when data is truly unusable (mismatch, missing, invalid).
   */
  valueGrams?: Grams;
  /**
   * Non-empty → this quantity MUST NOT be used for AI suggestions.
   * Use canUseForAISuggestion() to check in one call.
   */
  blockedReasons: BlockedReason[];
  /** Non-fatal observations visible in UI — also populated for legacy fallback */
  warnings: BlockedReason[];
  /** true when kg was the only source — always coincides with a blockedReason */
  usedLegacyFallback: boolean;
}

// ─── readQuantityAsGrams ──────────────────────────────────────────────────────

/**
 * Reads a quantity field from a Firestore document that may be stored in either
 * the new grams format or the legacy kg format.
 *
 * Priority and validation rules:
 *  1. grams only  → use grams, no warnings, AI-safe.
 *  2. kg only     → convert to grams, valueGrams set for human display,
 *                   LEGACY_KG_FALLBACK_USED in BOTH blockedReasons and warnings,
 *                   AI MUST NOT use this value.
 *  3. grams + kg, consistent (diff ≤ 1g) → use grams, no warnings, AI-safe.
 *  4. grams + kg, inconsistent → BLOCKED: UNIT_MIGRATION_MISMATCH, valueGrams undefined.
 *  5. Neither present → BLOCKED: MISSING_GRAMS_FIELD, valueGrams undefined.
 */
export function readQuantityAsGrams(input: {
  grams?: number;
  kg?: number;
  fieldName: string;
}): ReadQuantityAsGramsResult {
  const { grams, kg } = input;

  const hasGrams = grams !== undefined && grams !== null;
  const hasKg    = kg    !== undefined && kg    !== null;

  // ── Neither present ───────────────────────────────────────────────────────
  if (!hasGrams && !hasKg) {
    return {
      valueGrams:         undefined,
      blockedReasons:     ['MISSING_GRAMS_FIELD'],
      warnings:           [],
      usedLegacyFallback: false,
    };
  }

  // ── Both present — check consistency ─────────────────────────────────────
  if (hasGrams && hasKg) {
    if (!Number.isFinite(grams!) || grams! < 0 || !Number.isFinite(kg!) || kg! < 0) {
      return {
        valueGrams:         undefined,
        blockedReasons:     ['UNIT_MIGRATION_MISMATCH'],
        warnings:           [],
        usedLegacyFallback: false,
      };
    }

    let derivedFromKg: Grams;
    try {
      derivedFromKg = kgToGrams(kg!);
    } catch {
      return {
        valueGrams:         undefined,
        blockedReasons:     ['UNIT_MIGRATION_MISMATCH'],
        warnings:           [],
        usedLegacyFallback: false,
      };
    }

    const storedGramsRounded = Math.round(grams!);
    const diff = Math.abs(storedGramsRounded - derivedFromKg);

    if (diff > MISMATCH_TOLERANCE_GRAMS) {
      return {
        valueGrams:         undefined,
        blockedReasons:     ['UNIT_MIGRATION_MISMATCH'],
        warnings:           [],
        usedLegacyFallback: false,
      };
    }

    // Consistent — use rounded grams value
    return {
      valueGrams:         storedGramsRounded as Grams,
      blockedReasons:     [],
      warnings:           [],
      usedLegacyFallback: false,
    };
  }

  // ── Only grams present — preferred path ──────────────────────────────────
  if (hasGrams && !hasKg) {
    if (!Number.isFinite(grams!) || grams! < 0) {
      return {
        valueGrams:         undefined,
        blockedReasons:     ['MISSING_GRAMS_FIELD'],
        warnings:           [],
        usedLegacyFallback: false,
      };
    }
    return {
      valueGrams:         Math.round(grams!) as Grams,
      blockedReasons:     [],
      warnings:           [],
      usedLegacyFallback: false,
    };
  }

  // ── Only kg present — legacy fallback ────────────────────────────────────
  // valueGrams is set for human display, but BLOCKED for AI use.
  // LEGACY_KG_FALLBACK_USED appears in BOTH blockedReasons and warnings so:
  //   - canUseForAISuggestion() returns false (blockedReasons non-empty)
  //   - UI can show the warning badge to prompt migration
  if (!Number.isFinite(kg!) || kg! < 0) {
    return {
      valueGrams:         undefined,
      blockedReasons:     ['MISSING_GRAMS_FIELD'],
      warnings:           [],
      usedLegacyFallback: false,
    };
  }

  let converted: Grams;
  try {
    converted = kgToGrams(kg!);
  } catch {
    return {
      valueGrams:         undefined,
      blockedReasons:     ['MISSING_GRAMS_FIELD', 'LEGACY_QUANTITY_BLOCKED_FOR_AI'],
      warnings:           ['LEGACY_KG_FALLBACK_USED'],
      usedLegacyFallback: true,
    };
  }

  return {
    valueGrams:         converted,        // readable by humans
    blockedReasons:     ['LEGACY_KG_FALLBACK_USED', 'LEGACY_QUANTITY_BLOCKED_FOR_AI'],
    warnings:           ['LEGACY_KG_FALLBACK_USED'],
    usedLegacyFallback: true,
  };
}

// ─── canUseForAISuggestion ────────────────────────────────────────────────────

/**
 * Returns true only when a ReadQuantityAsGramsResult is safe to use in an
 * AI-generated purchase suggestion.
 *
 * Rules (ALL must hold):
 *  - blockedReasons is empty
 *  - usedLegacyFallback is false
 *  - valueGrams is present
 *
 * This is the authoritative gate — every AI suggestion that involves a
 * quantity MUST pass this check before proceeding.
 */
export function canUseForAISuggestion(result: ReadQuantityAsGramsResult): boolean {
  return (
    result.blockedReasons.length === 0 &&
    !result.usedLegacyFallback &&
    result.valueGrams !== undefined
  );
}

/**
 * Returns the maximum confidence level allowed when a legacy kg fallback was used.
 * AI suggestions built from legacy-only data cannot exceed MEDIUM confidence.
 */
export function legacyKgMaxConfidence(): 'MEDIUM' {
  return 'MEDIUM';
}
