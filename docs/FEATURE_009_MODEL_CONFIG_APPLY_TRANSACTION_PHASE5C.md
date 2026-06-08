# Feature 009 Phase 5C — Deployment Gate Hardening + Kill Switch Reset Transaction Protection

## Overview

Phase 5C hardens the final two production-gate layers identified by the Phase
5C spec review: (1) the deployment pipeline gate's physical enforcement, and
(2) the kill-switch reset's end-to-end transaction protection, plus a new
post-reset **observation mode** contract. As with Phase 5B, everything here is
pure logic / contract-style code (`executable: false`, `aiCanExecute: false`,
default-deny). No Firestore writes, no UI, no Netlify/Cloud Functions, no
rollback, no cleanup job, no real KMS/HMAC SDK calls, no real `runTransaction`.

Production remains **disabled-by-default**. Phase 5C does not open any new
write path — it only adds additional hard-block modeling on top of Phase 5A/5B.

## New Services

### 1. `realModelConfigApplyDeploymentGateValidator.ts`
- `DeploymentTokenContract` — a structurally-typed model of a CI-injected
  deployment token (`tokenId`, `projectId`, `environment`, `issuedAt`,
  `hmacSignatureHex`, `kmsKeyId`, `kmsVerificationStatus`,
  `injectedByCi`/`localBypassAttempted`/`ciBypassAttempted`). No real HMAC
  computation or KMS SDK call ever occurs — `validateDeploymentToken` performs
  a deterministic structural comparison against caller-supplied expectations.
- `validateDeploymentToken` — hard-blocks (collecting ALL applicable reasons):
  missing, malformed, stale, invalid HMAC, KMS mismatch, wrong project, wrong
  environment, local bypass, CI bypass.
- `DeploymentGateLifecycleRecord` / `CiTokenInjectionLifecycle` — pure data
  models of the Firestore `deployment_gate` document lifecycle and the CI
  token-injection → gate-update lifecycle (discrete phases, never executed).
- `evaluateSecurityCoordinatorConsistency` — the **SecurityCoordinator**
  contract: cross-validates token + gate + CI lifecycle for mutual
  consistency. Hard-blocks: token injected but Firestore gate missing,
  Firestore gate updated but token invalid, token injected but gate update
  failed (token treated as invalidated), network/partial failure, missing
  gate/lifecycle (default-deny), project/environment cross-binding mismatches.
- `evaluateDevelopmentFallback` — models the guarantee that a development
  fallback path can NEVER create a production write path
  (`createsProductionWritePath` is a structural literal `false`).
- `buildDeploymentGateAuditPayload` / `evaluateDeploymentGateAuditPayloadCompleteness`
  — complete, structured, non-executable audit payload builder + completeness
  validator (default-deny on incomplete payloads).
- `evaluateHardenedDeploymentGate` — top-level composed entry point running
  token validation + coordinator consistency + dev-fallback guard, never
  short-circuiting, always producing a complete audit payload.
- `buildDeploymentGateBlockedEventPayload` — complete "blocked event" payload
  (`executable: false`, `aiCanExecute: false`).

### 2. `realModelConfigApplyKillSwitchResetTransactionService.ts`
Hardens Phase 5B's `evaluateKillSwitchResetAuditPayload` with a full
**reset transaction boundary contract**:
- `KillSwitchResetReadSet` / `KillSwitchResetWriteSet` /
  `KillSwitchResetTransactionPlan` — pure data structures modeling exactly
  what a real `runTransaction` would have to read and write atomically. No
  real transaction ever runs; `evaluateReadSet` / `evaluateWriteSet` validate
  structural completeness and cross-binding (write-set `auditTrailId` and
  `nextState` must match the request).
- `evaluateKillSwitchResetTransaction` — the core evaluator. Enforces:
  two-person integrity (`requestedBy !== approvedBy`), mandatory
  `requestedBy`/`approvedBy`/`reason`/`previousState`/`nextState`/`auditTrailId`,
  `previousState`/`nextState` consistency against the observed read-set,
  **idempotency** via `auditTrailId` against a `KillSwitchResetIdempotencyLedger`
  (missing ledger → cannot prove idempotency → default-deny), and **atomicity
  / failure-consistency**: if either the (modeled) audit write or the (modeled)
  state write would fail, the WHOLE transaction is blocked
  (`F009_PHASE5C_RESET_TXN_INCONSISTENT_STATE_BLOCKED`) — neither side-effect
  occurs, so no inconsistent state can ever result.
- AI / Service Account / Admin SDK callers are hard-blocked from BOTH
  requesting (`F009_PHASE5C_RESET_TXN_AI_CALLER_BLOCKED`) and approving
  (`F009_PHASE5C_RESET_TXN_AI_APPROVAL_BLOCKED`) a reset.
- `buildKillSwitchResetAuditTrailPayload` — complete, non-executable reset
  audit payload, atomic with the (modeled) state transition.

### 3. `realModelConfigApplyObservationModeService.ts`
- `OBSERVATION_MODE_DURATION_SECONDS = 600` — explicit 10-minute expiry
  constant (never implicit).
- `ObservationModeState` — pure data model with a structural
  `canEnableProductionWrites: false` invariant and a monotonic `version` for
  concurrency modeling.
