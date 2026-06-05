# Feature 008 Phase 3 — Upstream Verification E2E Contract + Firestore Snapshot Hash Simulation

---

## Phase 3 Scope

Phase 3 hardens the two medium-risk gaps identified in Grok's Phase 2 review:

1. **TokenVerificationSource production middleware integration** — E2E contract for missing upstream middleware, malformed context, missing verified user/subject, untrusted sources, service account forgery
2. **Write-set Hash Consistency with real Firestore snapshot alignment** — simulated settings snapshot validator, concurrent modification simulation, full hash-chain consistency gate

No Firestore reads or writes. No `runTransaction`. No real apply.

---

## New Files

### New Service

- `catering-system/src/services/realModelConfigSettingsSnapshotService.ts`
  - `SimulatedSettingsSnapshot` type — plain-object snapshot of a Firestore settings document
  - `validateSimulatedSettingsSnapshotForApply` — validates snapshot tenantId, currentVersion, currentConfig, canonical hash vs approval.configBeforeHash, write-set hash consistency

### New Script

- `scripts/check-feature008-forbidden-patterns.js`
  - Static guard / CI script — scans Phase 3 service files for forbidden patterns (firebase-admin, google-cloud-firestore, runTransaction, direct settings/settingsHistory writes)
  - Exits 1 on any violation

---

## Modified Files

### Types

- `catering-system/src/types/aiBoundary.ts`
  - Added 11 new `BlockedReason` values for Phase 3:
    - `F008_CALLER_CONTEXT_MALFORMED`
    - `F008_CALLER_TENANT_MISSING`
    - `F008_CALLER_VERIFIED_SUBJECT_MISSING`
    - `F008_SNAPSHOT_MISSING`
    - `F008_SNAPSHOT_MALFORMED`
    - `F008_SNAPSHOT_TENANT_MISMATCH`
    - `F008_SNAPSHOT_VERSION_MISMATCH`
    - `F008_SNAPSHOT_CONFIG_MISSING`
    - `F008_SNAPSHOT_HASH_MISMATCH`
    - `F008_SNAPSHOT_CONCURRENT_MODIFICATION`

### Services

- `catering-system/src/services/realApplyCallerContextValidatorService.ts`
  - Phase 3 additions:
    1. `_kind` structural check → `F008_CALLER_CONTEXT_MALFORMED` (early return)
    2. missing/empty `tenantId` in context → `F008_CALLER_TENANT_MISSING`
    3. For trusted sources: `tokenSubject` required → `F008_CALLER_VERIFIED_SUBJECT_MISSING`

### Test Updates

- `catering-system/src/services/__tests__/realApplyPhase1.test.ts`
  - Added `tokenSubject: 'user-008'` and `upstreamVerificationConfirmed: true` to `validContext` (backward compat with Phase 3 required subject rule)
- `catering-system/src/services/__tests__/realApplyPhase2.test.ts`
  - Same update to `validContext`

### New Tests

- `catering-system/src/services/__tests__/realApplyPhase3.test.ts` — **61 assertions**

---

## Test Coverage

| Test Section | Assertions |
|---|---|
| Upstream middleware verification contract | 17 |
| Simulated Firestore settings snapshot | 13 |
| Concurrent modification simulation | 7 |
| Write-set hash consistency against snapshot | 11 |
| Static guard / CI regression | 5 |
| Boundary confirmations | 8 |
| **Phase 3 total** | **61** |

---

## Key Design Decisions (Phase 3)

### tokenSubject required for trusted sources

For `FIREBASE_ADMIN_SDK` and `MIDDLEWARE_SERVER`, `tokenSubject` (Firebase uid from token) is now required. This closes the gap where a trusted source could omit the token subject, making the caller-userId assertion unverifiable.

### Snapshot tenant guard executes first

`validateSimulatedSettingsSnapshotForApply` checks `tenantId` first and returns immediately on mismatch — only one blocked reason is returned. This mirrors the Feature 007 tenant hard-guard pattern and prevents information leakage about version state to cross-tenant callers.

### Concurrent modification detection is dual-signal

Both version mismatch AND config hash mismatch emit `F008_SNAPSHOT_CONCURRENT_MODIFICATION`. This means concurrent modification is detected even when an attacker replays an old version number with a new config.

### Simulated snapshot is structurally typed

`SimulatedSettingsSnapshot._kind = 'simulated_settings_snapshot'` ensures that a plain config object cannot accidentally be passed as a snapshot. Phase 4+ Firestore reads must construct this type explicitly.

### Static guard script is CI-runnable

`scripts/check-feature008-forbidden-patterns.js` scans all Phase 3 service files and exits 1 on any forbidden pattern. Run as: `node scripts/check-feature008-forbidden-patterns.js` from repo root.

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
| **Feature 008 Phase 1–3 total** | **169** | ✅ PASS |
| **Cumulative all features** | **964** | ✅ ALL PASS |

---

## Phase 4 Forward Items

1. Real Firebase Admin SDK token verification in middleware — replace `upstreamVerificationConfirmed` contract field with actual Admin SDK `verifyIdToken()` call.
2. Real Firestore read of `settings/{tenantId}` inside `runTransaction` — replace `SimulatedSettingsSnapshot` with actual Firestore document data.
3. Real Firestore read of approval record inside `runTransaction`.
4. Idempotency lock check-and-write inside `runTransaction`.
5. `settingsHistory` immutable append inside `runTransaction`.
6. `settings` current version update inside `runTransaction`.
7. Audit event write inside `runTransaction` or committed audit append.
8. `runTransaction` executor service orchestrating Phase 1–3 validators in order.
