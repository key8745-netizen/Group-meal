/**
 * canary-e2e.test.ts
 *
 * Feature 009 Phase 5E: Integration-style end-to-end canary scenario coverage.
 *
 * Pure-logic, non-executable scenario chains exercising the Phase 5E
 * canaryManager / canaryAudit / canary_feature_flag contracts together, as
 * they would be invoked in sequence during a real (but never-executed)
 * staging-only canary / dry-run flow. NO real CI, Firestore, staging
 * infrastructure, or production write occurs anywhere in this file — every
 * step is a pure function call over modeled data.
 */

import {
  IS_PRODUCTION_READINESS_ONLY,
  evaluateCanaryWriteAttempt,
  evaluateStagingDryRunRequest,
  evaluateCiPartialFailureScenario,
  evaluateManualApprovalRevalidation,
  buildCanaryDeploymentAbortedAuditPayload,
  evaluateHighLoadConcurrency,
  evaluateHaltRecovery,
  evaluateCanaryConcurrentResetApply,
  evaluateCanaryConcurrentEmergencyDisableObservation,
  evaluateCanaryConcurrentExpiryApply,
  checkEmergencyDisablePriority,
  SIMULATED_HIGH_LOAD_REQ_PER_SEC,
  CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC,
  type CiRevalidationTokenContract,
  type CanaryVersionedOperationAttempt,
} from '../../src/services/canaryManager';
import {
  buildExpectedVsActualDiffPayload,
  evaluateTenantBlockOnDifference,
  buildHaltAuditPayload,
  buildRecoveryAuditPayload,
  buildDryRunAuditPayload,
} from '../../src/services/canaryAudit';
import {
  evaluateCanaryFeatureFlagGate,
  buildDefaultOffCanaryFeatureFlag,
  type CanaryFeatureFlag,
} from '../../src/services/canary_feature_flag';
import type { EmergencyDisableContract } from '../../src/services/realModelConfigApplyProductionGateService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5E: canary-e2e integration scenarios ---');

const NOW = '2026-06-08T00:30:00.000Z';
const NOW_SEC = Date.parse(NOW) / 1000;

const emergencyOff: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: false, disabledBy: '', reason: '', disabledAt: '', auditTrailId: '',
};
const emergencyOn: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: true, disabledBy: 'op-1', reason: 'incident', disabledAt: NOW, auditTrailId: 'audit-em-e2e',
};

function attempt(kind: CanaryVersionedOperationAttempt['kind'], actorId: string, expectedVersion: number): CanaryVersionedOperationAttempt {
  return { _kind: 'f009_phase5e_versioned_operation_attempt', kind, actorId, expectedVersion, attemptedAt: NOW };
}

function onFlag(): CanaryFeatureFlag {
  return {
    _kind: 'f009_phase5e_canary_feature_flag', executable: false,
    enabled: true, environment: 'staging', setBy: 'op-1',
    setAt: '2026-06-08T00:00:00.000Z', expiresAt: '2026-06-08T01:00:00.000Z',
    canEnableProductionWrite: false, canEnableCanaryRollout: false,
  };
}

