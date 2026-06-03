/**
 * predictionSuppressionService.ts
 *
 * Multi-source small-group suppression for Feature 003.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. Each source (historicalUsage, wasteRisk, receivingDelta) is checked separately.
 *  3. historicalUsageSummary.sampleCount < 3 → BLOCKED.
 *  4. Single-source aggregate → BLOCKED.
 *  5. Aggregate disclosure risk → BLOCKED.
 *  6. Non-critical sources below threshold → LOW warning only.
 */

import type {
  PredictionInputSummary,
  PredictionSuppressionResult,
} from '@/types/predictionEngine';
import type { BlockedReason } from '@/types/predictionEngine';

/** Minimum sample counts that are safe for each source. */
const MIN_HISTORICAL_SAMPLE_COUNT = 3;
const MIN_HISTORICAL_SAMPLE_DAYS  = 7;
const MIN_WASTE_SAMPLE_COUNT      = 3;
const MIN_RECEIVING_SAMPLE_COUNT  = 3;

/**
 * Applies multi-source small-group suppression.
 *
 * Historical usage is a key source — too few samples blocks the prediction.
 * Waste risk and receiving delta are supporting sources — too few samples
 * downgrades to LOW but does not block on its own.
 */
export function applySmallGroupSuppression(
  input: PredictionInputSummary,
): PredictionSuppressionResult {
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  // ── Aggregation-level check (hard BLOCKED) ────────────────────────────────
  if (input.sourceAggregationLevel === 'blocked_single_source') {
    blocked.push('PREDICTION_SINGLE_SOURCE_RISK');
  }

  // ── Raw data check (hard BLOCKED) ─────────────────────────────────────────
  if ((input.containsRawData as unknown) !== false) {
    blocked.push('PREDICTION_RAW_DATA_DETECTED');
  }

  // ── Historical usage: KEY source — BLOCKED if too small ──────────────────
  const hist = input.historicalUsageSummary;
  if (hist.sampleCount < MIN_HISTORICAL_SAMPLE_COUNT) {
    blocked.push('PREDICTION_SAMPLE_TOO_SMALL');
  }
  if (hist.sampleDays < MIN_HISTORICAL_SAMPLE_DAYS) {
    warnings.push('PREDICTION_INSUFFICIENT_HISTORY');
  }

  // ── Waste risk: supporting source — LOW warning if too small ──────────────
  const waste = input.wasteRiskSummary;
  if (waste.sampleCount < MIN_WASTE_SAMPLE_COUNT) {
    warnings.push('PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  }

  // ── Receiving delta: supporting source — LOW warning if too small ─────────
  const delta = input.receivingDeltaSummary;
  if (delta.sampleCount < MIN_RECEIVING_SAMPLE_COUNT) {
    warnings.push('PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  }

  // ── Aggregate disclosure risk ─────────────────────────────────────────────
  // If any single source could identify a single supplier / transaction / activity,
  // we treat this as an aggregate disclosure risk.
  // The check: if historical sampleCount === 1 and sampleDays <= 1, it's a single
  // transaction aggregate — high disclosure risk.
  if (hist.sampleCount === 1 && hist.sampleDays <= 1) {
    blocked.push('PREDICTION_AGGREGATE_DISCLOSURE_RISK');
  }

  return {
    blocked: blocked.length > 0,
    blockedReasons: blocked,
    warnings,
  };
}
