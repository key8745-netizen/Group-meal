# Feature 005 Phase 2 — Recommendation Integration + Dry-run Transaction Plan

## Phase 2 Objective

Wire `ModelConfigRecommendation` + `PersistedHumanModelConfigApproval` through to fully-formed
dry-run apply and rollback transaction plans, validating all AI safety invariants before
constructing any plan object.

---

## Files Created

| File | Purpose |
|---|---|
| `src/services/modelConfigRecommendationExecutionAdapterService.ts` | Main adapter: `buildApplyTransactionPlanFromRecommendation` + `buildRollbackTransactionPlanFromApproval` |
| `src/services/__tests__/modelConfigRecommendationExecutionAdapterService.test.ts` | 57-assertion test file for the new adapter |
| `docs/FEATURE_005_MODEL_CONFIG_APPLY_EXECUTION_PHASE2.md` | This delivery document |

## Files Modified

None — all Phase 1 service files (`modelConfigIdempotencyService.ts`,
`modelConfigTransactionPlanService.ts`, `modelConfigRollbackPreflightService.ts`,
`modelConfigApplyExecution.ts`) already contained the complete Phase 2 fields
(`newVersion` in `RollbackTokenPayload`, all `AuditEventPlan` nullable fields) from Phase 1 delivery.

---

## Test File → Assertion Count

| Test File | Assertions |
|---|---|
| `modelConfigIdempotencyService.test.ts` | 14 |
| `modelConfigTransactionPlanService.test.ts` | 26 |
| `modelConfigRecommendationExecutionAdapterService.test.ts` | 57 |
| **Total (Phase 1 + Phase 2)** | **97** |

---

## AI Safety Invariants Confirmed

All plans produced by Phase 2 services carry hard-coded safety flags:

| Invariant | Value |
|---|---|
| `plan.executable` | `false` |
| `plan.aiCanExecute` | `false` |
| `plan.requiresHumanApproval` | `true` |
| `auditEvent.metadata.aiCanExecute` | `false` |
| `auditEvent.metadata.executable` | `false` |
| `auditEvent.metadata.requiresHumanApproval` | `true` |
| `settingsHistoryWritePlan.immutable` | `true` |
| `settingsHistoryWritePlan.appendOnly` | `true` |
| `idempotencyLockPlan.planOnly` | `true` |

No plan object has `apply`, `execute`, `commit`, `write`, or `runTransaction` properties.

---

## rollbackToken Binding Fields (7 total)

The `RollbackTokenPayload` binds these 7 fields in the deterministic SHA-256 hash:

1. `tenantId`
2. `approvalId`
3. `rollbackTargetVersion`
4. `expectedCurrentVersion`
5. `newVersion` ← added in Phase 2 (the version being replaced)
6. `auditTrailId`
7. `rollbackReason`

Changing any single field produces a different rollback token.

---

## BigInt Canonical JSON Behavior (BLOCKED)

`canonicalizeValue(BigInt(...))` returns `{ ok: false, reason: 'CANONICAL_BIGINT_NOT_SUPPORTED' }`.

This applies to:
- Top-level BigInt values
- BigInt values nested inside plain objects
- BigInt values inside arrays

The SHA-256 hash is never computed when a BigInt is encountered anywhere in the object graph.

---

## Apply Validation Order

For `buildApplyTransactionPlanFromRecommendation`:

1. Tenant guard (FIRST — `EXEC_TENANT_MISMATCH`)
2. AI caller guard (`EXEC_AI_CALLER_BLOCKED`)
3. `recommendation.aiCanApply !== false` (`ADAPTER_RECOMMENDATION_AI_APPLY_GUARD`)
4. `recommendation.requiresHumanApproval !== true` (`ADAPTER_RECOMMENDATION_HUMAN_APPROVAL_REQUIRED`)
5. Approval status not APPROVED (`EXEC_APPROVAL_NOT_APPROVED`)
6. sourceRecommendationId mismatch (`EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH`)
7. auditTrailId mismatch (`EXEC_MISSING_AUDIT_TRAIL_ID`)
8. Missing approvedByHumanUserId (`ADAPTER_MISSING_APPROVED_BY_USER`)
9. Missing/blank approvalReason (`ADAPTER_MISSING_APPROVAL_REASON`)

For `buildRollbackTransactionPlanFromApproval`:

1. Tenant guard (FIRST — `ROLLBACK_EXEC_TENANT_MISMATCH`)
2. AI caller guard (`ROLLBACK_EXEC_AI_CALLER_BLOCKED`)
3. Approval status not APPROVED (`ROLLBACK_EXEC_APPROVAL_NOT_APPROVED`)
4. Missing rollbackTargetVersion (`ROLLBACK_EXEC_MISSING_ROLLBACK_TARGET_VERSION`)
5. Missing expectedCurrentVersion (`ROLLBACK_EXEC_MISSING_EXPECTED_VERSION`)
6. Missing rollbackToken (`ROLLBACK_EXEC_MISSING_ROLLBACK_TOKEN`)
7. Missing/blank rollbackReason (`ROLLBACK_EXEC_MISSING_ROLLBACK_REASON`)
8. Same version (`ROLLBACK_EXEC_SAME_VERSION`)

---

## Known Limitations

- No Firestore write path exists — this is by design. All plans are dry-run only.
- The rollback adapter re-generates its own token from the approval fields; the
  `rollbackToken` stored on `PersistedHumanModelConfigRollbackApproval` is not verified
  against the re-generated token at this layer (that is a preflight concern).
- `configBeforeHash` is not passed into the rollback path — set to null in the audit plan.
