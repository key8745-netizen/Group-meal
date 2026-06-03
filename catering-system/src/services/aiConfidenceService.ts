/**
 * aiConfidenceService.ts
 *
 * Grades the confidence of an AI purchase suggestion based on data quality
 * signals extracted from an AIContextSummary.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. All BlockedReasons come from the exhaustive union — no freeform strings.
 *  3. Any BLOCKED reason → level 'BLOCKED', canCreateDraft: false.
 *  4. Legacy kg fallback (LEGACY_KG_FALLBACK_USED) → caps level at MEDIUM.
 *  5. canCreateDraft is ALWAYS false in Phase 3.
 *     Phase 4 will extend this with a human-approval gate.
 *  6. Confidence is per-ingredient AND overall (aggregate of all items).
 *
 * Confidence ladder (downgrade only — never upgrade once blocked):
 *   HIGH    → all data verified, no warnings, stock data complete
 *   MEDIUM  → minor warnings (legacy kg, short usage window)
 *   LOW     → notable gaps (missing daily usage, shortage unknown)
 *   BLOCKED → hard stop (OCR contamination, snapshot validation failure,
 *             missing ingredient ID)
 */

import type {
  Grams, BlockedReason, ConfidenceLevel, SuggestionConfidenceV2,
  InventoryIngredientSummary, SnapshotId,
} from '@/types/aiBoundary';
import { legacyKgMaxConfidence } from './quantityMigrationHelper';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Level helpers ────────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<ConfidenceLevel, number> = {
  HIGH: 3, MEDIUM: 2, LOW: 1, BLOCKED: 0,
};

function minLevel(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return LEVEL_ORDER[a] <= LEVEL_ORDER[b] ? a : b;
}

// ─── PerIngredientGradeInput ──────────────────────────────────────────────────

export interface PerIngredientGradeInput {
  ingredientId: string;
  shortageGrams: Grams;
  averageDailyUsageGrams?: Grams;
  inventorySummary?: InventoryIngredientSummary;
  /** Warnings from the parent summary that apply globally */
  summaryWarnings: BlockedReason[];
  /** Blocked reasons from the parent summary that apply globally */
  summaryBlockedReasons: BlockedReason[];
  sourceSnapshotId: SnapshotId;
}

/**
 * Grades confidence for a single ingredient suggestion.
 * canCreateDraft is always false (Phase 3).
 */
export function gradeIngredientConfidence(
  input: PerIngredientGradeInput,
): SuggestionConfidenceV2 {
  const {
    ingredientId, shortageGrams, averageDailyUsageGrams,
    inventorySummary, summaryWarnings, summaryBlockedReasons, sourceSnapshotId,
  } = input;

  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];
  let level: ConfidenceLevel = 'HIGH';

  // ── Hard BLOCKED checks ───────────────────────────────────────────────────

  if (!ingredientId) {
    blocked.push('MISSING_INGREDIENT_ID');
    return makeResult('BLOCKED', blocked, warnings, sourceSnapshotId);
  }

  // Propagate any hard global blocks
  for (const r of summaryBlockedReasons) {
    if (!blocked.includes(r)) blocked.push(r);
  }
  if (blocked.length > 0) {
    return makeResult('BLOCKED', blocked, warnings, sourceSnapshotId);
  }

  // Ingredient-level contamination
  if (inventorySummary && !inventorySummary.isVerified) {
    blocked.push('UNVERIFIED_OCR_SOURCE');
    return makeResult('BLOCKED', blocked, warnings, sourceSnapshotId);
  }

  if (inventorySummary && inventorySummary.blockedReasons.length > 0) {
    for (const r of inventorySummary.blockedReasons) {
      if (!blocked.includes(r)) blocked.push(r);
    }
    return makeResult('BLOCKED', blocked, warnings, sourceSnapshotId);
  }

  // ── Warning signals (degrade level) ──────────────────────────────────────

  // Propagate summary warnings
  for (const w of summaryWarnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }

  // Legacy kg fallback caps at MEDIUM
  if (summaryWarnings.includes('LEGACY_KG_FALLBACK_USED')) {
    const cap = legacyKgMaxConfidence(); // 'MEDIUM'
    level = minLevel(level, cap);
  }

  // Ingredient-level warnings
  if (inventorySummary) {
    for (const w of inventorySummary.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }

  // Missing inventory summary → degrade to LOW
  if (!inventorySummary) {
    warnings.push('MISSING_GRAMS_FIELD');
    level = minLevel(level, 'LOW');
  }

  // No daily usage data → degrade to LOW (cannot validate suggestion magnitude)
  if (averageDailyUsageGrams === undefined) {
    warnings.push('INCOMPLETE_BOM');
    level = minLevel(level, 'LOW');
  } else if (averageDailyUsageGrams === 0) {
    level = minLevel(level, 'MEDIUM');
  } else {
    // If shortage is huge relative to daily usage, suggest human review
    const coverageDays = shortageGrams / averageDailyUsageGrams;
    if (coverageDays > 90) {
      // Shortage covers >90 days of usage — unusually large
      warnings.push('NEGATIVE_STOCK_UNVERIFIED');
      level = minLevel(level, 'LOW');
    }
  }

  // Incomplete BOM warning from summary
  if (summaryWarnings.includes('INCOMPLETE_BOM')) {
    level = minLevel(level, 'MEDIUM');
  }

  return makeResult(level, blocked, warnings, sourceSnapshotId);
}

// ─── gradeOverallConfidence ───────────────────────────────────────────────────

/**
 * Computes the aggregate confidence level across all suggestion items.
 * The overall level is the minimum across all per-item levels.
 * canCreateDraft is always false (Phase 3).
 */
export function gradeOverallConfidence(
  itemConfidences: SuggestionConfidenceV2[],
  summaryWarnings: BlockedReason[],
  summaryBlockedReasons: BlockedReason[],
  sourceSnapshotId: SnapshotId,
): SuggestionConfidenceV2 {
  const allBlocked: BlockedReason[] = [...summaryBlockedReasons];
  const allWarnings: BlockedReason[] = [...summaryWarnings];
  let level: ConfidenceLevel = itemConfidences.length > 0 ? 'HIGH' : 'LOW';

  for (const item of itemConfidences) {
    level = minLevel(level, item.level);
    for (const r of item.blockedReasons) {
      if (!allBlocked.includes(r)) allBlocked.push(r);
    }
    for (const w of item.warnings) {
      if (!allWarnings.includes(w)) allWarnings.push(w);
    }
  }

  if (allBlocked.length > 0) level = 'BLOCKED';

  return makeResult(level, allBlocked, allWarnings, sourceSnapshotId);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function makeResult(
  level: ConfidenceLevel,
  blockedReasons: BlockedReason[],
  warnings: BlockedReason[],
  sourceSnapshotId: SnapshotId,
): SuggestionConfidenceV2 {
  return {
    level,
    reasons:        [...blockedReasons, ...warnings].map(r => String(r)),
    blockReason:    blockedReasons[0] ?? null,
    blockedReasons,
    warnings,
    canCreateDraft: false, // Phase 3: always false
    sourceSnapshotId,
  };
}
