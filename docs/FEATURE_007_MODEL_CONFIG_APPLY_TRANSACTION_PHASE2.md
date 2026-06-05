# Feature 007 Phase 2 — Guard / Hash Consistency Hardening
# Real Apply Contract Integration

---

## Phase 2 Scope

Phase 2 resolves the two Grok medium risks from Phase 1:

1. **Default-deny guard edge-case hardening** — spoofed token claims, malformed context, `sign_in_provider` validation, `contextValidated` flag, comprehensive regression coverage.
2. **Canonicalization → pseudo-plan hash consistency** — `currentConfigObject` canonical hash must equal `configBeforeHash`; all three hash fields (`configBeforeHash`, `configAfterHash`, `diffHash`) must be present; audit payload hash fields must match plan exactly.

No Firestore read/write. No `runTransaction`. No real apply or rollback.

---

## Changed Files

### Modified Types

- `catering-system/src/types/aiBoundary.ts`
  - Added 14 new `BlockedReason` values for Phase 2 guard and hash continuity

- `catering-system/src/types/realModelConfigApplyExecution.ts`
  - Extended `RealModelConfigApplyCallerContext` with:
    - `signInProvider?: string | null`
    - `tokenClaims?: Record<string, unknown> | null`
    - `contextValidated?: boolean`

### Modified Services

- `catering-system/src/services/realModelConfigApplyGuardService.ts` (Phase 1 → Phase 2)
  - Added `detectSpoofedTokenClaims` — validates uid match, required fields, iat/exp ordering
  - Added `validateSignInProvider` — checks against known human provider list (when `tokenClaims` supplied)
  - Added `VALID_HUMAN_SIGN_IN_PROVIDERS` set: `password`, `google.com`, `microsoft.com`, `github.com`, `facebook.com`, `apple.com`, `twitter.com`, `custom`
  - Guard now checks `contextValidated === false` → `REAL_EXEC_CALLER_CONTEXT_MALFORMED`
  - Total: 15-step default-deny guard (was 12-step in Phase 1)

- `catering-system/src/services/realModelConfigTransactionPseudoPlanService.ts` (Phase 1 → Phase 2)
  - Return type changed from `RealModelConfigApplyPseudoPlan` to `BuildPseudoPlanResult`
  - Added `validateHashContinuity` — checks all three hash fields present + canonical hash consistency
  - Added `validateAuditHashContinuity` — validates audit payload hash fields match plan
  - Plan returns `{ plan, blocked, blockedReasons }` — blocked if any hash check fails

- `catering-system/scripts/check-feature007-forbidden-patterns.js` (Phase 1 → Phase 2)
  - Added 4 more forbidden patterns: direct settings write, direct settingsHistory write, Netlify Function import, Cloud Function import
  - Total: 7 forbidden patterns (was 3 in Phase 1)

### Updated Tests

| Test File | Phase 1 | Phase 2 | Total |
|---|---|---|---|
| `realModelConfigApplyGuardService.test.ts` | 21 | +16 | **37** |
| `realModelConfigCanonicalizationService.test.ts` | 23 | 0 | 23 |
| `realModelConfigIdempotencySchemaService.test.ts` | 30 | 0 | 30 |
| `realModelConfigTransactionPseudoPlanService.test.ts` | 36 | +24 | **60** |
| `realModelConfigExecutionAuditService.test.ts` | 29 | 0 | 29 |
| **Total** | **139** | **+40** | **179** |
| **Cumulative (all features)** | | | **688** |

---

## Default-Deny Guard (Phase 2 Hardening)

### Spoofed Token Claims Detection

When `tokenClaims` is supplied on the caller context, the guard validates:

| Check | Blocked Reason |
|---|---|
| Missing `uid` / `iss` / `aud` / `iat` / `exp` fields | `REAL_EXEC_TOKEN_CLAIMS_SPOOFED` |
| `uid` does not match `callerUserId` | `REAL_EXEC_TOKEN_CLAIMS_SPOOFED` |
| `iat` or `exp` is not a number | `REAL_EXEC_TOKEN_CLAIMS_SPOOFED` |
| `exp <= iat` (invalid token lifetime) | `REAL_EXEC_TOKEN_CLAIMS_SPOOFED` |

