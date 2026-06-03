/**
 * modelConfigRecommendationService.ts
 *
 * Pure helper for building model config recommendations for Feature 003.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. No settings writes.
 *  3. No weight application.
 *  4. aiCanApply is permanently false.
 *  5. requiresHumanApproval is permanently true.
 *  6. Only produces a recommendation record — human must approve before any config change.
 *  7. Proposed weights outside [0.5, 2.0] → MODEL_CONFIG_WEIGHT_OUT_OF_RANGE BLOCKED.
 *  8. _kind is permanently 'recommendation'.
 */

import type {
  PredictionOutput,
  ModelConfigRecommendation,
} from '@/types/predictionEngine';
import type { BlockedReason } from '@/types/predictionEngine';

// ─── Safe weight range ────────────────────────────────────────────────────────

const WEIGHT_MIN = 0.5;
const WEIGHT_MAX = 2.0;

function isWeightInRange(w: number): boolean {
  return w >= WEIGHT_MIN && w <= WEIGHT_MAX;
}

// ─── ID generation ────────────────────────────────────────────────────────────

function generateRecommendationId(): string {
  return `mcr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── createModelConfigRecommendation ─────────────────────────────────────────

/**
 * Builds a ModelConfigRecommendation from a prediction output.
 *
 * The recommendation proposes weight adjustments based on what the engine
 * observed about the prediction factors. It does NOT apply any changes.
 *
 * aiCanApply: false — human review required before any weight change.
 * Weights outside [0.5, 2.0] → BLOCKED (MODEL_CONFIG_WEIGHT_OUT_OF_RANGE).
 */
export function createModelConfigRecommendation(
  output: PredictionOutput,
  now: Date,
): ModelConfigRecommendation {
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [...output.warnings];

  // A BLOCKED prediction cannot yield a useful weight recommendation
  if (output.confidenceTier === 'BLOCKED') {
    blocked.push('MODEL_CONFIG_REQUIRES_HUMAN_APPROVAL');
  }

  // Propose weight directions based on what the engine observed
  const proposedWeights: ModelConfigRecommendation['proposedWeights'] = {};
  const rationale: string[] = [];

  if (output.confidenceTier !== 'BLOCKED') {
    const f = output.factors;

    // Historical usage weight
    if (f.historicalUsageFactor >= 1.15) {
      proposedWeights.historicalUsageWeight = 1.1;
      rationale.push(
        `Historical usage factor ${f.historicalUsageFactor.toFixed(3)} near upper bound (1.20) — ` +
        'actual consumption consistently exceeds forecast; consider increasing historicalUsageWeight'
      );
    } else if (f.historicalUsageFactor <= 0.85) {
      proposedWeights.historicalUsageWeight = 0.9;
      rationale.push(
        `Historical usage factor ${f.historicalUsageFactor.toFixed(3)} near lower bound (0.80) — ` +
        'actual consumption consistently below forecast; consider decreasing historicalUsageWeight'
      );
    }

    // Waste risk weight
    if (f.wasteRiskFactor <= 0.91) {
      proposedWeights.wasteRiskWeight = 1.1;
      rationale.push(
        `Waste risk factor ${f.wasteRiskFactor.toFixed(3)} indicates HIGH waste — ` +
        'consider increasing wasteRiskWeight to reduce over-purchasing'
      );
    }

    // Receiving delta weight
    if (f.receivingDeltaFactor >= 1.10) {
      proposedWeights.receivingDeltaWeight = 0.9;
      rationale.push(
        `Receiving delta factor ${f.receivingDeltaFactor.toFixed(3)} indicates consistent over-delivery — ` +
        'consider decreasing receivingDeltaWeight'
      );
    }

    if (rationale.length === 0) {
      rationale.push(
        `All factors within nominal range (historical=${f.historicalUsageFactor.toFixed(3)}, ` +
        `waste=${f.wasteRiskFactor.toFixed(3)}, delta=${f.receivingDeltaFactor.toFixed(3)}) — ` +
        'no weight adjustment recommended'
      );
    }
  }

  // ── Guard: proposed weights must be in safe range ─────────────────────────
  const allWeights = Object.values(proposedWeights).filter((w): w is number => w !== undefined);
  if (allWeights.some(w => !isWeightInRange(w))) {
    blocked.push('MODEL_CONFIG_WEIGHT_OUT_OF_RANGE');
  }

  return {
    _kind:               'recommendation',
    recommendationId:    generateRecommendationId(),
    tenantId:            output.tenantId,
    auditTrailId:        output.auditTrailId,
    proposedWeights,
    rationale,
    blockedReasons:      blocked,
    warnings,
    aiCanApply:          false,
    requiresHumanApproval: true,
    createdAt:           now,
  };
}