// ── Scenario 1: feature-flag isolation gates a staging dry-run end-to-end ────
{
  expect('Scenario 1: IS_PRODUCTION_READINESS_ONLY guard active', IS_PRODUCTION_READINESS_ONLY === true);

  const gate = evaluateCanaryFeatureFlagGate({ _kind: 'f009_phase5e_canary_feature_flag_gate_input', flag: onFlag(), now: NOW });
  expect('Scenario 1: feature flag gate isolated for staging', gate.isolated === true);

  const dryRun = evaluateStagingDryRunRequest({
    _kind: 'f009_phase5e_staging_dry_run_request_input',
    environment: 'staging', dryRun: true, featureFlagIsolated: gate.isolated, actorId: 'actor-e2e-1',
  });
  expect('Scenario 1: staging dry-run allowed when flag isolated', dryRun.allowed === true);
  expect('Scenario 1: dry-run never authorizes production write', dryRun.authorizesProductionWrite === false);

  // Attempting a real write alongside it must be FATAL.
  const writeAttempt = evaluateCanaryWriteAttempt({
    _kind: 'f009_phase5e_canary_write_attempt_input', targetKind: 'PRODUCTION_CANARY_WRITE', environment: 'production', dryRun: false, actorId: 'actor-e2e-1',
  });
  expect('Scenario 1: production canary write attempt → FATAL_SAFETY_VIOLATION', writeAttempt.fatal === true && writeAttempt.blockedReasons.includes('F009_PHASE5E_FATAL_SAFETY_VIOLATION'));
  expect('Scenario 1: production canary write attempt → blocked', writeAttempt.blockedReasons.includes('F009_PHASE5E_PRODUCTION_CANARY_WRITE_BLOCKED'));

  // Dry-run audit difference — found a difference → tenant block.
  const diff = buildExpectedVsActualDiffPayload({
    _kind: 'f009_phase5e_expected_vs_actual_diff_input',
    tenantId: 'tenant-e2e-1', dryRunId: 'dry-e2e-1', auditTrailId: 'audit-diff-e2e-1',
    expected: { headCount: 80 }, actual: { headCount: 95 }, occurredAt: NOW,
  });
  expect('Scenario 1: diff payload built ok', diff.ok === true);
  const tenantBlock = evaluateTenantBlockOnDifference(diff.payload);
  expect('Scenario 1: tenant blocked on audit difference', tenantBlock.blocked === true);

  const dryRunAudit = buildDryRunAuditPayload({
    tenantId: 'tenant-e2e-1', dryRunId: 'dry-e2e-1', differenceCount: diff.payload?.differenceCount ?? 0,
    blocksTenant: tenantBlock.blocked, auditTrailId: 'audit-diff-e2e-1', occurredAt: NOW,
  });
  expect('Scenario 1: dry-run audit payload complete and staging-only', dryRunAudit.ok === true && dryRunAudit.payload?.stagingOnly === true);
}

// ── Scenario 2: CI E2E partial failure → orphaned token → SELF_INVALIDATE → DEPLOYMENT_ABORTED → revalidation ──
{
  const ciFailure = evaluateCiPartialFailureScenario({
    _kind: 'f009_phase5e_ci_partial_failure_scenario_input',
    scenario: 'NETWORK_INTERRUPT_AFTER_TOKEN', reachedStage: 'TOKEN_INJECTED', environment: 'staging',
  });
  expect('Scenario 2: CI partial failure blocked', ciFailure.blocked === true);
  expect('Scenario 2: orphaned token suspected', ciFailure.orphanedTokenSuspected === true);
  expect('Scenario 2: SELF_INVALIDATE required', ciFailure.requiresSelfInvalidate === true);

  const abortAudit = buildCanaryDeploymentAbortedAuditPayload({
    deploymentId: 'deploy-e2e-2', operatorId: 'op-e2e-2', auditTrailId: 'audit-e2e-2',
    reason: 'network interrupted after token injection', occurredAt: NOW,
  });
  expect('Scenario 2: DEPLOYMENT_ABORTED audit complete', abortAudit.eventType === 'DEPLOYMENT_ABORTED' && abortAudit.requiresFreshApprovalForRetry === true);
  expect('Scenario 2: DEPLOYMENT_ABORTED never authorizes write', abortAudit.authorizesProductionWrite === false);

  // No auto-retry — must require manual approval revalidation w/ fresh CI_REVALIDATION_TOKEN.
  const noFreshToken = evaluateManualApprovalRevalidation({
    _kind: 'f009_phase5e_manual_approval_revalidation_input',
    isRetryAfterFailure: true, revalidationToken: null, freshManualApprovalGranted: false,
    previousApprovalId: 'approval-e2e-1', currentApprovalId: 'approval-e2e-1',
  });
  expect('Scenario 2: retry without revalidation → blocked', noFreshToken.allowed === false);
  expect('Scenario 2: no auto-retry ever permitted', noFreshToken.autoRetryAllowed === false);

  const freshToken: CiRevalidationTokenContract = {
    _kind: 'f009_phase5e_ci_revalidation_token_contract', executable: false,
    tokenId: 'reval-e2e-1', singleUse: true, authorizesWrite: false,
    issuedAt: NOW, expiresAt: '2026-06-08T01:00:00.000Z', scopedApprovalId: 'approval-e2e-2',
  };
  const validRetry = evaluateManualApprovalRevalidation({
    _kind: 'f009_phase5e_manual_approval_revalidation_input',
    isRetryAfterFailure: true, revalidationToken: freshToken, freshManualApprovalGranted: true,
    previousApprovalId: 'approval-e2e-1', currentApprovalId: 'approval-e2e-2',
  });
  expect('Scenario 2: retry with fresh approval + token → allowed', validRetry.allowed === true);
  expect('Scenario 2: even allowed retry never enables auto-retry', validRetry.autoRetryAllowed === false);
}

