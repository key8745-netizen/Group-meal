# Feature 009 — Phase 5A: Emulator-only Real Model Config Apply Transaction Executor

## Status

Phase 5A implementation complete. This is the FIRST phase in Feature 009 that
introduces a REAL Firestore `runTransaction` for the model-config-apply flow —
strictly confined to the Firebase Emulator / test environment, with a
physically-enforced production hard-block.

## Scope

* Emulator-only real transaction executor
* `ProductionEnvironmentGuard` (default-deny, four independent conditions)
* Real emulator read/write of approval, settings, settingsHistory, idempotency
  lock, and audit event documents — **inside a single atomic `runTransaction`**
* Emulator integration tests (skip gracefully when no emulator is running)
* Static guard script proving the production hard-block is physically present

Out of scope (per SSOT — explicitly NOT touched): UI, Netlify Functions, Cloud
Functions, rollback, cleanup job, Feature 001-008 files, Feature 009 Phase 1-4
contract files (only imported/reused, never modified).

## Files

### `src/services/realModelConfigApplyProductionEnvironmentGuard.ts`

Pure environment-inspection guard. Runs FIRST, before any transaction is
attempted. **ALL four** of the following must hold, or the guard BLOCKS:

1. `NODE_ENV === 'test'`
2. `FIRESTORE_EMULATOR_HOST` is set (non-empty)
3. The resolved project id is classified `EMULATOR_TEST` — **not** `PRODUCTION`
   and **not** `UNKNOWN` (default-deny on unknown environments)
4. `ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY === 'true'` (exact literal string;
   case-sensitive; any other value or absence BLOCKS)

Project id classification (`classifyProjectId`):

| Classification | Meaning | Result |
|---|---|---|
| `PRODUCTION` | matches `FORBIDDEN_PRODUCTION_PROJECT_IDS` (`umas-booking-manager`) | **hard-blocked, cannot ever be allowed** — independent of all other flags |
| `EMULATOR_TEST` | matches `ALLOWED_EMULATOR_PROJECT_IDS` or an emulator/demo/test naming heuristic | eligible (still requires the other 3 conditions) |
| `UNKNOWN` | anything else, including missing/empty | **default-denied** |

The guard returns a `ProductionEnvironmentGuardResult` with a full list of
`BlockedReason`s (new Phase 5A reason codes were added to `aiBoundary.ts`'s
`BlockedReason` union — additive only, no existing reasons changed):

```
F009_PHASE5A_NOT_TEST_ENV
F009_PHASE5A_MISSING_EMULATOR_HOST
F009_PHASE5A_PRODUCTION_PROJECT_ID_BLOCKED
F009_PHASE5A_UNKNOWN_PROJECT_ID
F009_PHASE5A_MISSING_OPT_IN_FLAG
F009_PHASE5A_OPT_IN_FLAG_INVALID
F009_PHASE5A_UNKNOWN_ENVIRONMENT_DEFAULT_DENY
F009_PHASE5A_GUARD_NOT_EXECUTED
F009_PHASE5A_TRANSACTION_BLOCKED_BY_GUARD
F009_PHASE5A_TRANSACTION_ABORTED
F009_PHASE5A_TRANSACTION_FAILED
```

`assertProductionEnvironmentGuardAllowed(result)` throws
`F009_PHASE5A_GUARD_BLOCKED: ...` when the guard does not allow — usable as a
hard physical gate.

### `src/services/realModelConfigApplyTransactionExecutorService.ts`

Orchestrates the real transaction. **Physical guard-first contract**: step 0
evaluates the production environment guard; if it does not `allowed`, the
function returns a `blocked: true` result and **`runTransaction` is never
invoked** — proven by unit tests asserting `runTransactionCallCount === 0`.

