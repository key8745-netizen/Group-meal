# Feature 005 — Model Config Apply Execution: Phase 4
## Final Transaction Readiness + Audit Boundary Hardening

### Phase 4 Objective

Harden two medium risks identified after Phase 3:

1. **Risk 1**: rollbackToken transaction lock plan finalization — add `rollbackReasonHash`, `replayPolicy`, `versionConflictPolicy`, `approvalReusePolicy`, and `VERSION_CHAIN_CONFLICT` conflict type to the idempotency system.
2. **Risk 2**: rollbackReason + rollbackTargetVersion boundary completeness — validate max length, control characters, and stale version detection.

---

### Files Created / Modified

| File | Action | Description |
|---|---|---|
| `src/types/aiBoundary.ts` | Modified (pre-existing) | Added `ROLLBACK_REASON_TOO_LONG`, `ROLLBACK_REASON_INVALID_CHARS`, `ROLLBACK_TARGET_VERSION_INVALID`, `IDEMPOTENCY_VERSION_CHAIN_CONFLICT` to `BlockedReason` |
| `src/types/modelConfigApplyExecution.ts` | Modified (pre-existing) | Added `rollbackReasonHash?`, `replayPolicy`, `versionConflictPolicy`, `approvalReusePolicy` to `IdempotencyLockPlan` |
| `src/services/modelConfigAuditContinuityService.ts` | Modified (pre-existing) | Added `rollbackReasonHash` to `RollbackAuditMetadata`, added hash mismatch check, added `computeRollbackReasonHash()` helper |
| `src/services/modelConfigIdempotencyService.ts` | Modified (pre-existing) | Added `rollbackReasonHash?` to `IdempotencyLockPlanInput`, `VERSION_CHAIN_CONFLICT` to `IdempotencyConflictType`, chain conflict detection in `simulateIdempotencyConflict` |
| `src/services/modelConfigRollbackPreflightService.ts` | Modified (pre-existing) | Added `ROLLBACK_REASON_MAX_LENGTH`, `CONTROL_CHAR_REGEX`, length/control-char validation, `rollbackTargetVersion === newVersion` guard |
| `src/services/__tests__/modelConfigRollbackBoundaryService.test.ts` | Created | Phase 4 comprehensive boundary test (30 assertions, 6 sections) |
| `src/services/__tests__/modelConfigAuditContinuityService.test.ts` | Modified | Added 5 Phase 4 assertions for `rollbackReasonHash`, updated `baseRollbackMeta` to use computed hash |

---

### Release Gate Checklist (24 items)

- [x] No Firestore read/write
- [x] No firebase-admin / google-cloud-firestore
- [x] No runTransaction
- [x] No UI
- [x] No Netlify Function
- [x] No real approval records
- [x] No real apply records
- [x] No real rollback records
- [x] No real settings mutation
- [x] No real settingsHistory write
- [x] Apply transaction plan executable=false
- [x] Rollback transaction plan executable=false
- [x] aiCanExecute=false
- [x] Idempotency lock plan-only
- [x] Rollback modeled as new human-approved change
- [x] Rollback does not delete history
- [x] Rollback does not overwrite old version (appendOnly=true, immutable=true)
- [x] RollbackReason boundaries tested
- [x] RollbackTargetVersion boundaries tested
- [x] Audit metadata cross-validation complete
- [x] Feature 003 → Feature 005 continuity verified
- [x] Tests pass
- [x] Typecheck pass
- [x] Build pass

---

### Rollback Atomic Semantics

A rollback is modeled as a **new human-approved change** that sets the active config version back to a prior version. It does NOT:
- Delete any history entries
- Overwrite any existing `settingsHistory` documents
- Execute any transaction directly

The `settingsHistoryWritePlan` uses:
- `appendOnly: true` — the write must only append, never update
- `immutable: true` — once written, the entry cannot be modified

The `settingsUpdatePlan.newVersion` is set to `rollbackTargetVersion` (the version being restored), while `currentVersion` remains the version being rolled back from. These must always differ: `newVersion !== currentVersion`.

