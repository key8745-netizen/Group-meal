/**
 * predictionAuditService.ts
 *
 * Pure audit event helpers for Feature 003.
 *
 * HARD RULES:
 *  1. No Firestore reads or writes.
 *  2. usedRawDocuments is permanently false.
 *  3. aiCanMutateRules is permanently false.
 *  4. Only produces: PREDICTION_GENERATED, PREDICTION_BLOCKED,
 *     MODEL_CONFIG_RECOMMENDATION_GENERATED.
 */

import type {
  PredictionOutput,
  ModelConfigRecommendation,
  PredictionAuditEventType,
} from '@/types/predictionEngine';
import { createAuditEvent } from './aiAuditTrailHelper';

// ─── createPredictionAuditEvent ───────────────────────────────────────────────

/**
 * Builds an audit event for a completed prediction (GENERATED or BLOCKED).
 * Pure function — does not write to Firestore.
 */
export function createPredictionAuditEvent(
  output: PredictionOutput,
  now: Date,
) {
  const eventType: PredictionAuditEventType =
    output.confidenceTier === 'BLOCKED'
      ? 'PREDICTION_BLOCKED'
      : 'PREDICTION_GENERATED';

  return createAuditEvent({
    eventType,
    actorType:    'system',
    actorId:      'prediction-engine',
    at:           now,
    eventVersion: 1,
    fromState:    undefined,
    toState:      output.confidenceTier,
    metadata: {
      predictionId:                output.predictionId,
      tenantId:                    output.tenantId,
      ingredientId:                output.ingredientId,
      sourceSnapshotId:            output.sourceSnapshotId,
      auditTrailId:                output.auditTrailId,
      confidenceTier:              output.confidenceTier,
      baseRecommendedQtyGrams:     output.baseRecommendedQtyGrams,
      adjustedRecommendedQtyGrams: output.adjustedRecommendedQtyGrams,
      maxPurchaseLimitGrams:       output.maxPurchaseLimitGrams ?? null,
      factors:                     output.factors,
      blockedReasons:              output.blockedReasons,
      warnings:                    output.warnings,
      usedRawDocuments:            false,
      aiCanMutateRules:            false,
      dataQualityScore:            output.dataLineage.dataQualityScore,
      sourceAggregationLevel:      output.dataLineage.sourceAggregationLevel,
    },
  });
}

// ─── createModelConfigRecommendationAuditEvent ────────────────────────────────

/**
 * Builds an audit event for a model config recommendation.
 * Pure function — does not write to Firestore.
 */
export function createModelConfigRecommendationAuditEvent(
  rec: ModelConfigRecommendation,
  now: Date,
) {
  return createAuditEvent({
    eventType:    'MODEL_CONFIG_RECOMMENDATION_GENERATED',
    actorType:    'system',
    actorId:      'prediction-engine',
    at:           now,
    eventVersion: 1,
    metadata: {
      recommendationId:        rec.recommendationId,
      tenantId:                rec.tenantId,
      auditTrailId:            rec.auditTrailId,
      proposedWeights:         rec.proposedWeights,
      rationale:               rec.rationale,
      blockedReasons:          rec.blockedReasons,
      warnings:                rec.warnings,
      aiCanApply:              false,
      requiresHumanApproval:   true,
    },
  });
}
