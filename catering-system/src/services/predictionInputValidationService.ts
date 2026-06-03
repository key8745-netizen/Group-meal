/**
 * predictionInputValidationService.ts
 *
 * Validates PredictionInputSummary and computes dataQualityScore.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. containsRawData !== false → BLOCKED.
 *  3. tenant mismatch → BLOCKED.
 *  4. sourceAggregationLevel === 'blocked_single_source' → BLOCKED.
 *  5. maxPurchaseLimitGrams missing → BLOCKED.
 *  6. dataQualityScore < 0.4 → BLOCKED.
 *  7. dataQualityScore < 0.6 → LOW warning.
 *  8. All Grams fields must be valid via asGrams().
 */

import type {
  PredictionInputSummary,
  PredictionValidationResult,
} from '@/types/predictionEngine';
import type { BlockedReason, Grams } from '@/types/predictionEngine';
import { isGrams } from './unitConversionService';

// ─── calculateDataQualityScore ────────────────────────────────────────────────

/**
 * Computes a 0–1 data quality score from the input summary.
 *
 * Formula:
 *   sampleCompletenessScore =
 *     min(historicalUsage.sampleCount / 10, 1) × 0.35
 *   + min(wasteRisk.sampleCount / 5, 1)         × 0.20
 *   + min(receivingDelta.sampleCount / 5, 1)    × 0.20
 *   historyCoverageScore =
 *     min(historicalUsage.sampleDays / 30, 1)   × 0.15
 *   sourceSafetyScore =
 *     'tenant_ingredient_period' → 0.10
 *     'category_period'          → 0.07
 *     'blocked_single_source'    → 0
 *
 * Result clamped to [0, 1].
 */
export function calculateDataQualityScore(input: PredictionInputSummary): number {
  const { historicalUsageSummary, wasteRiskSummary, receivingDeltaSummary, sourceAggregationLevel } = input;

  const sampleCompletenessScore =
    Math.min(historicalUsageSummary.sampleCount / 10, 1) * 0.35 +
    Math.min(wasteRiskSummary.sampleCount / 5, 1)        * 0.20 +
    Math.min(receivingDeltaSummary.sampleCount / 5, 1)   * 0.20;

  const historyCoverageScore =
    Math.min(historicalUsageSummary.sampleDays / 30, 1) * 0.15;

  const sourceSafetyScore =
    sourceAggregationLevel === 'tenant_ingredient_period' ? 0.10 :
    sourceAggregationLevel === 'category_period'          ? 0.07 :
    0;

  const raw = sampleCompletenessScore + historyCoverageScore + sourceSafetyScore;
  return Math.min(Math.max(raw, 0), 1);
}

// ─── validatePredictionInputSummary ──────────────────────────────────────────

/**
 * Validates a PredictionInputSummary before passing it to the prediction engine.
 *
 * Returns { valid, blockedReasons, warnings }.
 * valid === true only when blockedReasons is empty.
 */
export function validatePredictionInputSummary(
  input: PredictionInputSummary,
): PredictionValidationResult {
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  // ── Hard BLOCKED: raw data guard ─────────────────────────────────────────
  if ((input.containsRawData as unknown) !== false) {
    blocked.push('PREDICTION_RAW_DATA_DETECTED');
  }

  // ── Hard BLOCKED: required identifiers ────────────────────────────────────
  if (!input.tenantId) blocked.push('MISSING_TENANT_ID');
  if (!input.sourceSnapshotId) blocked.push('MISSING_SNAPSHOT_ID');
  if (!input.auditTrailId) blocked.push('MISSING_AUDIT_TRAIL_ID');
  if (!input.ingredientId) blocked.push('MISSING_INGREDIENT_ID');

  // ── Hard BLOCKED: tenant consistency ─────────────────────────────────────
  if (!input.tenantConsistencyCheck.allSourcesMatchTenant) {
    blocked.push('PREDICTION_TENANT_MISMATCH');
  }
  if (input.tenantConsistencyCheck.tenantId !== input.tenantId) {
    blocked.push('PREDICTION_TENANT_MISMATCH');
  }

  // ── Hard BLOCKED: aggregation level ──────────────────────────────────────
  if (input.sourceAggregationLevel === 'blocked_single_source') {
    blocked.push('PREDICTION_SINGLE_SOURCE_RISK');
  }

  // ── Hard BLOCKED: Grams fields ────────────────────────────────────────────
  const gramsFields: Array<[string, Grams | undefined]> = [
    ['currentStockGrams', input.currentStockGrams],
    ['requiredQtyGrams', input.requiredQtyGrams],
    ['shortageQtyGrams', input.shortageQtyGrams],
  ];
  for (const [, value] of gramsFields) {
    if (value === undefined || value === null || !isGrams(value)) {
      blocked.push('MISSING_GRAMS_FIELD');
      break;
    }
  }

  // ── Hard BLOCKED: maxPurchaseLimitGrams required ──────────────────────────
  if (input.maxPurchaseLimitGrams === undefined || input.maxPurchaseLimitGrams === null) {
    blocked.push('PREDICTION_MAX_LIMIT_MISSING');
  } else if (!isGrams(input.maxPurchaseLimitGrams)) {
    blocked.push('PREDICTION_MAX_LIMIT_MISSING');
  }

  // ── Hard BLOCKED: shortageQtyGrams must not be negative ──────────────────
  if (input.shortageQtyGrams !== undefined && input.shortageQtyGrams < 0) {
    blocked.push('PREDICTION_NEGATIVE_QUANTITY');
  }

  // ── Hard BLOCKED: existing blocked reasons propagate ─────────────────────
  for (const r of input.blockedReasons) {
    if (!blocked.includes(r)) blocked.push(r);
  }

  // ── Hard BLOCKED: data quality score ──────────────────────────────────────
  const score = calculateDataQualityScore(input);
  if (score < 0.4) {
    blocked.push('PREDICTION_LOW_DATA_QUALITY');
  } else if (score < 0.6) {
    warnings.push('PREDICTION_LOW_DATA_QUALITY');
  }

  // ── Warnings: sample coverage ─────────────────────────────────────────────
  if (input.historicalUsageSummary.sampleDays < 7) {
    warnings.push('PREDICTION_INSUFFICIENT_HISTORY');
  }
  if (input.wasteRiskSummary.sampleCount < 3) {
    warnings.push('PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  }
  if (input.receivingDeltaSummary.sampleCount < 3) {
    warnings.push('PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  }
  if (input.wasteRiskSummary.riskLevel === 'UNKNOWN') {
    warnings.push('PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  }

  // Propagate input warnings (dedup)
  for (const w of input.warnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }

  return {
    valid: blocked.length === 0,
    blockedReasons: blocked,
    warnings,
  };
}
