# Feature 008 Phase 4 — Final Production-like Verification Contract + Deep Snapshot Hash Release Gate

---

## Phase 4 Scope

Phase 4 is the final hardening phase before Feature 008 can be considered ready for Phase 5+ (real Firestore transaction execution). It hardens the two remaining medium-risk gaps from Grok's Phase 3 review:

1. **Production-like upstream verification alignment** — three-way consistency between middleware-injected verified context, simulated Firebase Admin token parse result, and request-level caller identity
2. **Simulated real Firestore snapshot hash consistency under deep nested concurrent modification** — source-guarded snapshot type, deep nested config hash regression, concurrent modification simulation with both version and hash signals

No Firestore reads or writes. No `runTransaction`. No real apply.

---

## New Files

### New Service

- `catering-system/src/services/realModelConfigFirebaseTokenAlignmentService.ts`
  - `MiddlewareVerifiedContext` type — middleware-injected verified context
  - `SimulatedFirebaseTokenParseResult` type — simulated Firebase Admin token parse result
  - `validateFirebaseTokenAlignment` — validates three-way consistency: middleware ↔ token ↔ request

---

## Modified Files

### Types

- `catering-system/src/types/aiBoundary.ts`
  - Added 11 new `BlockedReason` values for Phase 4:
    - `F008_TOKEN_UID_MISMATCH`
    - `F008_TOKEN_TENANT_MISMATCH`
    - `F008_TOKEN_PROVIDER_MISSING`
    - `F008_TOKEN_VERIFICATION_MISSING`
    - `F008_TOKEN_VERIFICATION_MALFORMED`
    - `F008_TOKEN_SOURCE_UNTRUSTED`
    - `F008_TOKEN_SERVICE_ACCOUNT_BLOCKED`
    - `F008_MIDDLEWARE_USER_MISMATCH`
    - `F008_MIDDLEWARE_TENANT_MISMATCH`
    - `F008_MIDDLEWARE_PROVIDER_MISMATCH`
    - `F008_SNAPSHOT_SOURCE_MISMATCH`

### Services

- `catering-system/src/services/realModelConfigSettingsSnapshotService.ts`
  - Added `SimulatedRealFirestoreSettingsSnapshot` type (Phase 4: `source: 'SIMULATED_FIRESTORE_SNAPSHOT'` required field)
  - Added `validateSimulatedRealFirestoreSettingsSnapshotForApply` — extends Phase 3 validator with source guard, full audit event hash consistency

### Scripts

- `scripts/check-feature008-forbidden-patterns.js`
  - Added `realModelConfigFirebaseTokenAlignmentService.ts` to scan list

### New Tests

- `catering-system/src/services/__tests__/realApplyPhase4.test.ts` — **67 assertions**

---

## Test Coverage

| Test Section | Assertions |
|---|---|
| Production-like upstream verification alignment | 20 |
| Simulated real Firestore settings snapshot | 13 |
| Deep nested concurrent modification simulation | 15 |
| Write-set hash consistency against simulated real snapshot | 8 |
| Static guard / CI regression | 5 |
| Boundary confirmations | 6 |
| **Phase 4 total** | **67** |

---

## Key Design Decisions (Phase 4)

### Three-way identity consistency

`validateFirebaseTokenAlignment` enforces that all three identity sources agree:
1. `middlewareContext.verifiedUserId` = `tokenParseResult.uid` = `callerUserId`
2. `middlewareContext.verifiedTenantId` = `tokenParseResult.tenantId` = `requestTenantId`
3. `middlewareContext.verifiedSignInProvider` = `tokenParseResult.signInProvider`

Any two-way mismatch emits a distinct blocked reason. This prevents one compromised source from being compensated by another.

### Source guard on `SimulatedRealFirestoreSettingsSnapshot`

The Phase 4 snapshot type requires `source: 'SIMULATED_FIRESTORE_SNAPSHOT'` to be explicitly declared. Mismatched source causes early return with exactly one blocked reason — no version or hash information is leaked to the caller.

### Key-sorted canonical hash is array-order-sensitive

Arrays are NOT reordered during canonicalization — only object keys are sorted. This means `tags: ['alpha', 'beta']` produces a different hash from `tags: ['beta', 'alpha']`. This is intentional and tested explicitly in Phase 4 deep nested regression.

### Service Account detection is dual-signal

Both `isServiceAccount: true` AND matching `signInProvider` (service-account, iam, admin-sdk, custom) independently trigger `F008_TOKEN_SERVICE_ACCOUNT_BLOCKED`. Either alone is sufficient to block.

---

## Dry-run Release Gate Checklist

- [x] No Firestore read/write
- [x] No `firebase-admin` / `@google-cloud/firestore`
- [x] No `runTransaction`
- [x] No UI
- [x] No Netlify Function / Cloud Function
- [x] No real approval records
- [x] No real apply records
- [x] No real rollback records
- [x] No real cleanup jobs
- [x] No real settings mutation
- [x] No real settingsHistory write
- [x] Write-set contract `executable: false`
- [x] `aiCanExecute: false`
- [x] Default-deny guard hardened across all phases
- [x] Upstream verification alignment tested (Phase 4)
- [x] Middleware vs Firebase token parse mismatch tested (Phase 4)
- [x] Service Account / Admin SDK cannot bypass guard
- [x] Simulated real Firestore snapshot validation tested (Phase 4)
- [x] Deep nested concurrent modification tested (Phase 4)
- [x] Write-set hash consistency tested against simulated real snapshot (Phase 4)
- [x] Static guard / CI regression tested (Phases 3–4)
- [x] All 10 test files pass
- [x] TypeScript typecheck passes
- [x] Build passes

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
| `realApplyPhase3.test.ts` | 61 | ✅ PASS |
| `realApplyPhase4.test.ts` | 67 | ✅ PASS |
| **Feature 008 Phase 1–4 total** | **236** | ✅ PASS |
| **Cumulative all features** | **1031** | ✅ ALL PASS |

---

## Phase 5 Forward Items (Real Transaction)

1. Real Firebase Admin SDK `admin.auth().verifyIdToken(token)` in middleware — replaces `SimulatedFirebaseTokenParseResult`.
2. Real Firestore read of `settings/{tenantId}` inside `runTransaction` — replaces `SimulatedRealFirestoreSettingsSnapshot`.
3. Real Firestore read of approval record inside `runTransaction`.
4. Idempotency lock check-and-write inside `runTransaction`.
5. `settingsHistory` immutable append inside `runTransaction`.
6. `settings` current version update inside `runTransaction`.
7. Audit event write inside `runTransaction` or committed audit append.
8. `runTransaction` executor service orchestrating Phase 1–4 validators in order.