// ── Scenario 3: extreme high-load → HALT → recovery requires version alignment ──
{
  const load = evaluateHighLoadConcurrency({
    _kind: 'f009_phase5e_high_load_simulation_input',
    observedReqPerSec: SIMULATED_HIGH_LOAD_REQ_PER_SEC, thresholdReqPerSec: CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC,
    tenantId: 'tenant-e2e-3', occurredAt: NOW,
  });
  expect('Scenario 3: ~500 req/s exceeds threshold → HALT', load.haltTriggered === true);

  const haltAudit = buildHaltAuditPayload({
    tenantId: 'tenant-e2e-3', reason: 'extreme high load observed', observedLoad: load.observedReqPerSec,
    threshold: load.thresholdReqPerSec, auditTrailId: 'audit-halt-e2e-3', occurredAt: NOW,
  });
  expect('Scenario 3: HALT audit payload complete', haltAudit.ok === true && haltAudit.payload?.eventType === 'HALT');

  // Recovery WITHOUT alignment → blocked.
  const badRecovery = evaluateHaltRecovery({
    _kind: 'f009_phase5e_halt_recovery_input', emergencyDisable: emergencyOff,
    versionAlignment: { _kind: 'f009_phase5e_version_alignment_check_input', localVersion: 4, remoteVersion: 5, tenantId: 'tenant-e2e-3' },
  });
  expect('Scenario 3: recovery without alignment → gate reset blocked', badRecovery.gateResetAllowed === false);
  expect('Scenario 3: recovery without alignment → requires alignment reason', badRecovery.blockedReasons.includes('F009_PHASE5E_HALT_RECOVERY_REQUIRES_VERSION_ALIGNMENT'));

  // Recovery WITH alignment and emergency off → permitted.
  const goodRecovery = evaluateHaltRecovery({
    _kind: 'f009_phase5e_halt_recovery_input', emergencyDisable: emergencyOff,
    versionAlignment: { _kind: 'f009_phase5e_version_alignment_check_input', localVersion: 5, remoteVersion: 5, tenantId: 'tenant-e2e-3' },
  });
  expect('Scenario 3: recovery with alignment + emergency off → gate reset allowed', goodRecovery.gateResetAllowed === true);

  const recoveryAudit = buildRecoveryAuditPayload({
    tenantId: 'tenant-e2e-3', localVersion: 5, remoteVersion: 5, auditTrailId: 'audit-rec-e2e-3', occurredAt: NOW,
  });
  expect('Scenario 3: recovery audit payload complete + aligned', recoveryAudit.ok === true && recoveryAudit.payload?.versionAligned === true);

  // Even with alignment, emergency disable wins.
  const emergencyRecovery = evaluateHaltRecovery({
    _kind: 'f009_phase5e_halt_recovery_input', emergencyDisable: emergencyOn,
    versionAlignment: { _kind: 'f009_phase5e_version_alignment_check_input', localVersion: 5, remoteVersion: 5, tenantId: 'tenant-e2e-3' },
  });
  expect('Scenario 3: emergency disable wins over aligned recovery', emergencyRecovery.emergencyDisableWins === true && emergencyRecovery.gateResetAllowed === false);
}

