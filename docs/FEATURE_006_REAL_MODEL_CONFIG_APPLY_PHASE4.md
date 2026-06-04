# Feature 006 Phase 4 — Final Transaction Readiness Hardening
# + Dry-run Release Gate

---

## Phase 4 Scope

Phase 4 resolves the two Grok medium risks from Phase 3:

1. **Cleanup query criteria modeling** — `buildLockCleanupQueryCriteriaPlan`: concrete, descriptive criteria plan with explicit non-executable guards. No Firestore query object.
2. **Maintenance audit event payload** — `buildLockCleanupMaintenanceAuditEventPlan`: full payload structure with all required fields for a future maintenance audit write.
3. **Multi-version rollback chain validation** — `validateMultiVersionRollbackSnapshotChain`: validates ordered snapshot chains across N versions, enforcing strict version ascendancy, per-snapshot integrity, tenant consistency, and target hash match.
4. **Dry-run release gate checklist** — 24-item checklist confirming all transaction readiness invariants hold across Phases 1–4.

No Firestore read/write. No `runTransaction`. No real cleanup job. No real apply or rollback.

---

## Changed Files

### Modified Services

- `catering-system/src/services/modelConfigLockCleanupService.ts` (Phase 4 additions)
  - Added `CleanupTrigger = 'TTL_INDEX' | 'SCHEDULED_JOB' | 'MANUAL_ADMIN'`
  - Added `CleanupMode = 'DRY_RUN' | 'LIVE'`
  - Added `LockCleanupQueryCriteriaPlan` — all non-executable guards: `containsFirestoreQueryObject: false`, `containsDeleteFunction: false`, `containsWriteFunction: false`, `containsCommitFunction: false`, `containsRunTransaction: false`
  - Added `buildLockCleanupQueryCriteriaPlan(input)` — builds descriptive query criteria plan
  - Added `LockCleanupMaintenanceAuditEventPlan` — full audit payload: `eventType`, `maintenanceRunId`, `cleanupTrigger`, `cleanupMode`, `candidateLockCount`, `cleanupEligibleCount`, `blockedCount`, `criteriaHash`, `generatedAt`, `blockedReasons`
  - Added `buildLockCleanupMaintenanceAuditEventPlan(input)` — builds audit payload plan

- `catering-system/src/services/modelConfigHistoricalValidationService.ts` (Phase 4 addition)
  - Added `MultiVersionRollbackChainInput`, `MultiVersionRollbackChainResult`
  - Added `validateMultiVersionRollbackSnapshotChain(input)` — multi-snapshot chain validator (8 rules)

### New Tests

| Test File | Assertions |
|---|---|
| `modelConfigPhase4Integration.test.ts` | 48 |
| **Phase 4 new total** | **48** |
| **Cumulative (all features)** | **509** |

---

## Cleanup Query Criteria Plan

### `buildLockCleanupQueryCriteriaPlan`

Produces a `LockCleanupQueryCriteriaPlan` that is **descriptive only**:
- `collectionPath: 'modelConfigIdempotencyLocks'` — string only, no Firestore reference
- `eligibleStatuses: ['EXPIRED', 'CLEANUP_ELIGIBLE', 'CONSUMED']`
- `expiresAtBefore: now` — cut-off timestamp
- `cleanupEligibleAtBefore: now` — grace period cut-off
- `excludeOwner: 'AI'` — AI locks structurally excluded
- `criteriaDescription` — human-readable query description including tenant, statuses, timestamps, ACTIVE exclusion note

**Non-executable guards (all `false` at the type level):**
| Guard | Value |
|---|---|
| `containsFirestoreQueryObject` | `false` |
| `containsDeleteFunction` | `false` |
| `containsWriteFunction` | `false` |
| `containsCommitFunction` | `false` |
| `containsRunTransaction` | `false` |

**Phase 5 (future):** A `SYSTEM_MAINTENANCE` service account reads these criteria and constructs a real Firestore query. AI is never in this path.

---

## Maintenance Audit Event Payload

### `buildLockCleanupMaintenanceAuditEventPlan`

Produces a `LockCleanupMaintenanceAuditEventPlan` with full audit payload:

| Field | Description |
|---|---|
| `eventType` | `'MODEL_CONFIG_LOCK_CLEANUP_MAINTENANCE'` — identifies event class |
| `tenantId` | Scoped to a single tenant |
| `auditTrailId` | Caller-supplied audit trail reference |
| `maintenanceRunId` | Unique identifier for this maintenance run |
| `cleanupOwner` | Always `'SYSTEM_MAINTENANCE'` |
| `cleanupTrigger` | `TTL_INDEX \| SCHEDULED_JOB \| MANUAL_ADMIN` |
| `cleanupMode` | Always `'DRY_RUN'` in Phase 4 |
| `candidateLockCount` | Total locks examined |
| `cleanupEligibleCount` | Locks eligible for deletion |
| `blockedCount` | Locks blocked by guards |
| `criteriaHash` | Hash of the query criteria used |
| `generatedAt` | Timestamp of plan generation |
| `blockedReasons` | Any guard violations encountered |
| `note` | Human-readable summary |

**Hard invariants:**
- `dryRunOnly: true` — plan only, never executed
- `aiCanExecute: false` — permanent hard invariant

**Phase 5 (future):** Written to a `maintenanceAudit` collection after real cleanup execution by `SYSTEM_MAINTENANCE`.

---

## Multi-version Rollback Snapshot Chain

### `validateMultiVersionRollbackSnapshotChain`

