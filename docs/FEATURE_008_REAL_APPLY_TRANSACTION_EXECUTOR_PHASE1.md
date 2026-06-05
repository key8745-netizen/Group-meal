# Feature 008 Phase 1 — Pure Logic & Validation

---

## Phase 1 Scope

Phase 1 builds the pure-logic contract layer for the real model config apply transaction executor. No Firestore reads or writes. No `runTransaction`. No real apply.

Three new services + one new type file establish the validation and contract-building foundations required before Phase 2 can introduce real Firestore operations.

---

## New Files

### New Types

- `catering-system/src/types/realApplyTransactionExecution.ts`
  - `TokenVerificationSource`: `FIREBASE_ADMIN_SDK` | `MIDDLEWARE_SERVER` | `CLIENT_SUPPLIED` | `UNKNOWN`
  - `VerifiedCallerContextSnapshot` — server-verified caller context (not client-supplied)
  - `PersistedApprovalSnapshot` — structural snapshot of a persisted approval record
  - `PersistedApprovalStatus`: `PENDING_REVIEW` | `APPROVED` | `REJECTED` | `EXPIRED` | `CONSUMED`
  - `TransactionWriteSetContract` — four-write structural contract
  - `SettingsWriteContract` — `settings/{tenantId}` update contract
  - `SettingsHistoryWriteContract` — `settingsHistory/{tenantId}/versions/{version}` immutable append contract
  - `IdempotencyLockWriteContract` — `modelConfigIdempotencyLocks/{lockId}` acquire contract
  - `AuditEventWriteContract` — `auditEvents/{auditTrailId}` append contract
  - `ExecutorValidationResult`

### New Services

- `catering-system/src/services/realApplyApprovalValidatorService.ts`
  - `validatePersistedApproval` — validates approval snapshot shape, status, expiry, tenantId, sourceRecommendationId, hash fields, optional caller match

- `catering-system/src/services/realApplyCallerContextValidatorService.ts`
  - `validateVerifiedCallerContext` — validates caller context came from a trusted server-side source
  - Trusted sources: `FIREBASE_ADMIN_SDK`, `MIDDLEWARE_SERVER`
  - `CLIENT_SUPPLIED` / `UNKNOWN` → hard-blocked with `F008_CALLER_VERIFICATION_SOURCE_UNTRUSTED` + `F008_CALLER_TOKEN_NOT_VERIFIED_BY_SERVER`

- `catering-system/src/services/realApplyTransactionWriteSetService.ts`
  - `buildTransactionWriteSet` — validates all prerequisites then builds four-write contract
  - Optional `currentConfigObject` → canonical hash must equal `configBeforeHash`
  - AI caller hard-blocked
  - All returned contracts: `executable: false`, `aiCanExecute: false`, `immutable: true` (history)

### Modified Types

- `catering-system/src/types/aiBoundary.ts`
  - Added 20 new `BlockedReason` values for Feature 008 Phase 1

### New Tests

- `catering-system/src/services/__tests__/realApplyPhase1.test.ts` — **59 assertions**

---

## Test Coverage

| Test Section | Assertions |
|---|---|
| Persisted approval validation | 10 |
| Verified caller context validation | 9 |
| Transaction write-set contract builder | 15 |
| Boundary confirmations | 5 |
| Totals (Phase 1) | **59** |

---

## Key Design Decisions (Phase 1)

### tokenVerificationSource must be server-side

`CLIENT_SUPPLIED` and `UNKNOWN` are always blocked. The guard now explicitly distinguishes:
- Contract-level `tokenVerificationStatus='verified'` (Feature 007) — client-asserted
- Service-level `tokenVerificationSource='FIREBASE_ADMIN_SDK'` (Feature 008) — server-verified

Phase 2+ must populate `tokenVerificationSource` from real Firebase Admin SDK token verification in a server context.

### settingsHistoryWrite.immutable = true

The `SettingsHistoryWriteContract` has `readonly immutable: true`. Phase 2+ must not overwrite existing history documents. The document path is `settingsHistory/{tenantId}/versions/{newVersion}`.

### lockId format

`{tenantId}:{applyToken}` — same as Feature 007 idempotency lock schema. TTL = 300s, cleanup eligible after 360s (300 + 60 grace).

### AI caller hard-blocked in write-set builder

`callerType === 'AI'` → `REAL_EXEC_AI_CALLER_BLOCKED` immediately, no write-set produced.

---

## Firestore Confirmation

- No Firestore read
- No Firestore write
- No `firebase-admin` import
- No `@google-cloud/firestore` import
- No `runTransaction` call
- No `settings` mutation
- No `settingsHistory` write
- No real apply executed
- No UI added
- No Netlify Function added
- No Cloud Function added

---

## Test Suite Summary

| File | Assertions | Status |
|---|---|---|
| Feature 007 (all phases) | 286 | ✅ PASS |
| `realApplyPhase1.test.ts` | 59 | ✅ PASS |
| **Feature 008 Phase 1 total** | **59** | ✅ PASS |
| **Cumulative all features** | **854** | ✅ ALL PASS |

---

## Phase 2 Forward Items

1. Real Firestore read of approval record inside `runTransaction`.
2. Real Firestore read of `settings/{tenantId}` current config inside `runTransaction`.
3. Idempotency lock check-and-write inside `runTransaction`.
4. `settingsHistory` immutable append inside `runTransaction`.
5. `settings` current version update inside `runTransaction`.
6. Audit event write inside `runTransaction` or committed audit append.
7. `runTransaction` executor service that orchestrates all Phase 1 validators in order.
8. Real Firebase Admin SDK token verification in middleware — replace contract-level `tokenVerificationStatus` with `tokenVerificationSource=FIREBASE_ADMIN_SDK`.