// ── Scenario 4: concurrent races all resolve safely; emergency disable always first ──
{
  const resetApply = evaluateCanaryConcurrentResetApply({
    _kind: 'f009_phase5e_concurrent_reset_apply_input',
    resetAttempt: attempt('RESET', 'reset-e2e', 9), applyAttempt: attempt('APPLY', 'apply-e2e', 9),
    currentVersion: 9, emergencyDisable: emergencyOff,
  });
  expect('Scenario 4: concurrent reset+apply same version → HALT', resetApply.outcome === 'HALT');

  const edRace = evaluateCanaryConcurrentEmergencyDisableObservation({
    _kind: 'f009_phase5e_concurrent_emergency_disable_observation_input',
    emergencyDisable: emergencyOn, observationAttempt: attempt('OBSERVATION_EXPIRY', 'obs-e2e', 1),
  });
  expect('Scenario 4: emergency disable wins over observation', edRace.emergencyDisableWins === true);
  expect('Scenario 4: observation cannot override emergency disable', edRace.observationModeCanOverrideEmergencyDisable === false);

  const expiryRace = evaluateCanaryConcurrentExpiryApply({
    _kind: 'f009_phase5e_concurrent_expiry_apply_input',
    observationPresent: true, observationExpiresAtSec: NOW_SEC - 5, nowSec: NOW_SEC,
    applyAttempt: attempt('APPLY', 'apply-e2e-2', 1), emergencyDisable: emergencyOff,
  });
  expect('Scenario 4: expired observation window race → BLOCKED', expiryRace.outcome === 'BLOCKED');

  // Emergency disable hook checked FIRST across all apply/reset/observation paths.
  for (const pathName of ['APPLY', 'RESET', 'OBSERVATION', 'CANARY_DRY_RUN'] as const) {
    const r = checkEmergencyDisablePriority({ _kind: 'f009_phase5e_emergency_disable_priority_check_input', emergencyDisable: emergencyOn, pathName });
    expect(`Scenario 4: emergency disable hook fires first for ${pathName} path`, r.emergencyDisableWins === true && r.pathBlocked === true);
  }
}

// ── Scenario 5: feature flag default-off baseline cannot enable anything ─────
{
  const defOff = buildDefaultOffCanaryFeatureFlag({ setBy: 'op-e2e', setAt: '2026-06-08T00:00:00.000Z', expiresAt: '2026-06-08T02:00:00.000Z' });
  const gate = evaluateCanaryFeatureFlagGate({ _kind: 'f009_phase5e_canary_feature_flag_gate_input', flag: defOff, now: NOW });
  expect('Scenario 5: default-off flag → not isolated', gate.isolated === false);
  expect('Scenario 5: default-off flag → cannot authorize production write', gate.authorizesProductionWrite === false);
  expect('Scenario 5: default-off flag → cannot authorize canary rollout', gate.authorizesCanaryRollout === false);

  const dryRun = evaluateStagingDryRunRequest({
    _kind: 'f009_phase5e_staging_dry_run_request_input',
    environment: 'staging', dryRun: true, featureFlagIsolated: gate.isolated, actorId: 'actor-e2e-5',
  });
  expect('Scenario 5: dry-run blocked when feature flag not isolated', dryRun.allowed === false);
  expect('Scenario 5: blocked reason cites feature flag disabled', dryRun.blockedReasons.includes('F009_PHASE5E_FEATURE_FLAG_DISABLED'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`canary-e2e.test.ts: ${fail} assertion(s) failed`);
