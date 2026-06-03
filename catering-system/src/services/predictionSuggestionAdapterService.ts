/**
 * predictionSuggestionAdapterService.ts
 *
 * Dry-run adapter: bridges Feature 001 AIPurchaseSuggestion with
 * Feature 003 PredictionOutput into a non-executable preview object.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. No purchaseOrderService / inventoryService calls.
 *  3. executable is permanently false on all output.
 *  4. aiCanWrite is permanently false on all output.
 *  5. aiCanMutateRules is permanently false on all output.
 *  6. dataLineage.usedRawDocuments is permanently false on all output.
 *  7. The original AIPurchaseSuggestion is never mutated.
 *  8. usableForDraft on the original suggestion is never changed.
 *  9. Prediction BLOCKED → preview BLOCKED.
 * 10. Any guard-rail violation → BLOCKED; no preview produced.
 */

import type { AIPurchaseSuggestion, BlockedReason } from '@/types/aiBoundary';
import type {
  PredictionOutput,
  PredictionEnhancedSuggestionPreview,
} from '@/types/predictionEngine';

// ─── ID generation ────────────────────────────────────────────────────────────

function generatePreviewId(): string {
  return `prev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── createPredictionEnhancedSuggestionPreview ────────────────────────────────

export interface PredictionEnhancedSuggestionPreviewResult {
  preview: PredictionEnhancedSuggestionPreview | null;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

/**
 * Combines a Feature 001 AIPurchaseSuggestion with a Feature 003 PredictionOutput
 * into a dry-run, non-executable preview.
 *
 * Returns { preview: null, blockedReasons } when any guard rail fails.
 * The original suggestion is never mutated.
 */
export function createPredictionEnhancedSuggestionPreview(input: {
  suggestion: AIPurchaseSuggestion;
  prediction: PredictionOutput;
  now: Date;
}): PredictionEnhancedSuggestionPreviewResult {
  const { suggestion, prediction, now } = input;
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [...prediction.warnings];

  // ── Guard: suggestion.suggestionId must exist ──────────────────────────────
  if (!suggestion.suggestionId) {
    blocked.push('ADAPTER_MISSING_SUGGESTION_ID');
  }

  // ── Guard: prediction.predictionId must exist ──────────────────────────────
  if (!prediction.predictionId) {
    blocked.push('ADAPTER_MISSING_PREDICTION_ID');
  }

  // ── Guard: tenant match ────────────────────────────────────────────────────
  if (suggestion.tenantId !== prediction.tenantId) {
    blocked.push('ADAPTER_TENANT_MISMATCH');
  }

  // ── Guard: sourceSnapshotId match ──────────────────────────────────────────
  if (suggestion.sourceSnapshotId !== prediction.sourceSnapshotId) {
    blocked.push('ADAPTER_SNAPSHOT_MISMATCH');
  }

  // ── Guard: auditTrailId match (only if suggestion has one) ────────────────
  if (suggestion.auditTrailId !== undefined && suggestion.auditTrailId !== prediction.auditTrailId) {
    blocked.push('ADAPTER_AUDIT_TRAIL_MISMATCH');
  }

  // ── Guard: prediction must not be BLOCKED ─────────────────────────────────
  if (prediction.confidenceTier === 'BLOCKED') {
    blocked.push('ADAPTER_PREDICTION_BLOCKED');
  }

  // ── Guard: prediction aiCanWrite must be false ────────────────────────────
  if ((prediction.aiCanWrite as unknown) !== false) {
    blocked.push('ADAPTER_AI_WRITE_GUARD');
  }

  // ── Guard: prediction aiCanMutateRules must be false ─────────────────────
  if ((prediction.aiCanMutateRules as unknown) !== false) {
    blocked.push('ADAPTER_AI_WRITE_GUARD');
  }

  // ── Guard: prediction usedRawDocuments must be false ─────────────────────
  if ((prediction.dataLineage.usedRawDocuments as unknown) !== false) {
    blocked.push('ADAPTER_RAW_DATA_GUARD');
  }

  if (blocked.length > 0) {
    return { preview: null, blockedReasons: blocked, warnings };
  }

  // ── Derive a representative original qty from suggestion items ────────────
  // We use the first item's suggestedQtyGrams as representative for per-item
  // prediction; for whole-suggestion mode, use the prediction's base qty.
  const originalRecommendedQtyGrams = prediction.baseRecommendedQtyGrams;
  const predictedAdjustedQtyGrams   = prediction.adjustedRecommendedQtyGrams;

  const auditTrailId = suggestion.auditTrailId ?? prediction.auditTrailId;

  const preview: PredictionEnhancedSuggestionPreview = {
    _kind:                        'preview',
    previewId:                    generatePreviewId(),
    tenantId:                     suggestion.tenantId,
    suggestionId:                 suggestion.suggestionId,
    predictionId:                 prediction.predictionId,
    sourceSnapshotId:             suggestion.sourceSnapshotId,
    auditTrailId,
    originalRecommendedQtyGrams,
    predictedAdjustedQtyGrams,
    originalConfidence:           suggestion.overallConfidence,
    predictionConfidenceTier:     prediction.confidenceTier,
    dataLineage: {
      suggestionId:      suggestion.suggestionId,
      predictionId:      prediction.predictionId,
      sourceSnapshotId:  suggestion.sourceSnapshotId,
      auditTrailId,
      usedRawDocuments:  false,
    },
    executable:       false,
    aiCanWrite:       false,
    aiCanMutateRules: false,
    createdAt:        now,
  };

  return { preview, blockedReasons: [], warnings };
}
