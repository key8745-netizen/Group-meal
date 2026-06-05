# Feature 007 Phase 3 — Advanced Guard Hardening + Full-chain Hash Propagation

---

## Phase 3 Scope

Phase 3 resolves the two Grok medium risks from Phase 2:

1. **Advanced spoofed / forged context** — partial valid token claims with malicious injected claims, forged `sign_in_provider`, provider/callerType mismatch, Service Account / Admin SDK forged human context, token claims tenantId mismatch, untrusted role/admin claims.
2. **Full-chain hash propagation** — approval → canonicalization → transactionPseudoPlan → auditEventPlan: all five hash/token fields (`configBeforeHash`, `configAfterHash`, `diffHash`, `applyToken`, `auditTrailId`) must be consistent end-to-end. Any mismatch → BLOCKED.

No Firestore read/write. No `runTransaction`. No real apply or rollback.

---

## Changed Files

### Modified Types

- `catering-system/src/types/aiBoundary.ts`
  - Added 15 new `BlockedReason` values for Phase 3 (7 guard + 8 chain hash)

### Modified Services

- `catering-system/src/services/realModelConfigApplyGuardService.ts` (Phase 2 → Phase 3)
  - Added `detectAdvancedForgedContext` — 6 additional forging / mismatch checks
  - Added `SERVICE_ACCOUNT_PROVIDERS` set for machine identity detection
  - Guard now wires Phase 3 checks as step 5b (before callerType check)

- `catering-system/src/services/realModelConfigApplyChainHashService.ts` (NEW)
  - `validateFullChainHashPropagation` — validates all 10 field pairs across approval → plan → auditEvent
  - `validateApprovalToPlanHash` — segment helper
  - `validatePlanToAuditEventHash` — segment helper
  - `ApprovalHashSnapshot`, `PlanHashSnapshot`, `AuditEventHashSnapshot` interfaces
  - `FullChainHashInput`, `FullChainHashResult` interfaces

### Updated Tests

| Test File | Phase 2 | Phase 3 | Total |
|---|---|---|---|
| `realModelConfigApplyGuardService.test.ts` | 37 | +20 | **57** |
| `realModelConfigCanonicalizationService.test.ts` | 23 | +22 | **45** |
| `realModelConfigIdempotencySchemaService.test.ts` | 30 | 0 | 30 |
| `realModelConfigTransactionPseudoPlanService.test.ts` | 60 | 0 | 60 |
| `realModelConfigExecutionAuditService.test.ts` | 29 | 0 | 29 |
| `realModelConfigApplyChainHashService.test.ts` | NEW | +23 | **23** |
| **Total** | **179** | **+65** | **244** |
| **Cumulative (all features)** | | | **753** |

---

## Advanced Guard Hardening (Phase 3)

### detectAdvancedForgedContext checks

| Check | Blocked Reason |
|---|---|
| `isServiceAccount=true` + `callerType=HUMAN` + `signInProvider=service_account` | `REAL_EXEC_SERVICE_ACCOUNT_FORGED_HUMAN_CONTEXT` |
| `isAdminSdk=true` + `callerType=HUMAN` + `signInProvider=service_account` | `REAL_EXEC_ADMIN_SDK_FORGED_HUMAN_CONTEXT` |
| `callerType=HUMAN` + `signInProvider=service_account` | `REAL_EXEC_CALLER_TYPE_PROVIDER_MISMATCH` |
| `tokenClaims.tenantId` present but ≠ `request.tenantId` | `REAL_EXEC_TOKEN_TENANT_MISMATCH` |
| `role/admin/superuser/isAdmin` claim without `contextValidated=true` | `REAL_EXEC_ROLE_CLAIM_UNTRUSTED` |
| Human provider + uid looks like service account (`*.gserviceaccount.com`) | `REAL_EXEC_PROVIDER_USER_MISMATCH` |
| Malicious injected claims (`override/bypass/elevate/forceAllow/sudo/root` = true) | `REAL_EXEC_TOKEN_CLAIMS_SPOOFED` |

### contextValidated interaction

- `contextValidated === true` is required for role/admin claims to be accepted
- `contextValidated === false` → `REAL_EXEC_CALLER_CONTEXT_MALFORMED` (Phase 2 hard block)
- Without `contextValidated`, role claims are treated as untrusted injection

---

## Full-chain Hash Propagation (Phase 3)

### Chain segments validated

```
approval → plan (5 fields each)
plan → auditEvent (5 fields each)
```

### Field pairs checked (approval → plan)

| Field | Mismatch Reason |
|---|---|
| `configBeforeHash` | `REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH` |
| `configAfterHash` | `REAL_EXEC_APPROVAL_AFTER_HASH_MISMATCH` |
| `diffHash` | `REAL_EXEC_APPROVAL_DIFF_HASH_MISMATCH` |
| `applyToken` | `REAL_EXEC_APPROVAL_APPLY_TOKEN_MISMATCH` |
| `auditTrailId` | `REAL_EXEC_APPROVAL_AUDIT_TRAIL_MISMATCH` |

### Field pairs checked (plan → auditEvent)

| Field | Mismatch Reason |
|---|---|
| `configBeforeHash` | `REAL_EXEC_CHAIN_AUDIT_BEFORE_HASH_MISMATCH` |
| `configAfterHash` | `REAL_EXEC_CHAIN_AUDIT_AFTER_HASH_MISMATCH` |
| `diffHash` | `REAL_EXEC_CHAIN_AUDIT_DIFF_HASH_MISMATCH` |
| `applyToken` | `REAL_EXEC_CHAIN_AUDIT_APPLY_TOKEN_MISMATCH` |
| `auditTrailId` | `REAL_EXEC_CHAIN_AUDIT_TRAIL_MISMATCH` |

---

## Complex Nested Config Regression (Phase 3)

New canonicalization regression tests cover:

| Case | Result |
|---|---|
| Deeply nested object (5 levels) | Deterministic hash |
| Nested arrays (order preserved) | Deterministic hash |
| Different array order | Different hash |
| Different key order | Same hash (keys sorted) |
| null values | Preserved, deterministic |
| null vs omitted key | Different hash |
| boolean / number / string | Deterministic |
| false vs true | Different hash |
| Unicode / CJK (中文, emoji) | Deterministic |
| Special characters (`\n\t\r`) | Deterministic |
| BigInt in nested object | `REAL_EXEC_CANONICAL_BIGINT_BLOCKED` |
| NaN in array | `REAL_EXEC_CANONICAL_NAN_BLOCKED` |
| Infinity in deep object | `REAL_EXEC_CANONICAL_INFINITY_BLOCKED` |
| Complex mixed config (reordered) | Same hash |

---

## Static Guard (Phase 3 — 7 Patterns, unchanged)

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

## Phase 4 Forward Items

1. Caller reads persisted approval from Firestore inside `runTransaction`.
2. Settings current version and config hash read inside `runTransaction`.
3. `currentConfigObject` read from Firestore inside `runTransaction`.
4. Idempotency lock write inside `runTransaction`.
5. `settingsHistory` write and `settings` update atomic inside `runTransaction`.
6. Audit event write inside `runTransaction` or committed audit trail append.
7. Phase 4 defines `runTransaction` executor service orchestrating Phase 1–3 validators.
