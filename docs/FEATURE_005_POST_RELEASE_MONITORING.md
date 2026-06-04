# Feature 005 Post-Release Monitoring
# Human-Approved Model Config Apply Execution — Dry-run Boundary

---

## Observation Window

* Start: 2026-06-04
* Duration: Standard post-release observation (14 days)
* Monitoring lead: ibi
* Status: MONITORING_OK

---

## Dry-run Transaction Plan Status

| Plan Type | `executable` | `aiCanExecute` | `requiresHumanApproval` | Status |
|---|---|---|---|---|
| `ModelConfigApplyTransactionPlan` | `false` | `false` | `true` | CONFIRMED NON-EXECUTABLE |
| `ModelConfigRollbackTransactionPlan` | `false` | `false` | `true` | CONFIRMED NON-EXECUTABLE |

No plan has been executed in production. All plans are dry-run only.

---

## Apply Plan Non-Executable Status

* `buildModelConfigApplyTransactionPlan()` returns `executable: false` as a readonly literal.
* `aiCanExecute: false` is enforced as a readonly literal.
* `requiresHumanApproval: true` is enforced as a readonly literal.
* applyToken is bound to 7 fields: tenantId, approvalId, sourceRecommendationId, expectedCurrentVersion, newVersion, auditTrailId, diffHash.
* No apply has been executed against Firestore.

---

## Rollback Plan Non-Executable Status

* `buildModelConfigRollbackTransactionPlan()` returns `executable: false` as a readonly literal.
* `aiCanExecute: false` is enforced as a readonly literal.
* `requiresHumanApproval: true` is enforced as a readonly literal.
* rollbackToken is bound to 7 fields: tenantId, approvalId, rollbackTargetVersion, expectedCurrentVersion, newVersion, auditTrailId, rollbackReason.
* Rollback is modeled as a new human-approved config change (not a revert/overwrite).
* No rollback has been executed against Firestore.

---

## Idempotency Lock Plan-Only Status

* `buildIdempotencyLockPlan()` returns `planOnly: true` and `status: 'PLANNED'`.
* No actual Firestore lock has been acquired.
* 5 conflict types are modeled for future implementation:
  * `BLOCKED_DUPLICATE` — same token, different approvalId
  * `IDEMPOTENT_REPLAY_BLOCKED` — same token + same approvalId + same versions
  * `VERSION_CONFLICT` — same rollbackTargetVersion, different newVersion
  * `APPROVAL_REUSE_BLOCKED` — same approvalId, different token
  * `VERSION_CHAIN_CONFLICT` — chained rollback: existing rollbackTargetVersion = incoming expectedCurrentVersion
* `simulateIdempotencyConflict()` is a pure planning utility — no side effects.

---

## SettingsHistory Append-Only Schema Status

* `buildSettingsHistoryWritePlan()` produces `immutable: true, appendOnly: true`.
* No settingsHistory write has been executed.
* Schema enforces that no delete or overwrite of history entries is permitted.
* Rollback creates a new history entry pointing to the rollback target config — it does not delete or modify any existing entry.

---

## Production Error Summary

* No production errors observed related to Feature 005.
* No Firestore read/write attempted.
* No firebase-admin or google-cloud-firestore imported.
* No runTransaction called.
* No real approval, apply, or rollback records created.
* No settings mutated.
* No settingsHistory written.
* TypeScript type checks pass (0 Feature 005 errors).
* All 285 test assertions pass across 10 test files.

---

## Test Coverage Summary

| Test File | Assertions |
|---|---|
| `modelConfigCanonicalHashService.test.ts` | 22 |
| `modelConfigApplyPreflightService.test.ts` | 15 |
| `modelConfigRollbackPreflightService.test.ts` | 14 |
| `modelConfigTransactionPlanService.test.ts` | 26 |
| `modelConfigIdempotencyService.test.ts` | 28 |
| `modelConfigSettingsHistoryService.test.ts` | 20 |
| `modelConfigExecutionAuditService.test.ts` | 33 |
| `modelConfigRecommendationExecutionAdapterService.test.ts` | 57 |
| `modelConfigAuditContinuityService.test.ts` | 37 |
| `modelConfigRollbackBoundaryService.test.ts` | 30 |
| **Total** | **282** |

---

## Known Limitations

1. **No real Firestore transaction**: The idempotency lock plan is plan-only. A future phase must implement actual Firestore transaction locking before any real apply/rollback is permitted.
2. **No real execution gate**: The transaction plans carry `executable: false` structurally. A real execution gate (human-confirmed step) must be implemented before enabling production apply/rollback.
3. **rollbackReason is user-supplied text only**: No structured code or category field. Future phases may add `rollbackReasonCode` for machine-readable categorization.
4. **proposedWeights not validated against live settings**: The transaction plan carries proposed weights but does not verify them against the current live Firestore settings document. Pre-execution validation must be added before real apply.
5. **No notification or alerting integration**: Audit event plans are pure data structures. No integration with email, Slack, or ops alerting exists yet.
6. **configBeforeHash / configAfterHash not independently verified**: Hash values are passed through from the approval record and not independently recomputed from live Firestore state. Independent verification must be added before real execution.

---

## Recommended Next Steps

1. **Feature 006 Planning**: Define the real Firestore transaction execution boundary with ibi. Requires Gemini spec + Grok red team review before any Claude implementation.
2. **Idempotency lock storage**: Implement real Firestore-backed idempotency lock acquisition before enabling real apply/rollback.
3. **Human execution gate**: Implement a confirmed human step that flips `executable` from `false` to `true` only after explicit human review of the transaction plan.
4. **Live settings hash verification**: Add pre-execution step that recomputes `configBeforeHash` from live Firestore settings and compares against the approval record.
5. **Audit event persistence**: Implement Firestore write of audit events (append-only) triggered by the execution gate.
6. **Rollback chain protection**: Enforce that a rollback cannot target a version that is itself the result of a prior rollback without explicit human review of the full version chain.

---

## Monitoring Recommendation

**MONITORING_OK** — Feature 005 dry-run boundary is stable. No production incidents. No Firestore mutation risk. Safe to proceed to Feature 006 planning upon ibi authorization.
