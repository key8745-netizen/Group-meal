# Feature 008 Phase 2 — Token Boundary Hardening + Write-set Hash Consistency Integration

---

## Phase 2 Scope

Phase 2 hardens the two medium-risk gaps identified in Grok's Phase 1 review:

1. **Token verification source production boundary** — upstream verification flag, service account / Admin SDK forgery detection, token subject / callerUserId consistency
2. **Write-set contract hash consistency** — canonical hash propagates from approval through settingsHistoryWrite, auditEventWrite, and settingsWrite; currentConfigObject hash verified when supplied

No Firestore reads or writes. No `runTransaction`. No real apply.

---

## New Files

### New Service

- `catering-system/src/services/realApplyWriteSetHashConsistencyService.ts`
  - `validateWriteSetHashConsistency` — validates hash field propagation from approval snapshot through all four write contracts

---

## Modified Files

### Types

- `catering-system/src/types/aiBoundary.ts`
  - Added 13 new `BlockedReason` values for Phase 2:
    - `F008_CALLER_UPSTREAM_VERIFICATION_MISSING`
    - `F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN`
    - `F008_CALLER_ADMIN_SDK_FORGED_HUMAN`
    - `F008_CALLER_TOKEN_SUBJECT_MISMATCH`
    - `F008_CALLER_USERID_APPROVAL_MISMATCH`
    - `F008_APPROVAL_AUDIT_TRAIL_MISMATCH`
    - `F008_APPROVAL_APPLY_TOKEN_MISMATCH`
    - `F008_APPROVAL_VERSION_MISMATCH`
    - `F008_APPROVAL_HASH_MISMATCH`
    - `F008_WRITE_SET_CURRENT_CONFIG_HASH_MISSING`
    - `F008_WRITE_SET_HISTORY_HASH_MISMATCH`
    - `F008_WRITE_SET_AUDIT_HASH_MISMATCH`
    - `F008_WRITE_SET_HASH_FIELDS_INCONSISTENT`

- `catering-system/src/types/realApplyTransactionExecution.ts`
  - Added three optional fields to `VerifiedCallerContextSnapshot`:
    - `tokenSubject?: string` — Firebase uid from token; must match `callerUserId` when present
    - `isServiceAccount?: boolean` — blocks HUMAN callerType claim
    - `upstreamVerificationConfirmed?: boolean` — must not be `false` when source is trusted

### Services

- `catering-system/src/services/realApplyCallerContextValidatorService.ts`
  - Added `SERVICE_ACCOUNT_PROVIDERS` set
  - Added three Phase 2 checks:
    1. `upstreamVerificationConfirmed === false` → `F008_CALLER_UPSTREAM_VERIFICATION_MISSING`
    2. `isServiceAccount === true` + `callerType === HUMAN` → `F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN`; if `signInProvider` is in `SERVICE_ACCOUNT_PROVIDERS` → also `F008_CALLER_ADMIN_SDK_FORGED_HUMAN`
    3. `tokenSubject !== callerUserId` (when `tokenSubject` present) → `F008_CALLER_TOKEN_SUBJECT_MISMATCH`

- `catering-system/src/services/realApplyApprovalValidatorService.ts`
  - Added four Phase 2 field-match checks:
    1. `auditTrailId` must match → `F008_APPROVAL_AUDIT_TRAIL_MISMATCH`
    2. `applyToken` must match → `F008_APPROVAL_APPLY_TOKEN_MISMATCH`
    3. `expectedCurrentVersion` and `newVersion` must match → `F008_APPROVAL_VERSION_MISMATCH`
    4. `configBeforeHash`, `configAfterHash`, `diffHash` must all match → `F008_APPROVAL_HASH_MISMATCH`

### New Tests

- `catering-system/src/services/__tests__/realApplyPhase2.test.ts` — **49 assertions**

---

## Test Coverage

| Test Section | Assertions |
|---|---|
| Approval hardening | 11 |
| Token boundary hardening | 17 |
| Write-set hash consistency | 13 |
| Nested config hash regression | 5 |
| Boundary confirmations | 3 |
| **Phase 2 total** | **49** |

---

## Key Design Decisions (Phase 2)

### upstreamVerificationConfirmed is optional (backward compat)

When `upstreamVerificationConfirmed` is `undefined`, the check does not fire. This preserves Phase 1 test compatibility — Phase 1 tests did not supply this field. Phase 3+ integration callers must set it explicitly.

### isServiceAccount + SERVICE_ACCOUNT_PROVIDERS double-block

If `isServiceAccount=true` AND `signInProvider` is in the service account provider set, both `F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN` and `F008_CALLER_ADMIN_SDK_FORGED_HUMAN` are emitted. This dual-reason pattern mirrors Feature 007 Phase 3 forged context detection.

### Hash consistency validator is separate from write-set builder

`validateWriteSetHashConsistency` takes a completed `TransactionWriteSetContract` and verifies it against the approval's hash fields. This allows Phase 2 and Phase 3+ to call it as a post-build consistency gate, independent of the write-set builder.

### Nested config regression confirms key-sort stability

Phase 2 tests verify that reordered-key nested configs produce identical canonical hashes — confirming the canonicalization service is stable under deep nesting with mixed types.

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
| `realApplyPhase2.test.ts` | 49 | ✅ PASS |
| **Feature 008 Phase 1+2 total** | **108** | ✅ PASS |
| **Cumulative all features** | **903** | ✅ ALL PASS |

---

## Phase 3 Forward Items

1. Real Firebase Admin SDK token verification in middleware — replace `upstreamVerificationConfirmed` contract field with actual Admin SDK call.
2. `runTransaction` executor service orchestrating Phase 1 + Phase 2 validators in order.
3. Real Firestore read of approval record inside `runTransaction`.
4. Real Firestore read of `settings/{tenantId}` current config inside `runTransaction`.
5. Idempotency lock check-and-write inside `runTransaction`.
6. `settingsHistory` immutable append inside `runTransaction`.
7. `settings` current version update inside `runTransaction`.
8. Audit event write inside `runTransaction` or committed audit append.