Because this repo's only Firestore dependency is the browser `firebase` SDK
(no `firebase-admin` / `@google-cloud/firestore` in `package.json`), the
executor depends on a minimal **duck-typed Firestore surface**
(`RealFirestoreLike`, `RealFirestoreTransactionLike`,
`RealFirestoreDocRefLike`, `RunTransactionFn`) that both the browser
`firebase/firestore` `Transaction`/`runTransaction` and `firebase-admin`'s
equivalents structurally satisfy. Callers inject a concrete emulator-connected
instance — see the emulator test file for a working adapter built on
`firebase/firestore` + `connectFirestoreEmulator`.

Read/validate/write order **inside** the transaction (matches the SSOT order):

1. validate verified human caller — `realModelConfigApplyVerifiedCallerService`
2. read approval
3. validate approval — `realModelConfigApplyApprovalValidationService`
4. (idempotency lock is read here — see note below) → read settings
5. canonicalize current config (via injected `canonicalizeCurrentConfig`)
6. validate `expectedCurrentVersion` / `configBeforeHash` —
   `realModelConfigApplyConcurrentModificationService`
7. read idempotency lock
8. validate duplicate-apply / lock lifecycle —
   `realModelConfigApplyIdempotencyService` +
   `realModelConfigApplyConcurrentModificationService`
9. write idempotency lock (`PENDING`)
10. write immutable `settingsHistory` new version
11. update `settings` current config + `currentVersion`
12. write audit event (`MODEL_CONFIG_APPLIED`), then transition the lock to
    `CONSUMED` — all atomically within the same transaction
13. return apply result

**Implementation note on read ordering**: the idempotency lock is read
*before* the settings-version concurrency check. This is intentional and
necessary for correct idempotent-replay behavior: on a replay (same token +
same payload, lock already `CONSUMED`), the live `settings.currentVersion` has
*already* advanced to `newVersion` from the prior successful apply — checking
`expectedCurrentVersion` against that advanced version would incorrectly
report `F009_CONCURRENT_MODIFICATION_VERSION` for a request that should
short-circuit as a safe no-op success. Reading the lock first lets the
executor recognize "already applied, same payload" and return success without
re-validating against state that has legitimately moved on. All other SSOT
read/validate/write requirements are otherwise preserved in order.

On any failure inside the transaction, the executor returns (does not throw)
a `blocked: true` result carrying a `ModelConfigApplyAbortContract` built via
`realModelConfigApplyAbortContractService.buildAbortContract` — describing
whether a lock `ABANDONED` transition is required. **No partial writes ever
occur**: Firestore transactions are atomic, so a thrown error mid-transaction
guarantees nothing commits (proven by the "transaction atomicity" test, which
asserts the fake-store snapshot remains untouched after a simulated mid-flight
failure).

Firestore paths used (emulator-only collections — distinct from any
production-shaped collection names used elsewhere in the app):

```
modelConfigApprovals/{tenantId}__{approvalId}
settings/{tenantId}
settingsHistory/{tenantId}__{version}
modelConfigApplyIdempotencyLocks/{tenantId}:{applyToken}
auditEvents/{auditTrailId}
```

## Tests

### `src/services/__tests__/realModelConfigApplyPhase5a.test.ts`

Pure / in-memory unit tests — no emulator required. Uses an in-memory
"fake Firestore" with snapshot-isolated staged writes that only commit if the
transaction function resolves (mirroring real Firestore atomicity semantics).

**115 assertions, 0 failures.** Run via:

```
npx tsx src/services/__tests__/realModelConfigApplyPhase5a.test.ts
```

