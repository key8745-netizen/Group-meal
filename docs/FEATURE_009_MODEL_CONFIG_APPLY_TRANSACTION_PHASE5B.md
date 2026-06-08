# Feature 009 Phase 5B — Production-Gated Rollout Foundation

## Overview

Phase 5B builds the **safety infrastructure** that would have to ALL pass before
any real production write of a model-config-apply transaction could ever happen.
It is explicitly NOT a broad production rollout — production remains
**disabled-by-default**, and this phase adds gates, allowlists, a kill switch,
an emergency-disable contract, and dry-run-to-real comparison on top of the
Phase 5A emulator-only executor + `ProductionEnvironmentGuard`.

All Phase 5B code is pure logic / contract-style (discriminated unions,
`BlockedReason` values, `executable: false`, default-deny). No Firestore
writes, no UI, no Netlify/Cloud Functions, no rollback, no cleanup job.

## New Services

### 1. `realModelConfigApplyProductionAccessManager.ts`
Top-level default-deny composition point. `evaluateProductionAccess()` runs
EVERY gate (not short-circuited) and only returns `accessGranted: true` when
zero blocked reasons remain. Hard-blocks: missing gate config, missing
deployment gate, production-disabled flag, kill switch ON/missing, missing or
failed tenant/operator allowlist, missing/malformed operator confirmation,
unknown environment, AI caller, Service Account / Admin SDK bypass attempts
(even when masquerading as `HUMAN`).

### 2. `realModelConfigApplyProductionGateService.ts`
- `evaluateDeploymentPipelineGate` — present/missing, project-id match,
  environment match, explicit `approvedForProductionRollout` flag.
- `evaluateKillSwitch` — ON/OFF/missing/stale (freshness-window check).
- `evaluateKillSwitchResetAuditPayload` — validates the COMPLETE reset audit
  contract (scope, requestedBy, approvedBy, previousState, nextState, reason,
  timestamp, auditTrailId). Missing any field BLOCKS
  (`F009_PHASE5B_KILL_SWITCH_RESET_AUDIT_INCOMPLETE`); `requestedBy ===
  approvedBy` BLOCKS on two-person-integrity grounds
  (`F009_PHASE5B_KILL_SWITCH_RESET_TWO_PERSON_REQUIRED`).
- `evaluateEmergencyDisableContract` / `buildEmergencyDisableContract` — a
  non-executable, fully-auditable contract that, once active, blocks ALL
  future applies regardless of any other gate state.

### 3. `realModelConfigApplyOperatorConfirmationService.ts`
- `validateOperatorConfirmation` — binds ALL of tenantId, approvalId,
  applyToken, expectedCurrentVersion, configBeforeHash, configAfterHash,
  diffHash, operatorUserId, timestamp. Missing → `OPERATOR_CONFIRMATION_MISSING`;
  malformed (blank/invalid fields, wrong `_kind`, bad timestamp) →
  `OPERATOR_CONFIRMATION_MALFORMED`; any single field mismatch → its own
  specific `F009_PHASE5B_CONFIRMATION_*_MISMATCH` reason (all collected).
- `validateTenantAllowlist` / `validateOperatorAllowlist` — explicit allowlist
  required; missing/failed-to-load allowlist BLOCKS; not-present BLOCKS;
  NEVER inferred from admin/service role.

### 4. `realModelConfigApplyDryRunToRealComparer.ts`
`compareDryRunToReal` compares a dry-run write-set intent against the real
write-set intent across tenantId, approvalId, sourceRecommendationId,
auditTrailId, expectedCurrentVersion, configBeforeHash, configAfterHash,
diffHash, applyToken, payloadHash. Each field has its own
`F009_PHASE5B_DRYRUN_*_MISMATCH` reason; all mismatches are collected (not
short-circuited); an exact match returns `matches: true`.

### 5. `realModelConfigApplyMonitoringPayloadService.ts`
Pure builders for audit/monitoring payloads (`executable: false`):
production gate pass/blocked, kill switch blocked/reset, dry-run mismatch
blocked, operator confirmation, emergency disable, deployment gate blocked,
plus a generic `buildMonitoringMetricsSnapshot` for transaction success rate,
blocked-apply count, duplicate-apply count, version-conflict count,
hash-mismatch count, and production-error count.

## BlockedReason Additions

`src/types/aiBoundary.ts` `BlockedReason` union was additively extended with
`F009_PHASE5B_*` values (gate config, deployment gate, production disabled,
unknown environment, kill switch, kill switch reset, emergency disable,
tenant/operator allowlist, operator confirmation field mismatches, dry-run
field mismatches, AI/Service-Account/Admin-SDK blocks). No existing values
were modified or removed.

## Static Guard

`scripts/check-feature009-phase5b-forbidden-patterns.js` statically verifies
the five new Phase 5B files contain: no firebase-admin / `@google-cloud/firestore`
/ `firebase/firestore` imports, no `runTransaction`/`.collection`/`.doc`/
`getFirestore` calls, no React/JSX/Netlify/Cloud-Function patterns, visible
default-deny evidence (`BLOCKED` / `blockedReasons` / `!== true` / `MISSING`),
no hardcoded production-bypass literals, and `executable: false` on all
contract/payload `_kind` types that represent non-executable outputs.

## Tests

Five pure-runner test files (`npx tsx`, no framework, throw on failure):
- `realModelConfigApplyProductionAccessManager.test.ts` (44 assertions)
- `realModelConfigApplyProductionGateService.test.ts` (34 assertions)
- `realModelConfigApplyOperatorConfirmationService.test.ts` (28 assertions)
- `realModelConfigApplyDryRunToRealComparer.test.ts` (36 assertions)
- `realModelConfigApplyMonitoringPayloadService.test.ts` (34 assertions)

Total: 176 assertions covering every BLOCK condition enumerated in the SSOT
"Required Tests" section, plus the production-disabled-by-default and
all-gates-pass happy paths.

## Known Limitations

- This is contract-level / pure-logic infrastructure — no real Firestore
  reads/writes, no actual kill-switch persistence, no real CI pipeline
  integration. Wiring these contracts to live infrastructure is explicitly
  out of scope for Phase 5B.
- Rollback and cleanup-job implementations remain excluded (per SSOT).
- No UI surfaces these gates; they are pure backend/contract guard rails.
