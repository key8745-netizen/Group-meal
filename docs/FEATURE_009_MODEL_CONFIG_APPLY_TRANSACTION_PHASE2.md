# Feature 009 Phase 2: Firebase Verification Contract + Read-Set / Abort Simulation

## Phase 2 Scope

Addresses two medium risks identified in the Phase 1 Grok review (96/100):

1. **Real Firebase/Firestore alignment** — models Firebase token parse result consistency with middleware verified caller context (three-way uid/tenantId/provider check)
2. **Abort handler atomicity** — models FAILED audit + ABANDONED lock transition for post-PENDING-lock abort scenarios

All code is pure TypeScript simulation — no Firestore reads, no Firestore writes, no firebase-admin import, no runTransaction.

## New Files

| File | Purpose |
|---|---|
| `catering-system/src/services/realModelConfigApplyFirebaseVerificationService.ts` | Pure validator for Firebase token parse result alignment — 14-check independent collector |
| `catering-system/src/services/realModelConfigApplyReadSetSnapshotService.ts` | Pure validators for approval, settings, and lock read-set snapshots |
| `catering-system/src/services/__tests__/realModelConfigApplyPhase2.test.ts` | 118-case test suite (tsx runner, no test framework) |

## Modified Files

| File | Change |
|---|---|
| `catering-system/src/types/aiBoundary.ts` | Added 36 new F009_* BlockedReason values for Phase 2 |
| `catering-system/src/services/realModelConfigApplyAbortContractService.ts` | Added `buildAbortContractAfterPendingLock`, `buildAbortContractAfterVersionConflict`, `detectDuplicateAbortRequest` |
| `scripts/check-feature009-forbidden-patterns.js` | Added Phase 2 service files to SCAN_GLOBS |

## Test Coverage

| Section | Cases | All Pass |
|---|---|---|
| Firebase Verification Contract | 18 | Yes |
| Middleware / Firebase Consistency | 9 | Yes |
| Approval Read-Set Snapshot | 20 | Yes |
| Settings Read-Set Snapshot | 12 | Yes |
| Lock Read-Set Snapshot | 11 | Yes |
| Abort Handler Hardening | 14 | Yes |
| Static Guard / CI | 8 | Yes |
| Boundary | 11 | Yes |
| **Total** | **118** | **Yes** |

Phase 1 regression: 99 passed, 0 failed.

## Key Design Decisions

### Firebase Token Validation (14 independent checks)

All 14 checks run independently and collect all failures (not early-exit after first failure). This allows callers to see the full set of violations. Only null/missing token causes early return (no further checks possible).

Trusted sources: `FIREBASE_ADMIN_SDK`, `MIDDLEWARE_SERVER`
Service-account providers (blocked): `service-account`, `iam`, `admin-sdk`, `custom`

### Lock Read-Set Validation (LockCheckResult)

The lock check uses a discriminated union result type instead of `F009ValidationResult`:
- `ALLOW_NEW` — safe to create a new lock
- `IDEMPOTENT_REPLAY` — same token + same payload, return existing lock
- `BLOCKED` — conflict detected

Priority order: ABANDONED → same token (payload match or mismatch) → different token + same approvalId → CONSUMED → PENDING

ABANDONED always allows retry regardless of token.

### Abort Handler Atomicity (Phase 2)

Three abort builders:
- `buildAbortContract` — generic, Phase 1 compatible
- `buildAbortContractAfterPendingLock` — always sets `lockTransitionRequired: true`, `lockTransitionTarget: 'ABANDONED'`, adds `F009_ABORT_AFTER_PENDING_LOCK` to blocked reasons and audit payload
- `buildAbortContractAfterVersionConflict` — sets `abortReason: 'VERSION_CONFLICT'`, `lockTransitionRequired: false`, adds `F009_ABORT_VERSION_CONFLICT`

`detectDuplicateAbortRequest` matches on `approvalId + applyToken` from the failure audit payload.

## Boundary Confirmation

| Invariant | Status |
|---|---|
| No firebase-admin import in any Phase 2 service | Confirmed |
| No @google-cloud/firestore import | Confirmed |
| No runTransaction call | Confirmed |
| No direct settings/settingsHistory document write | Confirmed |
| All abort contracts: executable=false | Confirmed |
| All abort contracts: aiCanExecute=false | Confirmed |
| No settingsWrite/historyWrite in abort contracts | Confirmed |
| AI caller still blocked by verifiedCallerService | Confirmed |
| Static guard scans Phase 2 files | Confirmed |

## Known Limitations

- `SimulatedFirebaseTokenParseResult` is a simulation type — in production this would be populated from `firebase-admin.auth().verifyIdToken()` result
- `ApprovalReadSetSnapshot`, `SettingsReadSetSnapshot`, `LockReadSetSnapshot` are plain TypeScript objects — in production they would be read from Firestore inside a transaction
- Phase 2 does not execute the ABANDONED lock transition — it only models what must happen; execution requires Phase 3+ with real Firestore transaction
