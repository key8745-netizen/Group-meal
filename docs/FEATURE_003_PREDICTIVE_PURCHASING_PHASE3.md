# Feature 003 — Predictive Purchasing Optimization Engine
## Phase 3: Enhanced Prediction Logic, Human Config Recommendation, Final Hardening

---

## Scope

Phase 3 is the final hardening of Feature 003. All computation remains pure; no Firestore, no UI, no changes to Feature 001/002 core flows.

Changes delivered:
1. `_kind` type discriminators on `PredictionEnhancedSuggestionPreview` and `ModelConfigRecommendation`
2. `MODEL_CONFIG_WEIGHT_OUT_OF_RANGE` BlockedReason for out-of-range proposed weights
3. Weight range validation [0.5, 2.0] in `modelConfigRecommendationService`
4. Enhanced prediction rationale with full factor details
5. Enhanced model config recommendation rationale with factor values
6. New tests: `_kind` discriminator, no-action-field, immutability, confidence tier propagation

---

## Delivered Files

### Modified Services
- `src/services/modelConfigRecommendationService.ts` — weight range guard, `_kind`, enhanced rationale
- `src/services/predictionEngineService.ts` — enhanced rationale strings
- `src/services/predictionSuggestionAdapterService.ts` — sets `_kind: 'preview'`

### Modified Types
- `src/types/predictionEngine.ts` — `_kind: 'preview'` on `PredictionEnhancedSuggestionPreview`, `_kind: 'recommendation'` on `ModelConfigRecommendation`
- `src/types/aiBoundary.ts` — `MODEL_CONFIG_WEIGHT_OUT_OF_RANGE` BlockedReason

### Modified Tests
- `src/services/__tests__/modelConfigRecommendationService.test.ts` — 29/29 (was 16)
- `src/services/__tests__/predictionSuggestionAdapterService.test.ts` — 57/57 (was 43)
- `src/services/__tests__/predictionAuditService.test.ts` — `_kind` field fix

---

## Total Test Count

| Test File | Result |
|---|---|
| predictionInputValidationService | 25/25 ✅ |
| predictionSuppressionService | 14/14 ✅ |
| predictionFactorService | 16/16 ✅ |
| predictionEngineService | 22/22 ✅ |
| predictionAuditService | 17/17 ✅ |
| modelConfigRecommendationService | **29/29** ✅ |
| predictionSuggestionAdapterService | **57/57** ✅ |

**Total: 180/180 tests passing**

---

## Type Discriminators

### `PredictionEnhancedSuggestionPreview._kind: 'preview'`

The `_kind: 'preview'` field serves as a structural type discriminator. It makes `PredictionEnhancedSuggestionPreview` unmistakably a preview object — not a purchase action, not a draft suggestion, not a command.

Any future code that receives a mixed union of prediction objects can discriminate via `_kind === 'preview'`.

### `ModelConfigRecommendation._kind: 'recommendation'`

Similarly, `_kind: 'recommendation'` signals that this object is a proposal, not an apply command. A future handler that processes config objects can trivially guard: `if (obj._kind !== 'recommendation') return`.

---

## Weight Range Validation

Proposed weights in `ModelConfigRecommendation` must be within **[0.5, 2.0]**.

Rationale: weights outside this range would produce prediction factors that either suppress signals entirely (< 0.5) or amplify them beyond safe bounds (> 2.0). Both extremes increase the risk of incorrect purchase quantities and must be caught before any human review.

If any proposed weight is outside [0.5, 2.0]:
- `blockedReasons` receives `MODEL_CONFIG_WEIGHT_OUT_OF_RANGE`
- The recommendation remains a struct (not thrown); the human reviewer sees the block reason

All standard proposed values (0.9, 1.1) are within [0.5, 2.0] and will never trigger this guard under normal conditions.

---

## dataQualityScore Formula — Weight Source and Adjustment Principles

### Formula

```
score =
  min(historicalUsage.sampleCount / 10, 1) × 0.35
+ min(wasteRisk.sampleCount / 5, 1)         × 0.20
+ min(receivingDelta.sampleCount / 5, 1)    × 0.20
+ min(historicalUsage.sampleDays / 30, 1)   × 0.15
+ sourceSafetyScore
```

Where `sourceSafetyScore`:
- `tenant_ingredient_period` → 0.10
- `category_period`          → 0.07
- `blocked_single_source`    → 0.00

### Weight Rationale

| Component | Weight | Why |
|---|---|---|
| historicalUsage.sampleCount | 0.35 | Primary signal — actual consumption drives the forecast |
| wasteRisk.sampleCount | 0.20 | Correction factor — waste history adjusts over-purchasing |
| receivingDelta.sampleCount | 0.20 | Correction factor — delivery variance adjusts quantities |
| historicalUsage.sampleDays | 0.15 | Period coverage — longer periods reduce noise |
| sourceSafety | 0.10 | Aggregation specificity — granular data is more reliable |

### Adjustment Principles

These weights are **not auto-adjustable**. To change them:
1. `createModelConfigRecommendation` produces a `ModelConfigRecommendation` (proposal)
2. A human reviews `proposedWeights` and `rationale`
3. A human explicitly approves and applies the change (Feature 004+ scope)
4. The system never applies weights automatically — `aiCanApply: false` is a permanent literal

---

## Why Prediction Preview Is Not an Action

`PredictionEnhancedSuggestionPreview` is a **read-only enrichment object**. It:
- Has `executable: false` (TypeScript literal type — cannot be reassigned)
- Has `_kind: 'preview'` (discriminator — not 'action', not 'draft', not 'order')
- Contains no `createDraft`, `submit`, `approve`, or `receive` fields
- Never calls `purchaseOrderService` or `inventoryService`
- Does not modify the original `AIPurchaseSuggestion`
- Does not set `suggestion.usableForDraft = true`

The preview provides human-readable enrichment — predicted quantities, confidence tier, factor breakdown — for display or analysis. It has no pathway to become an executable purchase.

---

## Why Model Config Recommendation Cannot Be Applied

`ModelConfigRecommendation` is a **proposal-only struct**. It:
- Has `aiCanApply: false` (TypeScript literal type)
- Has `requiresHumanApproval: true` (TypeScript literal type)
- Has `_kind: 'recommendation'` (discriminator)
- Contains no apply method, no settings write payload, no Firestore reference
- Any `proposedWeights` outside [0.5, 2.0] are BLOCKED

Applying a weight recommendation requires a separate, human-initiated action. This is intentionally out-of-scope for Feature 003. If this capability is required, it must be designed as a distinct Feature (Feature 004 or later), with:
- Explicit human approval flow
- Settings write service with audit trail
- Rollback capability

---

## Feature 003 Does Not Change Feature 001 / Feature 002 Execution Flow

Feature 003 reads from Feature 001's `AIPurchaseSuggestion` (read-only) and from Feature 002's receiving data (via aggregated summaries in `PredictionInputSummary`). It never:
- Calls `aiSuggestionService` methods that modify state
- Calls `receivingTransactionService` write methods
- Modifies any `AIPurchaseSuggestion` fields
- Creates purchase orders
- Updates inventory

The prediction pipeline is a parallel, non-interfering computation layer.

---

## Future Config Apply — Must Be a Separate Feature

If human-approved weight adjustment is needed:
- It requires a new service (e.g. `configApplyService.ts`) — not in Feature 003
- It requires a settings write with `runTransaction` and audit trail
- It requires explicit human sign-off (not just a recommendation review)
- It must never be triggered automatically by the prediction engine

Feature 003 produces the recommendation. A future feature applies it.