Covers (Section 1 — guard, Section 2 — executor):
* all four guard conditions individually and combined
* production project id hard-block (cannot be bypassed by any other flag combo)
* default-deny on unknown / missing project ids and unknown environments
* `NODE_ENV=test` alone is insufficient
* guard-first contract: `runTransaction` never invoked when guard blocks
* successful emulator transaction (settings/settingsHistory/lock/audit writes)
* idempotent replay (same token + same payload) — safe no-op success
* same token + different payload → BLOCKED
* same approvalId + different token → BLOCKED
* AI caller hard-block, Service Account / Admin SDK bypass block
* `expectedCurrentVersion` mismatch / `configBeforeHash` mismatch → BLOCKED
* invalid / missing / tenant-mismatched approval → BLOCKED
* duplicate apply via PENDING lock conflict → BLOCKED
* transaction atomicity / abort path: mid-flight failure leaves no partial
  mutation, and produces an abort contract requiring an `ABANDONED` lock
  transition

### `src/services/__tests__/realModelConfigApplyPhase5a.emulator.test.ts`

Real Firestore Emulator integration test using the browser `firebase/firestore`
SDK (`connectFirestoreEmulator`) — the only Phase 5A file that opens an actual
Firestore connection, and even there the production guard runs first on every
call. **Skips gracefully** (logs and returns, 0 failures) when
`FIRESTORE_EMULATOR_HOST` is not set, per the SSOT instruction that emulator
tests must not fail the suite when no emulator is running.

When an emulator IS available (start it and set `FIRESTORE_EMULATOR_HOST`,
`NODE_ENV=test`, `ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY=true`,
`FIRESTORE_PROJECT_ID=demo-group-meal-emulator`), it asserts:
* successful apply updates real emulator `settings` / `settingsHistory` /
  idempotency lock / `auditEvents` documents
* duplicate apply → idempotent replay
* production project attempt → BLOCKED, `runTransaction` never opened
* AI caller → BLOCKED
* Service Account caller → BLOCKED
* missing opt-in flag → BLOCKED, `runTransaction` never opened

Run via:

```
npx tsx src/services/__tests__/realModelConfigApplyPhase5a.emulator.test.ts
```

## Static guard script

### `scripts/check-feature009-phase5a-forbidden-patterns.js`

Scans the two Phase 5A files and verifies the production hard-block is
*physically* present in source (not just documented):

1. Any file containing a real `runTransaction(` invocation must reference
   `ProductionEnvironmentGuard` **before** that invocation (guard-first
   ordering, checked by source offset).
2. The executor must actually **invoke**
   `evaluateProductionEnvironmentGuard[FromProcessEnv]` /
   `assertProductionEnvironmentGuardAllowed` — not merely import the type —
   and must contain an `if (!guard.allowed)` early-exit appearing textually
   before the `runTransaction(` call.
3. No hardcoded production project id literal (`umas-booking-manager`) may
   appear anywhere except inside the guard's `FORBIDDEN_PRODUCTION_PROJECT_IDS`
   hard-block list (where its presence is the subject of a block, not a
   target to allow).
4. Any `settings`/`settingsHistory` document reference in the executor must
   appear after the guard check.
5. `ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY` must never be hardcoded to the
   literal `'true'` as a default — it must be read from the environment.

Run via (from repo root):

```
node catering-system/scripts/check-feature009-phase5a-forbidden-patterns.js
```

Result: `[OK] Feature 009 Phase 5A static guard: 0 violations across 2 files.`

The pre-existing `scripts/check-feature009-forbidden-patterns.js` (Phase 1-4
guard, which forbids `runTransaction`/`firebase-admin` in the Phase 1-4 files)
continues to pass unchanged — Phase 5A files are intentionally NOT added to
that scanner's list, since they are the first files permitted to use these
patterns.

## Guard-rail confirmations

* **Production write hard-block**: `evaluateProductionEnvironmentGuard`
  classifies `umas-booking-manager` as `PRODUCTION` and forces
  `allowed: false` / `blocked: true` regardless of any other flag combination
  (`hardBlockedProduction` is computed independently and ANDed into the final
  `allowed` value). Verified by a dedicated test asserting the guard cannot be
  bypassed "even with all other flags valid".
