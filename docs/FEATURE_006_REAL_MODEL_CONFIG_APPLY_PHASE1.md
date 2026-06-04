# Feature 006 Phase 1 — Real Model Config Apply Transaction Boundary
# Pure Logic & Validation

---

## Phase 1 Scope

Phase 1 is pure TypeScript logic only — no Firestore read/write, no runTransaction, no real apply or rollback. It establishes the complete validated gate contract that Phase 2 will enforce before entering a real Firestore transaction.

---

## Changed Files

### New Types

- `catering-system/src/types/modelConfigRealApply.ts`
  - `IDEMPOTENCY_LOCK_COLLECTION = 'modelConfigIdempotencyLocks'`
  - `LOCK_TTL_SECONDS = 300`
  - `LockStatus` — `'PLANNED' | 'ACTIVE' | 'RELEASED' | 'EXPIRED'`
  - `LockCleanupResponsibility` — `'TRANSACTION_COMMIT_RELEASES' | 'TTL_EXPIRES' | 'MANUAL_ADMIN_RELEASE'`
  - `IdempotencyLockDocument` — Firestore lock doc schema (plan-only in Phase 1)
  - `LockAcquisitionPlan` — `planOnly: true, executable: false`
  - `HistoricalConfigHashVerification` — verifies rollback target config content hash
  - `RealApplyTransactionContract` — `executable: false, aiCanExecute: false, requiresHumanApproval: true`
  - `RealRollbackTransactionContract` — same hard invariants as apply contract
  - `RealApplyContractResult`, `RealRollbackContractResult`, `LockSchemaValidationResult`

### New Services

- `catering-system/src/services/modelConfigRealApplyContractService.ts`
  - `validateRealApplyTransactionContract(input)` — 11-step validation, tenant guard first
  - `validateRealRollbackTransactionContract(input)` — 11-step validation, includes historicalConfigHash
  - `verifyHistoricalConfigHash(input)` — pure hash comparison for rollback target integrity

- `catering-system/src/services/modelConfigIdempotencyLockSchemaService.ts`
  - `buildApplyLockSchema(input)` — lock doc schema for apply transaction
  - `buildRollbackLockSchema(input)` — lock doc schema with rollbackTargetVersion + rollbackReasonHash
  - `validateLockSchema(doc)` — structural schema validation
  - `buildLockAcquisitionPlan(doc)` — plan-only acquisition wrapper
  - `getLockCleanupResponsibilityChain()` — authoritative 3-level cleanup policy
  - `getLockDocumentPath(tenantId, token)` — document path utility

### Modified Files

- `catering-system/src/types/aiBoundary.ts`
  - Added 17 `REAL_APPLY_*` BlockedReason members
  - Added 12 `REAL_ROLLBACK_*` BlockedReason members
  - Added 8 `LOCK_SCHEMA_*` BlockedReason members

---

## New Tests

| Test File | Assertions |
|---|---|
| `modelConfigRealApplyContractService.test.ts` | 39 |
| `modelConfigIdempotencyLockSchemaService.test.ts` | 36 |
| **Phase 1 new total** | **75** |
| **Cumulative (all Feature 005 + 006 Phase 1)** | **357** |

---

## Validation Order

### Apply Contract (tenant guard always first)
1. Tenant hard guard → `REAL_APPLY_TENANT_MISMATCH` (early exit)
2. AI caller hard block → `REAL_APPLY_AI_CALLER_BLOCKED`
3. Approval status → `REAL_APPLY_APPROVAL_NOT_APPROVED` / `REAL_APPLY_APPROVAL_EXPIRED`
4. Human approver present → `REAL_APPLY_MISSING_HUMAN_APPROVER`
5. Approval reason present → `REAL_APPLY_MISSING_APPROVAL_REASON`
6. Audit trail present → `REAL_APPLY_MISSING_AUDIT_TRAIL`
7. Apply token present → `REAL_APPLY_MISSING_APPLY_TOKEN`
8. Config hashes present → `REAL_APPLY_CONFIG_BEFORE_HASH_MISMATCH`, `REAL_APPLY_DIFF_HASH_MISMATCH`
9. Expected version match (race-condition guard) → `REAL_APPLY_EXPECTED_VERSION_MISMATCH`
10. Source recommendation present → `REAL_APPLY_SOURCE_REC_MISMATCH`
11. (all pass) → build lock acquisition plan + return contract

