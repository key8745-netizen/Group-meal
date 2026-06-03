/**
 * predictionEngineService.ts
 *
 * Core prediction engine for Feature 003.
 * Orchestrates validation → suppression → factors → output.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. No purchaseOrderService / inventoryService calls.
 *  3. No settings writes.
 *  4. No executable purchase actions generated.
 *  5. aiCanWrite and aiCanMutateRules are permanently false on all output.
 *  6. dataLineage.usedRawDocuments is permanently false.
 *  7. missing maxPurchaseLimitGrams → BLOCKED.
 *  8. negative shortageQtyGrams → BLOCKED.
 *  9. All output quantities go through asGrams().
 */

import type {
  PredictionInputSummary,
  PredictionOutput,
  PredictionConfidenceTier,
} from '@/types/predictionEngine';
import type { BlockedReason } from '@/types/predictionEngine';
import { asGrams } from './unitConversionService';
import { validatePredictionInputSummary, calculateDataQualityScore } from './predictionInputValidationService';
import { applySmallGroupSuppression } from './predictionSuppressionService';
import { calculatePredictionFactors } from './predictionFactorService';

// ─── ID generation ────────────────────────────────────────────────────────────

function generatePredictionId(): string {
  return `pred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── evaluatePredictionConfidenceTier ─────────────────────────────────────────

export function evaluatePredictionConfidenceTier(input: {
  validationResult:  { blockedReasons: BlockedReason[]; warnings: BlockedReason[] };
  suppressionResult: { blockedReasons: BlockedReason[] };
  factorResult:      { blockedReasons: BlockedReason[] };
  summary:           PredictionInputSummary;
  dataQualityScore:  number;
}): PredictionConfidenceTier {
  const { validationResult, suppressionResult, factorResult, summary, dataQualityScore } = input;

  const allBlocked = [
    ...validationResult.blockedReasons,
    ...suppressionResult.blockedReasons,
    ...factorResult.blockedReasons,
  ];

  if (allBlocked.length > 0) return 'BLOCKED';
  if (dataQualityScore < 0.4) return 'BLOCKED';
  if (dataQualityScore < 0.6) return 'LOW';

  const allWarnings = validationResult.warnings;
  const hist = summary.historicalUsageSummary;
  const waste = summary.wasteRiskSummary;
  const delta = summary.receivingDeltaSummary;

  const meetsHighCriteria =
    allWarnings.length === 0 &&
    dataQualityScore >= 0.8 &&
    hist.sampleCount >= 10 &&
    hist.sampleDays >= 30 &&
    waste.sampleCount >= 5 &&
    waste.riskLevel !== 'UNKNOWN' &&
    delta.sampleCount >= 5 &&
    delta.averageDeltaPercent !== undefined;

  if (meetsHighCriteria) return 'HIGH';

  const meetsMediumCriteria =
    dataQualityScore >= 0.6 &&
    hist.sampleCount >= 3 &&
    hist.sampleDays >= 7;

  return meetsMediumCriteria ? 'MEDIUM' : 'LOW';
}

// ─── calculatePredictionOutput ────────────────────────────────────────────────

/**
 * Computes a full PredictionOutput from a validated PredictionInputSummary.
 *
 * Formula:
 *   base = max(shortageQtyGrams, 0)
 *   raw  = base × historicalUsageFactor × wasteRiskFactor × receivingDeltaFactor
 *   adjusted = ceil(raw) clamped to [0, maxPurchaseLimitGrams]
 */
export function calculatePredictionOutput(input: {
  summary: PredictionInputSummary;
  now: Date;
}): PredictionOutput {
  const { summary, now } = input;

  // Run all validation layers
  const validationResult  = validatePredictionInputSummary(summary);
  const suppressionResult = applySmallGroupSuppression(summary);
  const factorResult      = calculatePredictionFactors(summary);
  const dataQualityScore  = calculateDataQualityScore(summary);

  const allBlocked: BlockedReason[] = [
    ...validationResult.blockedReasons,
    ...suppressionResult.blockedReasons,
    ...factorResult.blockedReasons,
  ];
  const allWarnings: BlockedReason[] = [
    ...new Set([...validationResult.warnings, ...factorResult.warnings]),
  ];

  const confidenceTier = evaluatePredictionConfidenceTier({
    validationResult,
    suppressionResult,
    factorResult,
    summary,
    dataQualityScore,
  });

  // Blocked output — no quantities computed
  if (allBlocked.length > 0 || confidenceTier === 'BLOCKED') {
    const baseBlocked = allBlocked.length > 0 ? allBlocked : ['PREDICTION_LOW_DATA_QUALITY' as BlockedReason];
    return {
      predictionId:                generatePredictionId(),
      tenantId:                    summary.tenantId,
      ingredientId:                summary.ingredientId,
      sourceSnapshotId:            summary.sourceSnapshotId,
      auditTrailId:                summary.auditTrailId,
      baseRecommendedQtyGrams:     asGrams(0),
      adjustedRecommendedQtyGrams: asGrams(0),
      maxPurchaseLimitGrams:       summary.maxPurchaseLimitGrams,
      factors:                     factorResult.factors,
      confidenceTier:              'BLOCKED',
      rationale:                   ['Prediction blocked — see blockedReasons'],
      blockedReasons:              baseBlocked,
      warnings:                    allWarnings,
      dataLineage: {
        sourceSnapshotId:       summary.sourceSnapshotId,
        sourceSummaryGeneratedAt: summary.generatedAt,
        usedRawDocuments:       false,
        sourceAggregationLevel: summary.sourceAggregationLevel,
        dataQualityScore,
      },
      aiCanWrite:       false,
      aiCanMutateRules: false,
      createdAt:        now,
    };
  }

  // ── Compute output ────────────────────────────────────────────────────────
  const { historicalUsageFactor, wasteRiskFactor, receivingDeltaFactor } = factorResult.factors;

  const baseGrams = Math.max(summary.shortageQtyGrams, 0);
  const rawAdjusted = baseGrams * historicalUsageFactor * wasteRiskFactor * receivingDeltaFactor;
  const ceilAdjusted = Math.ceil(rawAdjusted);
  const maxLimit = summary.maxPurchaseLimitGrams as number;
  const clampedAdjusted = Math.min(Math.max(ceilAdjusted, 0), maxLimit);

  const baseRecommendedQtyGrams     = asGrams(baseGrams);
  const adjustedRecommendedQtyGrams = asGrams(clampedAdjusted);

  const rationale: string[] = [
    `Base shortage: ${baseGrams}g`,
    `Historical usage factor: ${historicalUsageFactor.toFixed(3)}`,
    `Waste risk factor (${summary.wasteRiskSummary.riskLevel}): ${wasteRiskFactor.toFixed(3)}`,
    `Receiving delta factor: ${receivingDeltaFactor.toFixed(3)}`,
    `Adjusted: ${ceilAdjusted}g → clamped to ${clampedAdjusted}g (max ${maxLimit}g)`,
    `Data quality score: ${dataQualityScore.toFixed(3)}`,
    `Confidence: ${confidenceTier}`,
  ];

  return {
    predictionId:                generatePredictionId(),
    tenantId:                    summary.tenantId,
    ingredientId:                summary.ingredientId,
    sourceSnapshotId:            summary.sourceSnapshotId,
    auditTrailId:                summary.auditTrailId,
    baseRecommendedQtyGrams,
    adjustedRecommendedQtyGrams,
    maxPurchaseLimitGrams:       summary.maxPurchaseLimitGrams,
    factors: {
      historicalUsageFactor,
      wasteRiskFactor,
      receivingDeltaFactor,
    },
    confidenceTier,
    rationale,
    blockedReasons: [],
    warnings: allWarnings,
    dataLineage: {
      sourceSnapshotId:         summary.sourceSnapshotId,
      sourceSummaryGeneratedAt: summary.generatedAt,
      usedRawDocuments:         false,
      sourceAggregationLevel:   summary.sourceAggregationLevel,
      dataQualityScore,
    },
    aiCanWrite:       false,
    aiCanMutateRules: false,
    createdAt:        now,
  };
}
