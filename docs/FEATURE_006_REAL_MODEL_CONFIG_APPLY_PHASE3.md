# Feature 006 Phase 3 — Lock Cleanup Pseudo-implementation
# + settingsHistory Snapshot Mapping

---

## Phase 3 Scope

Phase 3 hardens the two Grok medium risks from Phase 2:
1. `mapSettingsHistorySnapshotToHistoricalHash` — 11-step mapping from caller-supplied settingsHistory snapshot to historicalConfigHash, with extended metadata validation.
2. `buildLockCleanupDryRunPlan` — 9-rule dry-run cleanup decision engine with `MaintenanceAuditEventPlan`.

No Firestore read/write. No runTransaction. No real cleanup job. No real apply or rollback.

---

## Changed Files

### Modified Services

- `catering-system/src/services/modelConfigHistoricalValidationService.ts` (Phase 2 + Phase 3)
  - Extended `SettingsHistorySnapshot` with optional metadata: `configBeforeHash`, `configAfterHash`, `diffHash`, `sourceAuditTrailId`, `approvalId`
  - Added `mapSettingsHistorySnapshotToHistoricalHash(input)` — 11-step mapping, returns `mappedConfigHash`
  - Added `SnapshotMappingInput`, `SnapshotMappingResult`

- `catering-system/src/services/modelConfigLockCleanupService.ts` (Phase 2 + Phase 3)
  - Added `CleanupDecision` — 9 decision values
  - Added `CleanupOwner = 'HUMAN_SERVICE' | 'SYSTEM_MAINTENANCE'`
  - Added `MaintenanceAuditEventPlan` — `executable: false, aiCanExecute: false, aiCanOwnCleanup: false`
  - Added `LockCleanupDryRunPlan` — `executable: false, aiCanExecute: false, dryRunOnly: true, aiCanTrigger: false, aiCanOwnLock: false`
  - Added `buildLockCleanupDryRunPlan(input)` — 9-rule decision engine

### New Tests

| Test File | Assertions |
|---|---|
| `modelConfigPhase3Integration.test.ts` | 39 |
| **Phase 3 new total** | **39** |
| **Cumulative (all features)** | **461** |

---

## settingsHistory Snapshot Mapping

### `mapSettingsHistorySnapshotToHistoricalHash`

The authoritative Phase 3 entry point for mapping a settingsHistory snapshot to the `historicalConfigHash` required for rollback validation.

**Phase 3:** pure logic — caller supplies the snapshot.
**Phase 4 (future):** caller reads `settingsHistory/{tenantId}/versions/{version}` from Firestore inside `runTransaction`, then passes the document as `historicalSnapshot`.

**Validation order (tenant hard guard first):**
1. `tenantId` present (tenant hard guard — early exit)
2. `rollbackTargetVersion` present (early exit)
3. `historicalSnapshot` present → `REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND` (early exit)
4. `snapshot.tenantId === request.tenantId` → `REAL_ROLLBACK_TENANT_MISMATCH`
5. `snapshot.version === rollbackTargetVersion` → `REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND`
6. `snapshot.configHash` present → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
7. `snapshot.configHash === expectedHistoricalConfigHash` → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
8. `snapshot.immutable === true` → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
9. `snapshot.deleted !== true` → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
10. `snapshot.overwritten !== true` → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
11. Extended metadata (if `requireExtendedMetadata`): `sourceAuditTrailId` → `REAL_ROLLBACK_MISSING_AUDIT_TRAIL`; `approvalId` → `REAL_ROLLBACK_APPROVAL_NOT_APPROVED`

Returns `{ valid, blockedReasons, mappedConfigHash }` — `mappedConfigHash` is `null` if any check fails.

---

## Lock Cleanup Dry-run Plan

### `buildLockCleanupDryRunPlan`

Produces a `LockCleanupDryRunPlan` with `executable: false, dryRunOnly: true, aiCanTrigger: false, aiCanOwnLock: false`.

**9 Decision Rules (evaluated in order):**

| Rule | Condition | Decision |
|---|---|---|
| 1 | `lockOwner === 'AI'` | `BLOCKED_INVALID_OWNER` |
| 2 | Missing `expiresAt` or `cleanupEligibleAt` | `BLOCKED_INVALID_LOCK_METADATA` |
| 3 | `ACTIVE` and `now < expiresAt` | `KEEP_ACTIVE` |
| 4 | `ACTIVE` and `expiresAt ≤ now < cleanupEligibleAt` | `KEEP_GRACE_PERIOD` |
| 5 | `ACTIVE` and `now ≥ cleanupEligibleAt` | `CLEANUP_ELIGIBLE_STALE_ACTIVE` |
| 6 | `CONSUMED` and `now < cleanupEligibleAt` | `KEEP_CONSUMED` |
| 7 | `CONSUMED` and `now ≥ cleanupEligibleAt` | `CLEANUP_ELIGIBLE_CONSUMED` |
| 8 | `EXPIRED` or `CLEANUP_ELIGIBLE` and `now ≥ cleanupEligibleAt` | `CLEANUP_ELIGIBLE_EXPIRED` |
| 9 | `PLANNED` and `now ≥ expiresAt` | `CLEANUP_ELIGIBLE_ABANDONED_PLAN` |