### sign_in_provider Validation

When `tokenClaims` is supplied, `signInProvider` must be a known human auth provider:

| Provider | Allowed |
|---|---|
| `password` | ✅ |
| `google.com` | ✅ |
| `microsoft.com` | ✅ |
| `github.com` | ✅ |
| `facebook.com` | ✅ |
| `apple.com` | ✅ |
| `twitter.com` | ✅ |
| `custom` | ✅ |
| `service_account` | ❌ `REAL_EXEC_SIGN_IN_PROVIDER_INVALID` |
| empty / null | ❌ `REAL_EXEC_SIGN_IN_PROVIDER_MISSING` |

If `tokenClaims` is not supplied (non-enriched context), `signInProvider` check is advisory only — not blocked.

### contextValidated Flag

`contextValidated === false` → `REAL_EXEC_CALLER_CONTEXT_MALFORMED`

This flag allows middleware / auth adapters to signal that the context could not be fully validated (e.g., token verification failed upstream, claims could not be parsed). The guard treats this as a hard block.

---

## Canonicalization → Pseudo-plan Hash Consistency (Phase 2)

### Hash Field Presence (all three required)

| Hash Field | Missing Reason |
|---|---|
| `configBeforeHash` | `REAL_EXEC_CONFIG_BEFORE_HASH_MISSING` |
| `configAfterHash` | `REAL_EXEC_CONFIG_AFTER_HASH_MISSING` |
| `diffHash` | `REAL_EXEC_DIFF_HASH_MISSING` |

### currentConfigObject Canonical Hash Match

If `currentConfigObject` is supplied to `buildRealModelConfigApplyTransactionPseudoPlan`:
- Canonicalized using `validateCanonicalModelConfigHashInput`
- Canonical hash must equal `configBeforeHash`
- Mismatch → `REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH`
- Invalid input (BigInt, NaN, circular, etc.) → canonicalization blocked reason propagated

### Audit Hash Continuity (`validateAuditHashContinuity`)

Cross-validates that audit event payload hash fields match the pseudo-plan:

| Field | Mismatch Reason |
|---|---|
| `configBeforeHash` | `REAL_EXEC_HASH_CONTINUITY_BROKEN` |
| `configAfterHash` | `REAL_EXEC_AUDIT_HASH_MISMATCH` |
| `diffHash` | `REAL_EXEC_AUDIT_HASH_MISMATCH` |
| `applyToken` | `REAL_EXEC_AUDIT_TOKEN_MISMATCH` |
| `auditTrailId` | `REAL_EXEC_AUDIT_TRAIL_ID_MISMATCH` |
| `approvalId` | `REAL_EXEC_AUDIT_APPROVAL_ID_MISMATCH` |
| `sourceRecommendationId` | `REAL_EXEC_AUDIT_SOURCE_REC_MISMATCH` |

---

## Static Guard (Phase 2 — 7 Patterns)

| Pattern | Status |
|---|---|
| `firebase-admin` import | ✅ BLOCKED |
| `@google-cloud/firestore` import | ✅ BLOCKED |
| `.runTransaction(` call | ✅ BLOCKED |
| `settings.set/update/add/delete(` | ✅ BLOCKED |
| `settingsHistory.set/update/add/delete(` | ✅ BLOCKED |
| `@netlify/functions` import | ✅ BLOCKED |
| `firebase-functions` import | ✅ BLOCKED |

Current scan result: **✅ PASS — 0 violations**

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
- No UI added
- No Netlify Function added
- No Cloud Function added

---

## Phase 3 Forward Items

1. Caller reads persisted approval from Firestore inside `runTransaction` — currently structural only.
2. Settings current version and config hash read must occur inside `runTransaction`.
3. `currentConfigObject` must be read from Firestore inside `runTransaction` before passing to `validateHashContinuity`.
4. Idempotency lock write must occur inside `runTransaction`.
5. `settingsHistory` write and `settings` update must be atomic inside `runTransaction`.
6. Audit event write must occur inside `runTransaction` or committed audit trail append.
7. Phase 3 must define the `runTransaction` executor service that orchestrates all Phase 1–2 validators.
