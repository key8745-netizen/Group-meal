# Feature 005 Phase 3 — Transaction Readiness Hardening + Audit Metadata Cross-validation

## Phase 3 Objective

Fix two Grok medium-risk findings identified after Phase 2:

1. **Risk 1**: `rollbackToken` transaction alignment — ensure the idempotency lock carries all 7 binding fields (token, tenantId, auditTrailId, approvalId, rollbackTargetVersion, expectedCurrentVersion, newVersion) and models conflict/duplicate/replay/approval-reuse scenarios explicitly.

2. **Risk 2**: Feature 003 → Feature 005 audit metadata cross-validation — ensure that the recommendation → approval → transaction plan chain remains internally consistent at every hand-off point, catching tenant, auditTrailId, sourceRecommendationId, hash, version, and token mismatches before execution.

---

## Files Created

| File | Purpose |
|---|---|
| `catering-system/src/services/modelConfigAuditContinuityService.ts` | Audit metadata cross-validation: apply, rollback, and recommendation→plan continuity |
| `catering-system/src/services/__tests__/modelConfigAuditContinuityService.test.ts` | 32 assertions covering all continuity validators |

## Files Modified

| File | Change |
|---|---|
| `catering-system/src/types/modelConfigApplyExecution.ts` | Added Phase 3 fields to `IdempotencyLockPlan`: `rollbackTargetVersion`, `expectedCurrentVersion`, `newVersion`, `approvalId`, `status`, `duplicatePolicy`, `conflictPolicy` |
| `catering-system/src/types/aiBoundary.ts` | Added 15 new `BlockedReason` members for idempotency conflict modeling and audit continuity cross-validation |
| `catering-system/src/services/modelConfigIdempotencyService.ts` | Updated `IdempotencyLockPlanInput` with optional rollback fields; updated `buildIdempotencyLockPlan` to object-input form; added `IdempotencyConflictType`, `IdempotencyConflictResult`, `simulateIdempotencyConflict` |
| `catering-system/src/services/modelConfigTransactionPlanService.ts` | Updated both `buildIdempotencyLockPlan` call sites to pass object input |
| `catering-system/src/services/__tests__/modelConfigIdempotencyService.test.ts` | Added Phase 3 `simulateIdempotencyConflict` test section (14 new assertions) |

---

## Test File Assertion Counts

| Test file | Assertions |
|---|---|
| `modelConfigIdempotencyService.test.ts` | 13 (original) + 14 (Phase 3) = 27 |
| `modelConfigAuditContinuityService.test.ts` | 32 |
| **Phase 3 total new assertions** | **46** |

---

## rollbackToken 7-Field Binding Documentation

When a rollback idempotency lock is created, the `lockKey` is derived from `tenantId:token`, but the lock carries all 7 binding fields to enable conflict detection:

| Field | Purpose |
|---|---|
| `token` | RollbackToken (deterministic hash of rollback inputs) |
| `tenantId` | Tenant isolation |
| `auditTrailId` | Audit chain linkage |
| `approvalId` | Human approval reference |
| `rollbackTargetVersion` | Version being restored |
| `expectedCurrentVersion` | Version that must be current before rollback |
| `newVersion` | Version that will result after rollback |

---

## Rollback Idempotency Lock Conflict Semantics

| Conflict Type | Trigger | BlockedReason |
|---|---|---|
| `IDEMPOTENT_REPLAY_BLOCKED` | Same token + same approvalId + same versions (safe duplicate) | `IDEMPOTENCY_REPLAY_BLOCKED` |
| `BLOCKED_DUPLICATE` | Same token but different approvalId (unsafe duplicate) | `IDEMPOTENCY_DUPLICATE_ROLLBACK_TOKEN` |
| `VERSION_CONFLICT` | Same rollbackTargetVersion but different newVersion | `IDEMPOTENCY_VERSION_CONFLICT` |
| `APPROVAL_REUSE_BLOCKED` | Same approvalId but different token | `IDEMPOTENCY_APPROVAL_REUSE_BLOCKED` |
| `NO_CONFLICT` | No matching fields | `null` |

---

## Audit Metadata Cross-Validation Coverage

### Apply audit continuity (`validateApplyAuditMetadataContinuity`)

Validates 10 fields between plan and audit event:
- `tenantId`, `approvalId`, `auditTrailId`, `sourceRecommendationId`
- `expectedCurrentVersion`, `newVersion`
- `diffHash`, `configBeforeHash`, `configAfterHash`, `applyToken`

### Rollback audit continuity (`validateRollbackAuditMetadataContinuity`)

Validates 8 fields between plan and audit event:
- `tenantId`, `approvalId`, `auditTrailId`
- `rollbackTargetVersion`, `expectedCurrentVersion`, `newVersion`
- `rollbackReason`, `rollbackToken`

---

## Feature 003 → Feature 005 Continuity Chain

`validateRecommendationToTransactionPlanContinuity` validates the 3-node chain:

```
ModelConfigRecommendation
  → PersistedHumanModelConfigApproval
    → ModelConfigApplyTransactionPlan
```

Checks at each hand-off:
- `tenantId`: recommendation → approval → plan
- `auditTrailId`: recommendation → approval → plan.idempotencyLockPlan.auditTrailId
- `recommendationId → sourceRecommendationId`: recommendation → approval → plan.sourceRecommendationId

---

## Why Phase 3 Still Does Not Execute Any Transaction

All plans carry the structural invariants:
- `aiCanExecute: false`
- `executable: false`
- `requiresHumanApproval: true`
- `status: 'PLANNED'` (IdempotencyLockPlan)

No Firestore writes, no firebase-admin, no google-cloud-firestore, no runTransaction calls exist anywhere in Feature 005. The conflict simulation (`simulateIdempotencyConflict`) is a pure synchronous function operating on in-memory plan objects.

---

## Known Limitations

- `simulateIdempotencyConflict` is a simulation for planning/validation only — it does not query a real idempotency store.
- Audit continuity validators compare in-memory snapshots; they do not read from Firestore.
- `validateRecommendationToTransactionPlanContinuity` checks `plan.idempotencyLockPlan.auditTrailId`, not `plan.auditTrailId` (which does not exist on `ModelConfigApplyTransactionPlan` directly).

---

## AI Safety Invariants Confirmed

1. `aiCanExecute: false` on all plan types
2. `executable: false` on all plan types
3. `requiresHumanApproval: true` on all plan types
4. `IdempotencyLockPlan.planOnly: true`
5. `IdempotencyLockPlan.status: 'PLANNED'` (never 'EXECUTING' or 'COMMITTED')
6. `IdempotencyLockPlan.duplicatePolicy: 'BLOCKED_DUPLICATE'` (duplicate tokens blocked)
7. `IdempotencyLockPlan.conflictPolicy: 'VERSION_CONFLICT_BLOCKED'` (version conflicts blocked)
8. No Firestore imports in any Phase 3 service
9. No `firebase-admin` imports
10. No `runTransaction` calls
11. No `async` functions in Phase 3 services
12. `BlockedReason` union is exhaustive — all new reasons added to the union
13. `PersistedHumanModelConfigApproval.aiCanApprove: false`
14. `ModelConfigRecommendation.aiCanApply: false`
15. All audit continuity validators return `{ valid: false }` rather than throwing on mismatch