**Why ACTIVE locks must never be deleted:**
- `ACTIVE` status means a Firestore transaction is actively using the lock.
- Deleting an `ACTIVE` lock during a transaction violates the idempotency guarantee.
- Rules 3 and 4 (`KEEP_ACTIVE`, `KEEP_GRACE_PERIOD`) ensure this invariant is enforced.
- Only Rule 5 (`CLEANUP_ELIGIBLE_STALE_ACTIVE`) allows deletion — and only after `cleanupEligibleAt` has passed, meaning TTL and grace period have both elapsed.

### Maintenance Audit Event Plan

Every `LockCleanupDryRunPlan` includes a `MaintenanceAuditEventPlan`:
- `executable: false` — plan only
- `aiCanExecute: false` — permanent hard invariant
- `aiCanOwnCleanup: false` — permanent hard invariant
- `cleanupOwner: 'SYSTEM_MAINTENANCE'` — always a human-operated service
- `decision` — the cleanup decision for audit trail
- `note` — human-readable explanation

---

## Lock Cleanup Strategy (Complete Reference)

### Timing

- `expiresAt = createdAt + 300s` (LOCK_TTL_SECONDS)
- `cleanupEligibleAt = expiresAt + 60s` (grace period for TTL processing)

### Cleanup Owner

| Owner | Used by |
|---|---|
| `HUMAN_SERVICE` | The transaction service that acquires and releases locks |
| `SYSTEM_MAINTENANCE` | Scheduled cleanup job and admin runbook |
| `AI` | **Forbidden** — `aiCanOwnLock: false` and `aiCanOwnCleanup: false` enforced structurally |

### Cleanup Schedule (3-level)

| Priority | Trigger | Owner | Audit | AI Allowed |
|---|---|---|---|---|
| 1 | Firestore TTL index on `expiresAt` | Firestore infrastructure | No | **No** |
| 2 | Scheduled job (cron, every 15 min) | System maintenance role | Yes — must log `auditTrailId` | **No** |
| 3 | Manual admin script (ops runbook) | Ops team (human) | Yes — must log `auditTrailId` | **No** |

### Dry-run Preview Requirement

The scheduled maintenance job and admin script **must** run a dry-run preview before live deletion. The preview must:
1. Build `LockCleanupDryRunPlan` for each candidate lock.
2. Print decisions and reasons.
3. Require explicit human confirmation before executing deletions.
4. Log `auditTrailId` for every deletion executed.

---

## Hard Invariants (all permanent)

| Invariant | Value |
|---|---|
| `executable` | `false` |
| `aiCanExecute` | `false` |
| `dryRunOnly` | `true` |
| `aiCanTrigger` | `false` |
| `aiCanOwnLock` | `false` |
| `aiCanOwnCleanup` | `false` |
| Tenant guard position | Always first |
| AI caller block | Not bypassable via Admin SDK / Service Account |

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

---

## Known Limitations

1. `mapSettingsHistorySnapshotToHistoricalHash` receives a caller-supplied snapshot. Phase 4 must read the actual Firestore document inside `runTransaction` before calling this helper.
2. Extended metadata fields (`configBeforeHash`, `configAfterHash`, `diffHash`) are declared on `SettingsHistorySnapshot` but not validated in Phase 3 unless `requireExtendedMetadata` triggers audit trail / approval checks. Full metadata validation will be added in Phase 4.
3. `CleanupDecision = 'CLEANUP_ELIGIBLE_STALE_ACTIVE'` marks an ACTIVE lock as safe to delete only after cleanup grace period. Phase 4 real cleanup must add an additional safety check: confirm the lock token is not present in any active Firestore transaction context before deleting.
4. `MaintenanceAuditEventPlan` is a pure plan — Phase 4 must persist it to a `maintenanceAudit` collection or equivalent before deleting locks.
5. Scheduled maintenance job (cleanup schedule priority 2) remains undocumented in terms of cron syntax and deployment target. Phase 4 will define the Cloud Function or Cloud Scheduler configuration.