### Rollback Contract (tenant guard always first)
1. Tenant hard guard → `REAL_ROLLBACK_TENANT_MISMATCH` (early exit)
2. AI caller hard block → `REAL_ROLLBACK_AI_CALLER_BLOCKED`
3. Approval status → `REAL_ROLLBACK_APPROVAL_NOT_APPROVED` / `REAL_ROLLBACK_APPROVAL_EXPIRED`
4. Human approver present → `REAL_ROLLBACK_MISSING_HUMAN_APPROVER`
5. Audit trail present → `REAL_ROLLBACK_MISSING_AUDIT_TRAIL`
6. Rollback token present → `REAL_ROLLBACK_MISSING_ROLLBACK_TOKEN`
7. Rollback reason present → `REAL_ROLLBACK_MISSING_ROLLBACK_REASON`
8. Rollback reason hash derived (Phase 2: cross-check vs. stored)
9. Same-version guard → `REAL_ROLLBACK_SAME_VERSION`
10. Historical config hash verification → `REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH`
11. Expected version match → `REAL_APPLY_EXPECTED_VERSION_MISMATCH`
12. (all pass) → derive rollbackReasonHash, build lock acquisition plan + return contract

---

## Lock Schema Design

### Document ID
`{tenantId}:{token}` — unique per tenant + token combination.

### Collection
`modelConfigIdempotencyLocks`

### TTL
300 seconds (5 minutes). Firestore TTL policy is best-effort (~hours in production).

### Lock Cleanup Responsibility (3-level chain)

| Priority | Responsibility | Condition |
|---|---|---|
| 1 | `TRANSACTION_COMMIT_RELEASES` | Transaction commits successfully — deletes lock atomically |
| 2 | `TTL_EXPIRES` | Transaction never commits (crash/timeout) — Firestore TTL expires after 300s |
| 3 | `MANUAL_ADMIN_RELEASE` | Lock stuck beyond TTL — ops team deletes via Admin SDK with auditTrailId logging |

### Apply Lock Fields
- `lockId`, `token`, `tenantId`, `auditTrailId`, `approvalId`
- `expectedCurrentVersion`, `newVersion`
- `status: 'PLANNED'`
- `cleanupResponsibility: 'TRANSACTION_COMMIT_RELEASES'`
- `ttlSeconds: 300`, `createdAt`, `expiresAt`
- `createdByHumanUserId`

### Rollback Lock Additional Fields
- `rollbackTargetVersion`
- `rollbackReasonHash`

---

## Historical Config Hash Verification

`verifyHistoricalConfigHash()` compares the expected hash (from the rollback approval) against the actual hash (which Phase 2 will derive by reading `settingsHistory/{tenantId}/versions/{version}` from Firestore).

Phase 1: pure hash comparison — caller supplies both hashes.
Phase 2: caller will read the actual hash from Firestore before calling.

---

## Hard Invariants (all permanent)

| Invariant | Value |
|---|---|
| `executable` | `false` |
| `aiCanExecute` | `false` |
| `requiresHumanApproval` | `true` |
| `planOnly` (lock acquisition) | `true` |
| Tenant guard position | Always first |
| AI caller block | Not bypassable via Admin SDK / Service Account / Netlify Function |

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

---

## Known Limitations

1. `PersistedHumanModelConfigRollbackApproval` does not yet carry a stored `rollbackReasonHash` field. Phase 2 must add this field and wire Phase 1 cross-check logic.
2. `verifyHistoricalConfigHash` in Phase 1 accepts both hashes from the caller. Phase 2 must derive `actualHash` by reading the Firestore settingsHistory document inside the transaction.
3. Lock schema uses `status: 'PLANNED'` throughout Phase 1. Phase 2 must implement `'ACTIVE'` → `'RELEASED'` transitions inside the transaction.
4. `REAL_APPLY_IDEMPOTENCY_LOCK_EXISTS` and `REAL_ROLLBACK_IDEMPOTENCY_LOCK_EXISTS` BlockedReasons are defined but not yet triggered by any Phase 1 service. Phase 2 will trigger them when reading an existing lock from Firestore.
5. Audit events (`MODEL_CONFIG_APPLY_STARTED`, `MODEL_CONFIG_APPLIED`, etc.) are defined in the Feature 006 event type extension plan but not yet added to `ModelConfigExecutionAuditEventType`. Phase 2 will extend the event type union.
