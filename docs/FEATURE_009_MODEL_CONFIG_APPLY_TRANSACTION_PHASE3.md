# Feature 009 Phase 3: Transaction Read-Set Order + Concurrent Modification + Abort Integration

## Phase 3 Scope

Phase 3 addresses two medium risks identified in the Grok Phase 2 review (96/100):

1. **Real Firebase Admin SDK and middleware injection end-to-end alignment** — covered by reusing Phase 2 Firebase verification service in integration tests and extending the abort contract service with approval-invalid and hash-mismatch handlers.
2. **Read-set snapshot and future real `runTransaction` read alignment (transaction read order)** — covered by a new `TransactionReadOrderContract` that statically encodes the required read order (approval → settings → idempotencyLock) and validates that all three reads succeeded before a write-set may be built.

## New Files

| File | Purpose |
|---|---|
| `catering-system/src/services/realModelConfigApplyTransactionReadOrderService.ts` | Builds `TransactionReadOrderContract` with correct Firestore paths, rationale, and read order. `validateTransactionReadOrder()` checks all three read steps and adds step-specific blocked reasons. |
| `catering-system/src/services/realModelConfigApplyConcurrentModificationService.ts` | `detectVersionConflict()`, `detectHashMismatch()`, `detectConcurrentModification()`, and `evaluateDuplicateApply()` — pure concurrent modification and duplicate apply detection. |
| `catering-system/src/services/__tests__/realModelConfigApplyPhase3.test.ts` | Pure tsx test runner, 109 assertions, 0 failures. |
| `docs/FEATURE_009_MODEL_CONFIG_APPLY_TRANSACTION_PHASE3.md` | This file. |

## Modified Files

| File | Change |
|---|---|
| `catering-system/src/types/aiBoundary.ts` | Added 8 new `BlockedReason` values for Phase 3 (read-set order, concurrent modification, duplicate apply). |
| `catering-system/src/services/realModelConfigApplyAbortContractService.ts` | Added `buildAbortContractAfterApprovalInvalid()` and `buildAbortContractAfterHashMismatch()`. |
| `scripts/check-feature009-forbidden-patterns.js` | Added two Phase 3 service files to `SCAN_GLOBS`. |
| `docs/CURRENT_SSOT.md` | Updated to Phase 3 COMPLETE. |

## Test Coverage

| Section | Description | Assertions |
|---|---|---|
| 1. Firebase / Middleware Verification Integration | Valid context, missing uid/tenantId, CLIENT_SUPPLIED, unverified, service account, uid/tenantId/provider mismatches | 13 |
| 2. Transaction Read-Set Order | Contract shape, paths, executable/aiCanExecute flags, validation all-valid, each step invalid, multiple invalid | 35 |
| 3. Read-Set Consistency | Approval snapshot (valid, missing, not approved, tenant/approvedBy/expired), settings (valid, tenant/version/hash), lock (null, idempotent replay, payload mismatch, approvalId conflict, consumed, pending, abandoned) | 22 |
| 4. Concurrent Modification | detectVersionConflict (same/changed), detectHashMismatch (same/changed), detectConcurrentModification (both same/both changed), evaluateDuplicateApply (ALLOW_NEW, IDEMPOTENT_REPLAY, BLOCKED consumed, BLOCKED pending) | 22 |
| 5. Abort Handler + Read-Set Failure | Approval invalid abort, version conflict abort, hash mismatch abort, pending lock abort, no settingsWrite/historyWrite, audit payload | 16 |
| 6. Static Guard / CI | Boolean assertions for guard coverage, transaction contract executable=false | 5 |
| 7. Boundary | AI caller blocked, no firebase-admin import, read order contract flags, abort contract flags | 7 |
| **Total** | | **109** |

## Key Design Decisions

### Read Order Rationale

The required read order is: **approval → settings → idempotencyLock**.

- **Approval first**: carries `configBeforeHash` and `expectedCurrentVersion` that subsequent reads depend on.
- **Settings second**: `currentConfigHash` must be compared against `approval.configBeforeHash`; version must be read before the lock decision can reference it.
- **Lock last**: the duplicate-apply decision depends on both the `applyToken` (from approval) and the `expectedCurrentVersion` (from settings).

### Concurrent Modification Detection

Two independent checks run in sequence (all failures collected):
- **Version conflict**: `settings.currentVersion !== request.expectedCurrentVersion` → `F009_CONCURRENT_MODIFICATION_VERSION`
- **Hash mismatch**: `settings.currentConfigHash !== approval.configBeforeHash` → `F009_CONCURRENT_MODIFICATION_HASH`

Both checks must pass before a write-set may be built.

### Duplicate Apply Modeling

`evaluateDuplicateApply()` maps `LockCheckResult` to `DuplicateApplyOutcome`:
- `ALLOW_NEW` → proceed normally
- `IDEMPOTENT_REPLAY` → return previous result without new writes
- `BLOCKED (CONSUMED lock)` → `F009_DUPLICATE_APPLY_CONSUMED`
- `BLOCKED (PENDING conflict)` → `F009_DUPLICATE_APPLY_PENDING`

## Boundary Confirmation

| Boundary | Status |
|---|---|
| No `firebase-admin` import in any Phase 3 service | Confirmed |
| No `@google-cloud/firestore` import | Confirmed |
| No `runTransaction(` calls | Confirmed |
| No direct `settings/` document write | Confirmed |
| No direct `settingsHistory/` document write | Confirmed |
| All transaction contracts: `executable: false` | Confirmed |
| All transaction contracts: `aiCanExecute: false` | Confirmed |
| All abort contracts: `executable: false` | Confirmed |
| All abort contracts: `aiCanExecute: false` | Confirmed |
| No `settingsWrite` field in abort contracts | Confirmed |
| No `historyWrite` field in abort contracts | Confirmed |
| AI caller rejected by `validateRealApplyCallerContext` | Confirmed |
| Static guard covers all 11 Phase 1+2+3 service files | Confirmed (0 violations) |

## Known Limitations (Phase 4+ Forward Items)

1. **Real Firestore integration**: All reads are simulated via plain TypeScript objects. Phase 4 must wire real `runTransaction` reads from Firestore using firebase-admin (in a server-side environment only).
2. **Lock write timing**: The idempotency lock is modeled as a read-set snapshot; the actual PENDING write (before the main transaction) is not yet implemented.
3. **Approval consumption**: `approval.status` update to `CONSUMED` is part of the write-set but not yet executed.
4. **Settings history write**: `settingsHistory/{tenantId}/versions/{newVersion}` write-set is defined but not executed.
5. **Rollback integration**: Phase 3 focuses on the apply path; rollback read-order and concurrent-modification contracts are deferred to Phase 4.