Validates an ordered chain of `SettingsHistorySnapshot` records for a rollback operation.

**8 Validation Rules (tenant hard guard first):**

| Rule | Check | Blocked Reason |
|---|---|---|
| 1 | `tenantId` present | `REAL_ROLLBACK_TENANT_MISMATCH` |
| 2 | `rollbackTargetVersion` present | `REAL_ROLLBACK_MISSING_ROLLBACK_TOKEN` |
| 3 | `snapshots` array non-empty | `REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND` |
| 4 | Every snapshot belongs to `tenantId` | `REAL_ROLLBACK_TENANT_MISMATCH` |
| 5 | Every snapshot: `immutable=true`, `deleted≠true`, `overwritten≠true` | `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH` |
| 6 | Versions strictly ascending (no duplicates, no regression) | `REAL_ROLLBACK_SAME_VERSION` |
| 7 | Target version exists in chain | `REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND` |
| 8 | Target snapshot `configHash === expectedHistoricalConfigHash` | `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH` |

**Returns:** `{ valid, blockedReasons, validatedTargetConfigHash, chainLength }`
- `validatedTargetConfigHash` is `null` if any check fails

**Phase 4:** pure logic — caller supplies all snapshots.
**Phase 5 (future):** caller reads the full version chain from `settingsHistory/{tenantId}/versions/` inside `runTransaction`, then passes the ordered array here.

---

## Dry-run Release Gate Checklist

All 24 items must be `✅ PASS` before Feature 006 can transition to real transaction execution.

### Transaction Plan Invariants

- [x] 1. `RealApplyTransactionContract.executable === false`
- [x] 2. `RealApplyTransactionContract.aiCanExecute === false`
- [x] 3. `RealApplyTransactionContract.requiresHumanApproval === true`
- [x] 4. `RealRollbackTransactionContract.executable === false`
- [x] 5. `RealRollbackTransactionContract.aiCanExecute === false`
- [x] 6. `RealRollbackTransactionContract.requiresHumanApproval === true`

### Lock Plan Invariants

- [x] 7. `LockAcquisitionPlan.planOnly === true`
- [x] 8. `LockAcquisitionPlan.executable === false`
- [x] 9. `LockCleanupDryRunPlan.dryRunOnly === true`
- [x] 10. `LockCleanupDryRunPlan.aiCanTrigger === false`
- [x] 11. `LockCleanupDryRunPlan.aiCanOwnLock === false`
- [x] 12. `LockCleanupQueryCriteriaPlan.executable === false`
- [x] 13. `LockCleanupQueryCriteriaPlan.containsFirestoreQueryObject === false`
- [x] 14. `LockCleanupQueryCriteriaPlan.containsDeleteFunction === false`

### Cleanup Owner Invariants

- [x] 15. `MaintenanceAuditEventPlan.aiCanOwnCleanup === false`
- [x] 16. `LockCleanupMaintenanceAuditEventPlan.aiCanExecute === false`
- [x] 17. `LockCleanupMaintenanceAuditEventPlan.cleanupOwner === 'SYSTEM_MAINTENANCE'`
- [x] 18. `LockCleanupMaintenanceAuditEventPlan.cleanupMode === 'DRY_RUN'`

### Service Guard Invariants

- [x] 19. AI caller is blocked by `validateServiceGuardEntrance` (`REAL_APPLY_AI_CALLER_BLOCKED`)
- [x] 20. AI + AdminSdk is blocked by `validateServiceGuardEntrance` (Admin SDK does not bypass)
- [x] 21. Tenant hard guard always executes first across all validators
- [x] 22. Lock owner `AI` is blocked by `buildLockCleanupDryRunPlan` (`BLOCKED_INVALID_OWNER`)

### Historical Hash Invariants

- [x] 23. `mapSettingsHistorySnapshotToHistoricalHash` returns `mappedConfigHash = null` on any block condition
- [x] 24. `validateMultiVersionRollbackSnapshotChain` returns `validatedTargetConfigHash = null` on any block condition

---

## Firestore Confirmation

- No Firestore read
- No Firestore write
- No `firebase-admin` import
- No `google-cloud-firestore` import
- No `runTransaction` call
- No real cleanup job created
- No `settings` mutation
- No `settingsHistory` write
- No real apply executed
- No real rollback executed
- No cleanup query object constructed
- No maintenance audit event written

---

## Known Limitations / Phase 5 Forward Items

1. `LockCleanupQueryCriteriaPlan` remains descriptive-only. Phase 5 must implement the real Firestore query execution under a `SYSTEM_MAINTENANCE` service account, never AI.
2. `LockCleanupMaintenanceAuditEventPlan` is a pure plan. Phase 5 must persist it to a `maintenanceAudit` collection before executing deletions.
3. `validateMultiVersionRollbackSnapshotChain` receives a caller-supplied snapshot array. Phase 5 must read the full version chain from Firestore inside `runTransaction` before passing it here.
4. Stale ACTIVE lock (`CLEANUP_ELIGIBLE_STALE_ACTIVE`) deletion path must add an additional Phase 5 check: confirm the lock token is absent from any active transaction context before deleting.
5. Scheduled maintenance job cron syntax and Cloud Function / Cloud Scheduler deployment target remain undocumented. Phase 5 will define these.
6. `LockCleanupMaintenanceAuditEventPlan.cleanupMode` is always `'DRY_RUN'` in Phase 4. Phase 5 will introduce `'LIVE'` mode after human confirmation.
