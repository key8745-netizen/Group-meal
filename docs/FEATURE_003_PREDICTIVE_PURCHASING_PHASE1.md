# Feature 003 — Predictive Purchasing Optimization Engine
## Phase 1: Pure Computation Layer

---

## Scope

Phase 1 implements the pure computation core of the prediction engine. No UI, no Firestore reads/writes, no modifications to Feature 001/002 flows.

---

## Delivered Files

### Types
- `src/types/predictionEngine.ts` — All Feature 003 TypeScript interfaces and types

### Services (all pure functions)
- `src/services/predictionInputValidationService.ts` — Input validation + `calculateDataQualityScore`
- `src/services/predictionSuppressionService.ts` — Small-group suppression rules
- `src/services/predictionFactorService.ts` — Historical / waste / delta factor computation
- `src/services/predictionEngineService.ts` — Orchestrator: validation → suppression → factors → output
- `src/services/predictionAuditService.ts` — Audit event builders
- `src/services/modelConfigRecommendationService.ts` — Model config recommendation builder

### Tests (all passing)
- `src/services/__tests__/predictionInputValidationService.test.ts` — 25/25
- `src/services/__tests__/predictionSuppressionService.test.ts` — 14/14
- `src/services/__tests__/predictionFactorService.test.ts` — 16/16
- `src/services/__tests__/predictionEngineService.test.ts` — 22/22
- `src/services/__tests__/predictionAuditService.test.ts` — 17/17
- `src/services/__tests__/modelConfigRecommendationService.test.ts` — 16/16

**Total: 110/110 tests passing**

### Modified
- `src/types/aiBoundary.ts` — 14 new `BlockedReason` members for Feature 003

---

## Hard Invariants (encoded in types and enforced in tests)

| Invariant | Location |
|---|---|
| `containsRawData: false` | `PredictionInputSummary` type literal |
| `usedRawDocuments: false` | `dataLineage` type literal |
| `aiCanWrite: false` | `PredictionOutput` type literal |
| `aiCanMutateRules: false` | `PredictionOutput` type literal |
| `aiCanApply: false` | `ModelConfigRecommendation` type literal |
| `requiresHumanApproval: true` | `ModelConfigRecommendation` type literal |
| `maxPurchaseLimitGrams` missing → BLOCKED | `validatePredictionInputSummary` |
| Negative `shortageQtyGrams` → BLOCKED | `validatePredictionInputSummary` |
| `containsRawData !== false` → BLOCKED | `validatePredictionInputSummary` |
| Tenant mismatch → BLOCKED | `validatePredictionInputSummary` |
| `dataQualityScore < 0.4` → BLOCKED | `validatePredictionInputSummary` |
| All output quantities via `asGrams()` | `predictionEngineService` |

---

## dataQualityScore Formula

```
sampleCompletenessScore =
  min(historicalUsage.sampleCount / 10, 1) × 0.35
+ min(wasteRisk.sampleCount / 5, 1)         × 0.20
+ min(receivingDelta.sampleCount / 5, 1)    × 0.20

historyCoverageScore =
  min(historicalUsage.sampleDays / 30, 1)   × 0.15

sourceSafetyScore =
  'tenant_ingredient_period' → 0.10
  'category_period'          → 0.07
  'blocked_single_source'    → 0.00

result = clamp(sum, 0, 1)
```

| Score | Outcome |
|---|---|
| < 0.4 | BLOCKED |
| 0.4–0.6 | Valid with LOW warning |
| ≥ 0.6 | Valid |

---

## Prediction Factor Clamps

| Factor | Formula | Clamp |
|---|---|---|
| `historicalUsageFactor` | `avg / expected` | [0.80, 1.20] |
| `wasteRiskFactor` | LOW=1.0, MEDIUM=0.95, HIGH=0.90, UNKNOWN=1.0+warn | — |
| `receivingDeltaFactor` | `1 - averageDeltaPercent` | [0.85, 1.15] |

---

## Confidence Tiers

| Tier | Conditions |
|---|---|
| `BLOCKED` | Any blockedReasons present, or dqs < 0.4 |
| `LOW` | dqs in [0.4, 0.6) |
| `MEDIUM` | dqs ≥ 0.6, sampleCount ≥ 3, sampleDays ≥ 7 |
| `HIGH` | No warnings, dqs ≥ 0.8, sampleCount ≥ 10, sampleDays ≥ 30, waste not UNKNOWN, receivingDelta available |

---

## What Phase 1 Does NOT Include

- UI components
- Firestore reads or writes
- Settings application (ModelConfigRecommendation is proposal-only)
- Automatic weight adjustment
- Integration with Feature 001/002 purchase order flow

These are Phase 2+ scope.
