# Feature 007 Phase 4 — Final Guard Robustness + Deep Hash Propagation Release Gate

---

## Phase 4 Scope

Phase 4 resolves the two Grok medium risks from Phase 3:

1. **Cryptographic forgery simulation + multi-claim injection** — `tokenVerificationStatus` contract validation, forged/unverified/missing/malformed token status detection, injected permission/tenant/approval/serviceAccount/provider claims blocked, conflicting claims blocked.
2. **Deep nested hash propagation + concurrent modification simulation** — deep config objects through full chain, key-order and array-order determinism verified end-to-end, concurrent modification detection (`currentConfigHash` vs `approvalConfigBeforeHash` + version mismatch).

No Firestore read/write. No `runTransaction`. No real apply or rollback.

---

## Changed Files

### Modified Types

- `catering-system/src/types/aiBoundary.ts`
  - Added 14 new `BlockedReason` values for Phase 4 (4 forgery + 6 injection + 2 concurrent mod + 2 chain)

- `catering-system/src/types/realModelConfigApplyExecution.ts`
  - Extended `RealModelConfigApplyCallerContext` with `tokenVerificationStatus?: 'verified' | 'unverified' | 'forged' | string`

### Modified Services

- `catering-system/src/services/realModelConfigApplyGuardService.ts` (Phase 3 → Phase 4)
  - Added `detectForgedTokenSignature` — checks `tokenVerificationStatus` when `tokenClaims` supplied
  - Added `detectInjectedClaims` — 6-class injection detector (permissions, tenant override, approval override, SA flag, provider override, conflicting uid/callerType)
  - Guard wires Phase 4 checks as steps 5c and 5d

- `catering-system/src/services/realModelConfigApplyChainHashService.ts` (Phase 3 → Phase 4)
  - Added `detectConcurrentModification` — checks `approvalConfigBeforeHash` vs `currentConfigHash` + version pair
  - Added `ConcurrentModificationCheckInput`, `ConcurrentModificationCheckResult` interfaces

### Updated Tests

| Test File | Phase 3 | Phase 4 | Total |
|---|---|---|---|
| `realModelConfigApplyGuardService.test.ts` | 57 | +24 | **81** |
| `realModelConfigCanonicalizationService.test.ts` | 45 | 0 | 45 |
| `realModelConfigIdempotencySchemaService.test.ts` | 30 | 0 | 30 |
| `realModelConfigTransactionPseudoPlanService.test.ts` | 60 | 0 | 60 |
| `realModelConfigExecutionAuditService.test.ts` | 29 | 0 | 29 |
| `realModelConfigApplyChainHashService.test.ts` | 23 | +18 | **41** |
| **Total** | **244** | **+42** | **286** |
| **Cumulative (all features)** | | | **795** |

---

## Cryptographic Forgery Simulation (Phase 4)

### tokenVerificationStatus contract

When `tokenClaims` are supplied, `tokenVerificationStatus` MUST be `'verified'`:

| Status | Blocked Reason |
|---|---|
| `'forged'` | `REAL_EXEC_TOKEN_SIGNATURE_FORGED` |
| `'unverified'` | `REAL_EXEC_TOKEN_UNVERIFIED` |
| `undefined` / `null` | `REAL_EXEC_TOKEN_VERIFICATION_STATUS_MISSING` |
| Any other string | `REAL_EXEC_TOKEN_VERIFICATION_STATUS_MALFORMED` |
| `'verified'` | ✅ passes this check |

Forged signature blocks even when uid, tenantId, and callerType are otherwise correct.

When `tokenClaims` is not supplied, `tokenVerificationStatus` is not checked (advisory only).

---

## Multi-claim Injection Detection (Phase 4)

### Injection classes detected

| Claim key(s) | Blocked Reason |
|---|---|
| `permissions`, `applyConfig`, `applyModelConfig`, `allowApply` | `REAL_EXEC_INJECTED_PERMISSION_CLAIM` |
| `tenantOverride`, `forceTenantId`, `impersonateTenant` | `REAL_EXEC_INJECTED_TENANT_OVERRIDE` |
| `approvalOverride`, `forceApproval`, `skipApproval` | `REAL_EXEC_INJECTED_APPROVAL_OVERRIDE` |
| `isServiceAccount: true`, `serviceAccountFlag: true` | `REAL_EXEC_INJECTED_SERVICE_ACCOUNT_FLAG` |
| `providerOverride`, `forceProvider`, `overrideProvider` | `REAL_EXEC_INJECTED_PROVIDER_OVERRIDE` |
| `HUMAN` callerType + `ai-agent*` uid | `REAL_EXEC_CONFLICTING_CLAIMS` |

Multiple injection reasons accumulate independently.

---

## Concurrent Modification Simulation (Phase 4)

`detectConcurrentModification` validates two invariants at transaction boundary:

| Check | Blocked Reason |
|---|---|
| `approvalConfigBeforeHash !== currentConfigHash` | `REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH` + `REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED` |
| `expectedCurrentVersion !== observedCurrentVersion` | `REAL_EXEC_CURRENT_CONFIG_VERSION_MISMATCH` + `REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED` |

When concurrent modification is detected, no executable pseudo-plan should be produced.
The blocked chain also flows into `validateFullChainHashPropagation` as a hash mismatch.

---

## Deep Nested Hash Propagation (Phase 4)

New end-to-end tests validate:
- 5-level deeply nested config hashes consistently through approval → plan → auditEvent
- Key reorder in deep config produces same hash (deterministic canonicalization)
- Single scalar value change produces different hash (no collision)
- Mixed scalar types (zero, false, empty string, empty array, empty object) are deterministic
- Unicode / CJK / special characters in nested positions are deterministic

---

## Final Dry-run Release Gate Checklist

- [x] No Firestore read/write
- [x] No `firebase-admin` / `google-cloud-firestore`
- [x] No `runTransaction`
- [x] No UI
- [x] No Netlify Function / Cloud Function
- [x] No real approval records
- [x] No real apply records
- [x] No real rollback records
- [x] No real cleanup jobs
- [x] No real settings mutation
- [x] No real settingsHistory write
- [x] Transaction pseudo-plan `executable: false`
- [x] `aiCanExecute: false`
- [x] Default-deny guard hardened (15 steps + Phase 2/3/4 additional checks)
- [x] Cryptographic forgery simulations tested (8 cases)
- [x] Multi-claim injection tested (8 cases)
- [x] Service Account / Admin SDK cannot bypass business guard
- [x] Full-chain hash propagation tested (approval → plan → auditEvent, 10 field pairs)
- [x] Deep nested config regression tested (7 new cases)
- [x] Concurrent modification simulation tested (5 cases)
- [x] Static guard / CI regression tested (7 patterns, 0 violations)
- [x] Tests pass — 286 assertions (cumulative 795)
- [x] Typecheck pass — 0 errors
- [x] Build pass

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
- No real rollback executed
- No UI added
- No Netlify Function added
- No Cloud Function added

---

## Phase 5 Forward Items (Real Transaction Executor)

1. Caller reads persisted approval from Firestore inside `runTransaction`.
2. Settings current version and config hash read inside `runTransaction`.
3. `currentConfigObject` read from Firestore inside `runTransaction`, then passed to `detectConcurrentModification`.
4. Idempotency lock write inside `runTransaction`.
5. `settingsHistory` write and `settings` update atomic inside `runTransaction`.
6. Audit event write inside `runTransaction` or committed audit trail append.
7. Phase 5 defines `runTransaction` executor service orchestrating Phase 1–4 validators.
