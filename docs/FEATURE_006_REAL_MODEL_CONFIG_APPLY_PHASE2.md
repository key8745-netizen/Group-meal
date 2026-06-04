# Feature 006 Phase 2 — Transaction Readiness Integration
# Historical Hash Validation + Lock Cleanup Design

---

## Phase 2 Scope

Phase 2 hardens the two Grok medium risks from Phase 1:
1. `rollback historicalConfigHash` cross-validation against the caller-supplied `settingsHistory` snapshot.
2. Idempotency lock lifecycle, cleanup eligibility, cleanup schedule, and service guard entrance contract.

No Firestore read/write. No runTransaction. No real apply or rollback.

---

## Changed Files

### New Services

- `catering-system/src/services/modelConfigHistoricalValidationService.ts`
  - `SettingsHistorySnapshot` interface — `immutable: true`, no `deleted`, no `overwritten`
  - `validateRollbackHistoricalConfigHash(input)` — 9-step validation, tenant guard first
  - `validateRollbackTargetVersion(input)` — version chain semantics (target < current < new)

- `catering-system/src/services/modelConfigLockCleanupService.ts`
  - `LockLifecycleStatus` — `PLANNED | ACTIVE | CONSUMED | EXPIRED | CLEANUP_ELIGIBLE`
  - `LockOwner = 'HUMAN_SERVICE'`
  - `LockLifecycleDocument` — `aiCanOwnLock: false`, all 4 conflict policies, `cleanupEligibleAt`
  - `LockCleanupPlan` — `dryRunOnly: true, aiCanTrigger: false`
  - `buildLockLifecycleDocument(input)` — `expiresAt = now + 300s`, `cleanupEligibleAt = expiresAt + 60s`
  - `checkLockCleanupEligibility(input)` — safe deletion rules
  - `buildLockCleanupPlan(lock)` — maps eligibility to cleanup strategy
  - `getLockCleanupSchedule()` — 3-level schedule with owner, trigger, auditRequired
  - `validateServiceGuardEntrance(input)` — Admin SDK / Service Account do not bypass guard

### New Tests

| Test File | Assertions |
|---|---|
| `modelConfigHistoricalValidationService.test.ts` | 19 |
| `modelConfigLockCleanupService.test.ts` | 46 |
| **Phase 2 new total** | **65** |
| **Cumulative (all features)** | **422** |

---

## Historical Config Hash Cross-validation

### `validateRollbackHistoricalConfigHash`

Called with a `SettingsHistorySnapshot` that the **caller** must read from Firestore before passing in. This helper validates the in-memory snapshot — it does not read Firestore.

**Validation order (tenant hard guard first):**
1. tenantId present (tenant hard guard — early exit)
2. rollbackTargetVersion present
3. historicalSnapshot present → `REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND`
4. snapshot.tenantId === request.tenantId → `REAL_ROLLBACK_TENANT_MISMATCH`
5. snapshot.version === rollbackTargetVersion → `REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND`
6. snapshot.configHash === expectedHistoricalConfigHash → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
7. snapshot.immutable === true → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
8. snapshot.deleted !== true → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
9. snapshot.overwritten !== true → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`

### `validateRollbackTargetVersion`

Validates the version chain semantics:
- `rollbackTargetVersion` must be present
- `rollbackTargetVersion !== expectedCurrentVersion` (same-version guard) → `REAL_ROLLBACK_SAME_VERSION`
- `rollbackTargetVersion < expectedCurrentVersion` (must be older) → `ROLLBACK_TARGET_VERSION_INVALID`
- `newVersion > expectedCurrentVersion` (new history record) → `ROLLBACK_TARGET_VERSION_INVALID`
- `expectedHistoricalConfigHash` must be present → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`

---

## Lock Lifecycle Design

### Lifecycle States

| Status | Meaning | Cleanup Eligible? |
|---|---|---|
| `PLANNED` | Phase 1 plan-only, never written to Firestore | No |
| `ACTIVE` | Written to Firestore, transaction in flight | **Never** — must not delete |
| `CONSUMED` | Transaction committed, lock released | Yes, after `cleanupEligibleAt` + `consumedAt` present |
| `EXPIRED` | TTL passed | Yes, after `cleanupEligibleAt` |
| `CLEANUP_ELIGIBLE` | Past expiresAt, marked for cleanup | Yes, after `cleanupEligibleAt` |

