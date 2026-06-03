# Feature 003 — Predictive Purchasing Optimization Engine
## Phase 2: Integration with Feature 001 Suggestion Service + Dry-run Prediction Output

---

## Scope

Phase 2 integrates the Phase 1 pure prediction functions with the Feature 001 suggestion pipeline in **dry-run mode only**. Nothing is executable; no Firestore reads/writes; no UI; no changes to Feature 001 or Feature 002 core flows.

---

## Delivered Files

### New Service
- `src/services/predictionSuggestionAdapterService.ts` — Adapter that combines an `AIPurchaseSuggestion` with a `PredictionOutput` into a `PredictionEnhancedSuggestionPreview`

### New Test
- `src/services/__tests__/predictionSuggestionAdapterService.test.ts` — 43/43 passing

### Modified Types
- `src/types/predictionEngine.ts` — Added `PredictionEnhancedSuggestionPreview` interface
- `src/types/aiBoundary.ts` — 8 new `BlockedReason` members for the adapter

---

## Test Summary

| Test File | Phase | Result |
|---|---|---|
| predictionInputValidationService | Phase 1 | 25/25 ✅ |
| predictionSuppressionService | Phase 1 | 14/14 ✅ |
| predictionFactorService | Phase 1 | 16/16 ✅ |
| predictionEngineService | Phase 1 | 22/22 ✅ |
| predictionAuditService | Phase 1 | 17/17 ✅ |
| modelConfigRecommendationService | Phase 1 | 16/16 ✅ |
| predictionSuggestionAdapterService | **Phase 2** | **43/43 ✅** |

**Total: 153/153 tests passing**

---

## Hard Invariants on PredictionEnhancedSuggestionPreview

| Field | Value | Enforced by |
|---|---|---|
| `executable` | `false` (literal) | TypeScript type + runtime test |
| `aiCanWrite` | `false` (literal) | TypeScript type + runtime test |
| `aiCanMutateRules` | `false` (literal) | TypeScript type + runtime test |
| `dataLineage.usedRawDocuments` | `false` (literal) | TypeScript type + runtime test |

The preview **must never** be used to create, approve, or submit a purchase order.

---

## Adapter Guard Rails

The adapter checks all of the following before producing a preview.
Any failure returns `{ preview: null, blockedReasons: [...] }`.

| Check | BlockedReason |
|---|---|
| `suggestion.suggestionId` present | `ADAPTER_MISSING_SUGGESTION_ID` |
| `prediction.predictionId` present | `ADAPTER_MISSING_PREDICTION_ID` |
| `suggestion.tenantId === prediction.tenantId` | `ADAPTER_TENANT_MISMATCH` |
| `suggestion.sourceSnapshotId === prediction.sourceSnapshotId` | `ADAPTER_SNAPSHOT_MISMATCH` |
| `suggestion.auditTrailId === prediction.auditTrailId` (if suggestion has one) | `ADAPTER_AUDIT_TRAIL_MISMATCH` |
| `prediction.confidenceTier !== 'BLOCKED'` | `ADAPTER_PREDICTION_BLOCKED` |
| `prediction.aiCanWrite === false` | `ADAPTER_AI_WRITE_GUARD` |
| `prediction.aiCanMutateRules === false` | `ADAPTER_AI_WRITE_GUARD` |
| `prediction.dataLineage.usedRawDocuments === false` | `ADAPTER_RAW_DATA_GUARD` |

---

## dataQualityScore Formula — Weight Source and Adjustment Principles

### Formula

```
score =
  min(historicalUsage.sampleCount / 10, 1) × 0.35   // sample completeness (key source)
+ min(wasteRisk.sampleCount / 5, 1)         × 0.20   // waste risk coverage
+ min(receivingDelta.sampleCount / 5, 1)    × 0.20   // receiving delta coverage
+ min(historicalUsage.sampleDays / 30, 1)   × 0.15   // history period coverage
+ sourceSafetyScore                          × —      // aggregation safety
```

Where `sourceSafetyScore`:
- `tenant_ingredient_period` → 0.10 (most specific, most reliable)
- `category_period`          → 0.07 (broader; some specificity lost)
- `blocked_single_source`    → 0.00 (single source; privacy/reliability risk)

### Weight Rationale

Weights reflect the relative importance of each data source to prediction reliability:
- **historicalUsage (0.35)** — Dominant signal; captures actual consumption patterns
- **wasteRisk + receivingDelta (0.20 each)** — Supporting signals that correct for over/under-delivery and spoilage
- **historyCoverage (0.15)** — Longer periods reduce noise; 30 days is considered adequate
- **sourceSafety (0.10)** — Aggregation at the most granular level (tenant+ingredient) maximizes specificity

### Adjustment Principles

These weights are **not auto-adjusted** by the system. Any proposed adjustment:
1. Must be produced as a `ModelConfigRecommendation` (proposal only)
2. Requires human review and explicit approval
3. Cannot be applied in Phase 1 or Phase 2

---

## maxPurchaseLimitGrams Missing → BLOCKED

If `maxPurchaseLimitGrams` is `undefined` or `null` on the `PredictionInputSummary`:
- `validatePredictionInputSummary` adds `PREDICTION_MAX_LIMIT_MISSING` to `blockedReasons`
- `calculatePredictionOutput` returns a BLOCKED `PredictionOutput` with `adjustedRecommendedQtyGrams = 0`
- The prediction engine **never produces an unbounded quantity**

**Rationale**: Without an explicit upper limit, the engine cannot safely clamp output quantities. A missing limit indicates the tenant configuration is incomplete, which is a data-quality issue that must be resolved by a human, not assumed by the AI.

### Human-Approved Config Recommendation Behavior

Even when a prediction is BLOCKED due to missing `maxPurchaseLimitGrams`:
- `createModelConfigRecommendation` still produces a `ModelConfigRecommendation`
- The recommendation carries `MODEL_CONFIG_REQUIRES_HUMAN_APPROVAL` in `blockedReasons`
- `aiCanApply: false` — the system never applies the recommendation automatically
- `requiresHumanApproval: true` — a human must explicitly review and approve any config change
- The recommendation is **informational only**; it does not unlock the blocked prediction

---

## Feature 001 Suggestion Flow — Not Modified

Phase 2 does not modify any Feature 001 service. The adapter:
- Accepts an already-computed `AIPurchaseSuggestion` as read-only input
- Never mutates `suggestion.usableForDraft`
- Never modifies `suggestion.items`, `suggestion.overallConfidence`, or any other field
- Is a pure function with no side effects

The Feature 001 suggestion pipeline (`aiSuggestionService.ts`) is untouched.

---

## ID Continuity Chain

```
Feature 001                    Feature 003 Phase 2
─────────────                  ──────────────────────────────
AIPurchaseSuggestion           PredictionEnhancedSuggestionPreview
  .suggestionId ─────────────→   .suggestionId
  .sourceSnapshotId ──────────→   .sourceSnapshotId
  .auditTrailId ──────────────→   .auditTrailId
                                  .predictionId  ← from PredictionOutput
                                  .dataLineage.suggestionId
                                  .dataLineage.predictionId
                                  .dataLineage.sourceSnapshotId
                                  .dataLineage.auditTrailId
```

All four IDs are verified in `predictionSuggestionAdapterService.test.ts` continuity section.

---

## What Phase 2 Does NOT Include

- UI components
- Firestore reads or writes
- Settings application
- Automatic weight adjustment
- Executable purchase suggestions
- Integration with Feature 002 receiving flow

These are Phase 3+ scope.
