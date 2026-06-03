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
 */

import type {
  PredictionOutput,
  ModelConfigRecommendation,
} from '@/types/predictionEngine';
import type { BlockedReason } from '@/types/predictionEngine';

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

    // Historical usage weight: if capped at max (1.2), data is consistently
    // higher than expected — suggest increasing the weight
    if (f.historicalUsageFactor >= 1.15) {
      proposedWeights.historicalUsageWeight = 1.1;
      rationale.push('Historical usage consistently higher than expected — consider increasing historicalUsageWeight');
    } else if (f.historicalUsageFactor <= 0.85) {
      proposedWeights.historicalUsageWeight = 0.9;
      rationale.push('Historical usage consistently lower than expected — consider decreasing historicalUsageWeight');
    }

    // Waste risk weight: if waste is HIGH, increasing weight brings quantity down
    if (f.wasteRiskFactor <= 0.91) {
      proposedWeights.wasteRiskWeight = 1.1;
      rationale.push('High waste risk observed — consider increasing wasteRiskWeight');
    }

    // Receiving delta weight: if delta is consistently positive (more received
    // than ordered), factor > 1.0 means supplier tends to over-deliver
    if (f.receivingDeltaFactor >= 1.10) {
      proposedWeights.receivingDeltaWeight = 0.9;
      rationale.push('Positive receiving delta trend — consider decreasing receivingDeltaWeight');
    }

    if (rationale.length === 0) {
      rationale.push('Current factors appear well-calibrated — no weight adjustment recommended');
    }
  }

  return {
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