---

### rollbackToken 7-Field Binding + rollbackReasonHash

The `rollbackToken` is a SHA-256 hash of 7 canonical fields:

| Field | Purpose |
|---|---|
| `tenantId` | Tenant isolation |
| `approvalId` | Binds to specific approval record |
| `rollbackTargetVersion` | The version being restored |
| `expectedCurrentVersion` | Optimistic concurrency check |
| `newVersion` | The version that will be written |
| `auditTrailId` | Audit chain linkage |
| `rollbackReason` | Human-provided reason (included in token) |

Additionally, `rollbackReasonHash` is computed independently as `SHA-256({ rollbackReason })` and stored in both the `IdempotencyLockPlan` and `RollbackAuditMetadata` for cross-validation. A mismatch in either `rollbackReason` or `rollbackReasonHash` triggers `AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH`.

---

### Idempotency Conflict Types

| ConflictType | Condition | BlockedReason |
|---|---|---|
| `BLOCKED_DUPLICATE` | Same token, different approvalId | `IDEMPOTENCY_DUPLICATE_ROLLBACK_TOKEN` |
| `IDEMPOTENT_REPLAY_BLOCKED` | Same token, same approvalId, same versions | `IDEMPOTENCY_REPLAY_BLOCKED` |
| `VERSION_CONFLICT` | Same rollbackTargetVersion, different newVersion | `IDEMPOTENCY_VERSION_CONFLICT` |
| `APPROVAL_REUSE_BLOCKED` | Same approvalId, different token | `IDEMPOTENCY_APPROVAL_REUSE_BLOCKED` |
| `VERSION_CHAIN_CONFLICT` | existing.rollbackTargetVersion === incoming.expectedCurrentVersion | `IDEMPOTENCY_VERSION_CHAIN_CONFLICT` |
| `NO_CONFLICT` | None of the above match | null |

The `VERSION_CHAIN_CONFLICT` detects a chained rollback attempt: when an existing plan's `rollbackTargetVersion` is the same as an incoming plan's `expectedCurrentVersion`, it means the incoming plan is trying to roll back FROM the version the existing plan just rolled back TO.

---

### rollbackReason Validation Rules

| Rule | BlockedReason |
|---|---|
| Empty or whitespace-only | `ROLLBACK_EXEC_MISSING_ROLLBACK_REASON` |
| Length > 500 characters | `ROLLBACK_REASON_TOO_LONG` |
| Contains control characters `\x00-\x08\x0B\x0C\x0E-\x1F\x7F` | `ROLLBACK_REASON_INVALID_CHARS` |
| `rollbackTargetVersion === expectedCurrentVersion` | `ROLLBACK_EXEC_SAME_VERSION` |
| `rollbackTargetVersion === newVersion` | `ROLLBACK_TARGET_VERSION_INVALID` |

Unicode and CJK characters are permitted. Special characters such as `!@#$%^&*()` are permitted as long as they are not control characters.

---

### Known Limitations

- All plans remain dry-run only — no real transaction is executed.
- `rollbackTargetVersion` semantic ordering is not enforced (versions are opaque strings); only equality guards are applied.
- The idempotency lock plan is never written to Firestore — it is plan-only (`planOnly: true`).
- No state machine governs the transition from PLANNED → EXECUTED; that is reserved for a future phase.

---

### Cumulative Test Assertion Table

| Test File | Assertions | Phase |
|---|---|---|
| `modelConfigIdempotencyService.test.ts` | 28 | Phases 1–3 |
| `modelConfigAuditContinuityService.test.ts` | 37 | Phases 3–4 |
| `modelConfigRollbackBoundaryService.test.ts` | 30 | Phase 4 |
| (other Phase 1–3 test files) | ~90+ | Phases 1–3 |
| **Phase 4 total (new assertions)** | **35** | Phase 4 |
| **Grand total** | **~185** | All phases |
