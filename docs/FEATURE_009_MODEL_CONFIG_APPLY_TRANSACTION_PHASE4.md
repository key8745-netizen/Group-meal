# Feature 009 Phase 4: Real Verification / Live Read Contract + Abort Atomicity Hardening

## Phase 4 Scope

Phase 4 addresses two medium risks identified in the Phase 3 Grok review (96/100):

1. **Live read sequence contract** — Model the exact ordered read sequence that a real `runTransaction` executor would follow: read approval → read settings → read idempotency lock → validate each → decide write-set eligibility. Provides a seven-step contract with per-step rationale explaining why each step must precede the next.

2. **Abort atomicity hardening** — Model what must happen atomically when an apply attempt fails: which lock states require an `ABANDONED` transition, which are no-ops, which are duplicate idempotent requests, and which carry race-condition risk.

Phase 4 is pure TypeScript contract/simulation code — no Firestore writes, no firebase-admin, no `runTransaction`, no UI.

---

## New Files

| File | Purpose |
|---|---|
| `catering-system/src/services/realModelConfigApplyLiveReadSequenceService.ts` | Simulated live transaction read sequence contract (7 steps, with rationale) |
| `catering-system/src/services/realModelConfigApplyAbortAtomicityService.ts` | Abort atomicity contract builder + race condition evaluator |
| `catering-system/src/services/__tests__/realModelConfigApplyPhase4.test.ts` | Phase 4 test suite (122 assertions, 0 failures) |
| `docs/FEATURE_009_MODEL_CONFIG_APPLY_TRANSACTION_PHASE4.md` | This document |

---

## Modified Files

| File | Change |
|---|---|
| `catering-system/src/types/aiBoundary.ts` | Added 9 new `BlockedReason` values for Phase 4 |
| `scripts/check-feature009-forbidden-patterns.js` | Added 2 new Phase 4 service files to `SCAN_GLOBS` |
| `docs/CURRENT_SSOT.md` | Updated current phase and commit |

---

## Test Coverage

| Section | Assertions | Description |
|---|---|---|
| Real VerifyIdToken Output Contract | 16 | Firebase token verification — all paths including mismatch cases |
| Simulated Live Transaction Read Sequence | 20 | Contract structure, path formatting, validation outcomes |
| Live Read Consistency | 25 | Approval/settings/lock snapshots + concurrent modification + duplicate apply |
| Abort Atomicity Contract | 26 | All 5 lock states, invariants, race condition evaluation |
| Failure Race-Condition Simulation | 7 | Combined abort + concurrent modification integration |
| Static Guard / CI | 6 | Boolean guard assertions |
| Boundary | 6 | AI caller block, executable=false, settingsMutation=false |
| Additional Live Read Sequence | 16 | Sequence step order, rationale, path format, contract fields |
| **Total** | **122** | **0 failures** |

---

## Key Design Decisions

### Live Read Sequence Rationale

The 7-step sequence is strictly ordered because each step's output is a precondition for the next:

- **READ_APPROVAL first** — approval carries `configBeforeHash` and `expectedCurrentVersion` that all subsequent validation steps depend on.
- **READ_SETTINGS second** — settings hash and version must be compared against the approval's reference values.
- **READ_LOCK third** — duplicate-apply decision requires both the approval `applyToken` and the `expectedCurrentVersion` already verified from settings.
- **VALIDATE_* steps before DECIDE** — write-set eligibility is determined only after all three reads and their validations succeed.

### Abort Atomicity States

Five distinct abort outcomes, each with different action requirements:

| Outcome | Lock Transition | Audit Required | Race Risk |
|---|---|---|---|
| `ABORT_NO_LOCK_TRANSITION` | None | Yes | No |
| `ABORT_WITH_LOCK_ABANDONED` | PENDING → ABANDONED | Yes | **Yes** |
| `ABORT_DUPLICATE_IDEMPOTENT` | None | No | No |
| `ABORT_CONSUMED_LOCK_NOOP` | None | No | No |
| `ABORT_ABANDONED_REPLAY` | None | Yes | No |

### Race Condition Detection

Only `ABORT_WITH_LOCK_ABANDONED` carries race-condition risk: if the `PENDING` lock is not transitioned to `ABANDONED` atomically inside a transaction, the lock may remain permanently in `PENDING` and block all future apply attempts for that `applyToken`. Phase 5 will execute this transition inside a real `runTransaction`.

---

## Boundary Confirmation

| Boundary | Status |
|---|---|
| No `firebase-admin` import in any Phase 4 service | CONFIRMED |
| No `@google-cloud/firestore` import in any Phase 4 service | CONFIRMED |
| No `runTransaction` call in any Phase 4 service | CONFIRMED |
| No direct `settings/` document write | CONFIRMED |
| No direct `settingsHistory/` document write | CONFIRMED |
| All contracts have `executable: false` | CONFIRMED |
| All contracts have `aiCanExecute: false` | CONFIRMED |
| `settingsMutationRequired` always `false` on abort | CONFIRMED |
| `historyWriteRequired` always `false` on abort | CONFIRMED |
| Static guard covers all 13 Phase 1–4 service files | CONFIRMED (0 violations) |

---

## Known Limitations

- **Phase 5 = Real Transaction Execution**: Phase 4 only models the contracts. Real `runTransaction` calls, actual Firestore reads, real `verifyIdToken()` integration, and actual lock writes are Phase 5 scope.
- The `ABORT_WITH_LOCK_ABANDONED` race condition is modeled as a contract flag (`hasRaceConditionRisk: true`) — the actual atomic lock transition is not implemented until Phase 5.
- The live read sequence contract contains simulated Firestore path strings — real path resolution depends on tenant configuration at runtime.
