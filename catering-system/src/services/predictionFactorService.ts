/**
 * predictionFactorService.ts
 *
 * Calculates bounded prediction adjustment factors for Feature 003.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. All factors are clamped to defined safe ranges.
 *  3. NaN or Infinity in any factor → BLOCKED.
 *  4. expectedDailyUsageGrams <= 0 → BLOCKED.
 *
 * Factor ranges:
 *   historicalUsageFactor : clamp(averageDaily / expectedDaily, 0.8, 1.2)
 *   wasteRiskFactor       : LOW=1.0, MEDIUM=0.95, HIGH=0.9, UNKNOWN=1.0 + warning
 *   receivingDeltaFactor  : clamp(1 - averageDeltaPercent, 0.85, 1.15)
 *                           missing → 1.0 + warning
 */

import type {
  PredictionInputSummary,
  PredictionFactorResult,
} from '@/types/predictionEngine';
import type { BlockedReason } from '@/types/predictionEngine';

// ─── Clamp bounds ─────────────────────────────────────────────────────────────

const HIST_FACTOR_MIN = 0.80;
const HIST_FACTOR_MAX = 1.20;
const DELTA_FACTOR_MIN = 0.85;
const DELTA_FACTOR_MAX = 1.15;

const WASTE_RISK_FACTORS: Record<string, number> = {
  LOW:     1.0,
  MEDIUM:  0.95,
  HIGH:    0.9,
  UNKNOWN: 1.0,
};

function isFiniteNumber(v: number): boolean {
  return typeof v === 'number' && isFinite(v) && !isNaN(v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── calculatePredictionFactors ───────────────────────────────────────────────

export function calculatePredictionFactors(
  input: PredictionInputSummary,
): PredictionFactorResult {
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  // ── Historical usage factor ───────────────────────────────────────────────
  const avg = input.historicalUsageSummary.averageDailyUsageGrams;
  const exp = input.historicalUsageSummary.expectedDailyUsageGrams;

  if (exp <= 0 || !isFiniteNumber(exp)) {
    blocked.push('PREDICTION_INVALID_FACTOR');
    return {
      factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 },
      blockedReasons: blocked,
      warnings,
    };
  }

  const rawHistFactor = avg / exp;
  if (!isFiniteNumber(rawHistFactor)) {
    blocked.push('PREDICTION_INVALID_FACTOR');
    return {
      factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 },
      blockedReasons: blocked,
      warnings,
    };
  }
  const historicalUsageFactor = clamp(rawHistFactor, HIST_FACTOR_MIN, HIST_FACTOR_MAX);

  // ── Waste risk factor ─────────────────────────────────────────────────────
  const riskLevel = input.wasteRiskSummary.riskLevel;
  const wasteRiskFactor = WASTE_RISK_FACTORS[riskLevel] ?? 1.0;
  if (riskLevel === 'UNKNOWN') {
    warnings.push('PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  }

  // ── Receiving delta factor ────────────────────────────────────────────────
  let receivingDeltaFactor = 1.0;
  const avgDeltaPct = input.receivingDeltaSummary.averageDeltaPercent;
  if (avgDeltaPct !== undefined && avgDeltaPct !== null) {
    const rawDelta = 1 - avgDeltaPct;
    if (!isFiniteNumber(rawDelta)) {
      blocked.push('PREDICTION_INVALID_FACTOR');
    } else {
      receivingDeltaFactor = clamp(rawDelta, DELTA_FACTOR_MIN, DELTA_FACTOR_MAX);
    }
  } else {
    warnings.push('PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  }

  if (blocked.length > 0) {
    return {
      factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 },
      blockedReasons: blocked,
      warnings,
    };
  }

  return {
    factors: { historicalUsageFactor, wasteRiskFactor, receivingDeltaFactor },
    blockedReasons: [],
    warnings,
  };
}