* **ProductionEnvironmentGuard implemented and runs first**: step 0 of
  `executeRealModelConfigApplyTransaction` evaluates the guard before any
  Firestore access; `runTransactionCallCount === 0` is asserted when the guard
  blocks.
* **Real transaction only runs in emulator/test environment**: all four guard
  conditions (test env, emulator host, emulator/test project id, explicit
  opt-in) must independently pass.
* **No production settings / settingsHistory mutation**: the executor never
  reaches the write phase unless the guard allows AND all read/validate steps
  pass; abort-path tests assert settings/settingsHistory remain byte-identical
  to the pre-call seed.
* **No UI / Netlify Function / Cloud Function added**: confirmed — only
  service files, test files, the static guard script, and this doc were added.
* **AI caller hard-blocked**: `validateRealApplyCallerContext` returns
  `F009_CALLER_NOT_HUMAN` + `REAL_EXEC_AI_CALLER_BLOCKED` for `callerType: 'AI'`
  before any Firestore read of approval/settings/lock occurs.
* **Service Account / Admin SDK cannot imply business permission**: both
  caller types are independently hard-blocked
  (`F009_CALLER_SERVICE_ACCOUNT_BLOCKED` / `F009_CALLER_ADMIN_SDK_BLOCKED`)
  regardless of `isServiceAccount` / `signInProvider` claims.
* **Idempotency lock behavior**: `ALLOW_NEW` → write `PENDING` then
  `CONSUMED` atomically; `IDEMPOTENT_REPLAY` → safe no-op success; `BLOCKED`
  outcomes (payload mismatch, pending conflict, approvalId/token conflict,
  stale version) all produce `IDEMPOTENCY_BLOCKED` abort contracts.
* **settingsHistory append-only / immutable**: each write targets a unique
  `{tenantId}__{version}` document path and is written with `immutable: true`;
  no update/overwrite path exists for `settingsHistory` documents anywhere in
  the executor.
* **Audit event write**: `MODEL_CONFIG_APPLIED` audit payload built via the
  reused `buildAuditEventPayload` helper and written atomically alongside the
  settings/history/lock writes.
* **Abort path safety**: any failure (validation or mid-flight transaction
  error) returns `blocked: true` with an abort contract and **zero** partial
  mutation — proven via Firestore-transaction-atomicity semantics (a thrown
  error inside the transaction commits nothing) and replicated in the
  in-memory fake's snapshot-isolation model.

## Known limitations

* **No `firebase-admin` / `@google-cloud/firestore` dependency in this repo**:
  the SSOT explicitly permits these imports in Phase 5A files, but neither is
  present in `catering-system/package.json` (only the browser `firebase` SDK
  is a dependency, and adding a new production dependency was judged out of
  scope for this phase). The executor therefore depends on a minimal
  structurally-typed Firestore surface (`RealFirestoreLike` /
  `RealFirestoreTransactionLike`) that both the browser `firebase/firestore`
  SDK (used in the emulator integration test, via `connectFirestoreEmulator`)
  and `firebase-admin`'s `Transaction`/`Firestore` types structurally satisfy.
  This achieves the spec's intent — a REAL `runTransaction` against the
  emulator — without adding a new dependency; a future phase could swap in
  `firebase-admin` directly with no change to the executor's core logic.
* **Emulator integration tests could not be executed live** in this sandbox
  (no Firebase emulator binary / running instance available). The test file
  is written to run fully when an emulator IS present and to **skip
  gracefully** (0 run, 0 failed) otherwise — verified by running it in this
  environment, which produced the expected `[SKIP]` output and exit code 0.
* **Project id resolution heuristic**: `classifyProjectId` uses an allow-list
  plus a naming heuristic (`demo-*`, `*emulator*`, `*test*` patterns) for
  `EMULATOR_TEST` classification. Any project id not matching the allow-list,
  the forbidden list, or the heuristic is `UNKNOWN` and default-denied — this
  is intentionally conservative per the SSOT's "default-deny on unknown
  environments" requirement.
