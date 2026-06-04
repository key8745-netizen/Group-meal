# Feature 004: Model Config Apply Boundary — Phase 2 Delivery

**Delivered:** 2026-06-04  
**Branch:** `claude/busy-heisenberg-HcwYg`  
**Phase 1 base commit:** `340ee9d`

---

## Objective

Wire Feature 003 `ModelConfigRecommendation` into the Feature 004 apply boundary as a non-executable dry-run pipeline:

```
ModelConfigRecommendation
  → createSimulatedHumanApproval()       (pure helper, validates required human fields)
  → createApplyPlanFromRecommendation()  (continuity checks + dry-run ModelConfigApplyPlan)
  → createRollbackPlanFromApplyPlan()    (dry-run ModelConfigRollbackPlan)
  + ModelConfigAuditEvent payload
```

No Firestore. No real apply. No real rollback. No UI. No AI self-apply. Always dry-run.

---

## New Files

### `src/services/modelConfigRecommendationApplyAdapterService.ts`

Three exported functions:

| Function | Description |
|---|---|
| `createSimulatedHumanApproval()` | Pure helper; validates `approvedByHumanUserId` and `approvalReason` are non-empty. Returns a `HumanModelConfigApproval` or blocked result. |
| `createApplyPlanFromRecommendation()` | Validates recommendation↔approval continuity (tenant, recommendation ID, audit trail), enforces AI guard invariants, then calls `simulateModelConfigApplyPlan()`. Returns apply plan + rollback plan + audit event. |
| `createRollbackPlanFromApplyPlan()` | Pure helper to derive a rollback plan from a given apply plan. Delegates to `simulateModelConfigRollbackPlan()`. |

### `src/services/__tests__/modelConfigRecommendationApplyAdapterService.test.ts`

52 assertions covering:
- Happy path: full pipeline produces correct dry-run plan + rollback + audit event
- Guard invariants: `aiCanApply: false`, `executable: false`, `requiresHumanApproval: true`, `aiCanRollback: false` verified on every output path
- Blocked paths: tenant mismatch, recommendation ID mismatch, audit trail mismatch, missing approval fields
- Determinism: same inputs → same hashes across two calls
- Pure: no I/O, all functions synchronous

---

## New BlockedReasons (added to `aiBoundary.ts`)

| Reason | Trigger |
|---|---|
| `ADAPTER_RECOMMENDATION_TENANT_MISMATCH` | `recommendation.tenantId !== simulatedApproval.tenantId` |
| `ADAPTER_APPROVAL_TENANT_MISMATCH` | `currentConfigVersion.tenantId !== simulatedApproval.tenantId` |
| `ADAPTER_RECOMMENDATION_ID_MISMATCH` | `recommendation.recommendationId !== simulatedApproval.sourceRecommendationId` |
| `ADAPTER_AUDIT_TRAIL_MISMATCH` | `recommendation.auditTrailId !== simulatedApproval.auditTrailId` |
| `ADAPTER_MISSING_APPROVED_BY_USER` | `approvedByHumanUserId` empty or whitespace |
| `ADAPTER_MISSING_APPROVAL_REASON` | `approvalReason` empty or whitespace |
| `ADAPTER_RECOMMENDATION_AI_APPLY_GUARD` | `recommendation.aiCanApply !== false` (hard guard) |
| `ADAPTER_RECOMMENDATION_HUMAN_APPROVAL_REQUIRED` | `recommendation.requiresHumanApproval !== true` (hard guard) |

---

## Test Tally

| File | Assertions |
|---|---|
| Phase 1 (carried forward) | 158 |
| `modelConfigRecommendationApplyAdapterService.test.ts` | 52 |
| **Total Feature 004** | **210** |

---

## AI Safety Invariants Verified

All output types carry literal `false`/`true` for safety fields — no conditional, no override path:

| Field | Value | Scope |
|---|---|---|
| `applyPlan.aiCanApply` | `false` | All paths incl. blocked |
| `applyPlan.executable` | `false` | All paths incl. blocked |
| `applyPlan.requiresHumanApproval` | `true` | All paths incl. blocked |
| `rollbackPlan.aiCanRollback` | `false` | All paths |
| `rollbackPlan.executable` | `false` | All paths |
| `rollbackPlan.humanApprovalRequired` | `true` | All paths |
| `auditEvent.metadata.aiCanApply` | `false` | All paths |
| `auditEvent.metadata.requiresHumanApproval` | `true` | All paths |
| `approval.aiCanApprove` | `false` | All paths |

---

## Phase Gate Status

- [x] All 52 new assertions pass
- [x] All 158 Phase 1 assertions still pass
- [x] `npm run typecheck` — clean (0 errors)
- [x] No Firestore reads or writes
- [x] No real apply or rollback executed
- [x] No UI changes
- [x] `aiCanApply: false` literal on all output objects
- [x] `executable: false` literal on all output objects
