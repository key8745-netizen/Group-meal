/**
 * predictionEngine.ts
 *
 * Types for Feature 003: Predictive Purchasing Optimization Engine.
 *
 * HARD RULES:
 *  1. Pure types — no Firestore imports, no service calls.
 *  2. All quantities use Grams branded type.
 *  3. containsRawData is permanently false.
 *  4. aiCanWrite is permanently false.
 *  5. aiCanMutateRules is permanently false.
 *  6. dataLineage.usedRawDocuments is permanently false.
 *  7. ModelConfigRecommendation.aiCanApply is permanently false.
 *  8. ModelConfigRecommendation.requiresHumanApproval is permanently true.
 */

import type { Grams, TenantId, SnapshotId, AuditTrailId, BlockedReason, SuggestionId, AISuggestionConfidence } from './aiBoundary';

export type { Grams, TenantId, SnapshotId, AuditTrailId, BlockedReason };

// ─── Aggregation level ────────────────────────────────────────────────────────

export type SourceAggregationLevel =
  | 'tenant_ingredient_period'
  | 'category_period'
  | 'blocked_single_source';

// ─── PredictionInputSummary ───────────────────────────────────────────────────

export interface PredictionInputSummary {
  tenantId: TenantId;
  sourceSnapshotId: SnapshotId;
  auditTrailId: AuditTrailId;
  generatedAt: Date;
  ingredientId: string;
  ingredientName?: string;

  /** Hard invariant: raw Firestore documents must never be passed in. */
  containsRawData: false;

  /** 0–1 score; computed by calculateDataQualityScore(). */
  dataQualityScore: number;

  sourceAggregationLevel: SourceAggregationLevel;

  tenantConsistencyCheck: {
    tenantId: TenantId;
    /** Must be true; any false value causes BLOCKED. */
    allSourcesMatchTenant: boolean;
  };

  currentStockGrams: Grams;
  requiredQtyGrams: Grams;
  shortageQtyGrams: Grams;

  /** Required for output calculation; missing causes BLOCKED. */
  maxPurchaseLimitGrams?: Grams;

  historicalUsageSummary: {
    averageDailyUsageGrams: Grams;
    expectedDailyUsageGrams: Grams;
    sampleDays: number;
    sampleCount: number;
    periodStart: Date;
    periodEnd: Date;
  };

  wasteRiskSummary: {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    averageWastePercent?: number;
    sampleCount: number;
  };

  receivingDeltaSummary: {
    averageDeltaPercent?: number;
    averageDeltaGrams?: Grams;
    sampleCount: number;
  };

  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

// ─── PredictionFactors ────────────────────────────────────────────────────────

export interface PredictionFactors {
  historicalUsageFactor: number;
  wasteRiskFactor: number;
  receivingDeltaFactor: number;
}

// ─── PredictionOutput ─────────────────────────────────────────────────────────

export interface PredictionOutput {
  predictionId: string;
  tenantId: TenantId;
  ingredientId: string;
  sourceSnapshotId: SnapshotId;
  auditTrailId: AuditTrailId;
  baseRecommendedQtyGrams: Grams;
  adjustedRecommendedQtyGrams: Grams;
  maxPurchaseLimitGrams?: Grams;
  factors: PredictionFactors;
  confidenceTier: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  rationale: string[];
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  dataLineage: {
    sourceSnapshotId: SnapshotId;
    sourceSummaryGeneratedAt: Date;
    /** Hard invariant: always false. */
    usedRawDocuments: false;
    sourceAggregationLevel: SourceAggregationLevel;
    dataQualityScore: number;
  };
  /** Hard invariant: always false. */
  aiCanWrite: false;
  /** Hard invariant: always false. */
  aiCanMutateRules: false;
  createdAt: Date;
}

// ─── ModelConfigRecommendation ────────────────────────────────────────────────

export interface ModelConfigRecommendation {
  recommendationId: string;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  proposedWeights: {
    historicalUsageWeight?: number;
    wasteRiskWeight?: number;
    receivingDeltaWeight?: number;
  };
  rationale: string[];
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  /** Hard invariant: always false — only humans may apply config changes. */
  aiCanApply: false;
  /** Hard invariant: always true. */
  requiresHumanApproval: true;
  createdAt: Date;
}

// ─── Validation / suppression results ────────────────────────────────────────

export interface PredictionValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

export interface PredictionSuppressionResult {
  blocked: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

export interface PredictionFactorResult {
  factors: PredictionFactors;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

// ─── Confidence tier ──────────────────────────────────────────────────────────

export type PredictionConfidenceTier = PredictionOutput['confidenceTier'];

// ─── PredictionEnhancedSuggestionPreview ─────────────────────────────────────

/**
 * A dry-run, non-executable enrichment of an AIPurchaseSuggestion with
 * prediction engine output. Must never become an executable purchase action.
 *
 * HARD RULES:
 *  1. executable is permanently false.
 *  2. aiCanWrite is permanently false.
 *  3. aiCanMutateRules is permanently false.
 *  4. dataLineage.usedRawDocuments is permanently false.
 *  5. This object must not be used to create or approve a purchase order.
 */
export interface PredictionEnhancedSuggestionPreview {
  previewId: string;
  tenantId: TenantId;
  suggestionId: SuggestionId;
  predictionId: string;
  sourceSnapshotId: SnapshotId;
  auditTrailId: AuditTrailId;
  originalRecommendedQtyGrams: Grams;
  predictedAdjustedQtyGrams: Grams;
  originalConfidence: AISuggestionConfidence;
  predictionConfidenceTier: PredictionConfidenceTier;
  dataLineage: {
    suggestionId: SuggestionId;
    predictionId: string;
    sourceSnapshotId: SnapshotId;
    auditTrailId: AuditTrailId;
    /** Hard invariant: always false. */
    usedRawDocuments: false;
  };
  /** Hard invariant: always false — this is never an executable purchase action. */
  executable: false;
  /** Hard invariant: always false. */
  aiCanWrite: false;
  /** Hard invariant: always false. */
  aiCanMutateRules: false;
  createdAt: Date;
}

export type { SuggestionId, AISuggestionConfidence };

// ─── Audit event types ────────────────────────────────────────────────────────

export type PredictionAuditEventType =
  | 'PREDICTION_GENERATED'
  | 'PREDICTION_BLOCKED'
  | 'MODEL_CONFIG_RECOMMENDATION_GENERATED';