- `evaluateObservationMode` — default-deny on missing/malformed state;
  emergency disable is checked FIRST and always overrides/clears observation
  mode (`overriddenByEmergencyDisable: true`, `active: false`); explicit
  expiry check (`status === 'EXPIRED'` or `now >= expiresAt`); structural
  bypass-channel guard — `authorizesProductionWrite` is a literal `false` in
  the result type, and any `requestedToAuthorizeWrite: true` attempt is
  hard-blocked (`F009_PHASE5C_OBSERVATION_MODE_CANNOT_ENABLE_PRODUCTION_WRITE`).
- `evaluateObservationModeConcurrency` — **documented concurrency model**:
  state carries a monotonic `version`; mutation attempts supply an
  `expectedVersion`; only an attempt whose `expectedVersion` matches the
  current version may "win"; stale-version attempts are blocked; a TRUE race
  (two attempts presenting the same matching `expectedVersion`) is ambiguous
  and BOTH are blocked by default-deny — mirroring optimistic-concurrency
  semantics a real `runTransaction` would enforce, without any real
  transaction ever running.
- `buildObservationModeMonitoringPayload` — complete monitoring payload
  (`executable: false`, `aiCanExecute: false`, `authorizesProductionWrite: false`).

## BlockedReason Additions

`src/types/aiBoundary.ts` `BlockedReason` union was additively extended with
`F009_PHASE5C_*` values covering: deployment token contract states (missing,
stale, malformed, invalid HMAC, KMS mismatch, wrong project/environment, local
/ CI bypass), deployment gate / SecurityCoordinator consistency states,
network/partial failure, dev-fallback guard, kill-switch reset transaction
states (missing fields, two-person integrity, state mismatches, idempotency,
audit/state write failures, inconsistency, read/write-set validity, AI
boundary), observation mode states (missing, malformed, expired, default-deny,
concurrency conflict, write-bypass guard, emergency-disable override), and
emergency-disable interplay / AI boundary reasons. No existing values were
modified or removed.

## Static Guard

`scripts/check-feature009-phase5c-forbidden-patterns.js` (repo root,
`path.resolve(__dirname, '..')`) statically verifies the three new Phase 5C
files contain: no firebase-admin / `@google-cloud/firestore` /
`firebase/firestore` imports, no `runTransaction`/`.collection`/`.doc`/
`getFirestore`/real-crypto-SDK calls, no React/JSX/Netlify/Cloud-Function
patterns, no rollback/cleanup implementations, visible default-deny evidence,
no hardcoded production- or observation-mode-bypass literals, and
`executable: false` on every contract/payload/result `_kind` type.

## Tests

Four pure-runner test files (`npx tsx`, no framework, throw on failure):
- `realModelConfigApplyDeploymentGateValidator.test.ts` (32 assertions)
- `realModelConfigApplyKillSwitchResetTransactionService.test.ts` (28 assertions)
- `realModelConfigApplyObservationModeService.test.ts` (24 assertions)
- `realModelConfigApplyPhase5cEmergencyAndBoundary.test.ts` (19 assertions)

Total: 103 assertions covering every bullet enumerated in the SSOT
"Required Tests" section (Deployment Pipeline Gate, Kill Switch Reset
Transaction Protection, Observation Mode, Emergency Disable, Boundary).

## How Each Hard Constraint Is Satisfied

- **No UI / Netlify / Cloud Functions / rollback / cleanup**: verified both
  structurally (no such code exists) and by the static guard + boundary tests.
- **No real `runTransaction` / KMS / HMAC SDK**: all transaction and
  cryptographic modeling is pure data comparison; static guard greps for and
  blocks `runTransaction`, `.collection`, `.doc`, `getFirestore`,
  `createHmac`/`createCipheriv`/`crypto.subtle`, `@google-cloud/kms`.
- **AI cannot apply / reset / approve / modify gate**: every contract type
  carries `executable: false` and (where relevant) `aiCanExecute: false`;
  `evaluateKillSwitchResetTransaction` hard-blocks AI/Service-Account/Admin-SDK
  callers from BOTH the requesting and approving roles; no executable path
  exists anywhere in these files for an AI caller to mutate state.
- **Production disabled-by-default / no broad rollout**: no file sets
  `productionEnabled`/`accessGranted`/`canEnableProductionWrites`/
  `authorizesProductionWrite` to a literal `true`; all evaluators default to
  blocked/false and only flip to "passed" after every check is satisfied.
- **Emergency disable overrides production enablement, kill switch reset, AND
  observation mode**: `evaluateObservationMode` checks emergency-disable
  status FIRST, before evaluating its own state, and always reports
  `overriddenByEmergencyDisable: true` / `active: false` when active; the
  Emergency Disable + Boundary test demonstrates that an orchestration layer
  checking `evaluateEmergencyDisableContract().blocksFutureApplies` first will
  never allow a reset to proceed while emergency disable is active.
- **Feature 001-008 / Phase 5A/5B untouched**: only new Phase 5C files were
  added; `aiBoundary.ts` was extended additively (new union members appended
  at the end, nothing removed or altered).

## Known Limitations

- This is contract-level / pure-logic infrastructure — no real Firestore
  reads/writes, no actual deployment-token issuance, no real CI pipeline
  integration, no real KMS/HMAC verification. Wiring these contracts to live
  infrastructure remains explicitly out of scope.
- Rollback and cleanup-job implementations remain excluded (per SSOT).
- No UI surfaces these gates; they are pure backend/contract guard rails.
- The high-concurrency model is a deterministic, documented optimistic-
  concurrency simulation (version comparison) — it does not exercise a real
  concurrent runtime.