### Timing

- `expiresAt = createdAt + 300s` (LOCK_TTL_SECONDS)
- `cleanupEligibleAt = expiresAt + 60s` (grace period for Firestore TTL)

### Lock Owner

- `lockOwner: 'HUMAN_SERVICE'` (always)
- `aiCanOwnLock: false` (hard invariant)

---

## Lock Cleanup Strategy (3-Level)

| Priority | Trigger | Owner | Audit Required | AI Allowed |
|---|---|---|---|---|
| 1 | Firestore TTL index on `expiresAt` | Firestore infrastructure | No | **No** |
| 2 | Scheduled maintenance job (cron, every 15 min) | System maintenance role (human-operated) | Yes | **No** |
| 3 | Manual admin script via ops runbook | Ops team (human) | Yes | **No** |

### Cleanup Safety Rules

- **Must never delete** a lock with `status: 'ACTIVE'` — transaction may be in flight.
- **Must never delete** a lock with `status: 'PLANNED'` — not written to Firestore.
- Scheduled job and admin script must run **dry-run preview** before live deletion.
- Every deletion must log `auditTrailId` of the intervention.
- `cleanupEligibleAt` must have passed before any deletion.
- `CONSUMED` locks require `consumedAt` to be present before cleanup.

### Cleanup Plan

`buildLockCleanupPlan()` returns `LockCleanupPlan`:
- `dryRunOnly: true` — Phase 2 plans are never executed.
- `aiCanTrigger: false` — permanent hard invariant.
- Maps eligibility to `cleanupStrategy: 'TTL_INDEX' | 'SCHEDULED_JOB' | 'MANUAL_ADMIN'`.

---

## Service Guard Entrance Contract

`validateServiceGuardEntrance()` must run before any transaction body.

**Validation order (tenant hard guard first):**
1. `tenantId` present → `REAL_APPLY_TENANT_MISMATCH` (early exit)
2. `callerType === 'ai'` → `REAL_APPLY_AI_CALLER_BLOCKED` (not bypassable)
3. `isServiceAccount` or `isAdminSdk` without `callerUserId` → `REAL_APPLY_MISSING_HUMAN_APPROVER`
4. `callerUserId` missing or empty → `REAL_APPLY_MISSING_HUMAN_APPROVER`
5. `hasApproval === false` → `REAL_APPLY_APPROVAL_NOT_APPROVED`

**Key invariant:** Admin SDK and Service Account do not bypass this guard. An AI agent using Admin SDK credentials is still blocked at step 2.

---

## Firestore Confirmation

- No Firestore read
- No Firestore write
- No `firebase-admin` import
- No `google-cloud-firestore` import
- No `runTransaction` call
- No `settings` mutation
- No `settingsHistory` write
- No real apply executed
- No real rollback executed
- `executable: false` on all plans
- `aiCanExecute: false` on all plans
- `dryRunOnly: true` on all cleanup plans
- `aiCanTrigger: false` on all cleanup plans

---

## Known Limitations

1. `SettingsHistorySnapshot` is a pure TypeScript interface. Phase 3 must read the actual Firestore document and map it to this type before passing to `validateRollbackHistoricalConfigHash`.
2. Version ordering in `validateRollbackTargetVersion` uses string comparison. Phase 3 should replace with a proper monotonic counter or semver comparison for production safety.
3. `LockLifecycleStatus` transitions (`PLANNED → ACTIVE → CONSUMED`) are documented but not enforced by state machine in Phase 2. Phase 3 will enforce transitions inside `runTransaction`.
4. The scheduled maintenance job (cleanup schedule priority 2) is documented but not implemented. Phase 3+ will implement the actual Firestore query and deletion.
5. `LockLifecycleDocument` is a pure TypeScript model. Phase 3 will persist it to the `modelConfigIdempotencyLocks` collection inside `runTransaction`.
