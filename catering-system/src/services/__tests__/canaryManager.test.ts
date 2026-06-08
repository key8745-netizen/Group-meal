import {
  IS_PRODUCTION_READINESS_ONLY,
  evaluateCanaryWriteAttempt,
  evaluateStagingDryRunRequest,
  evaluateCiPartialFailureScenario,
  evaluateManualApprovalRevalidation,
  buildCanaryDeploymentAbortedAuditPayload,
  evaluateHighLoadConcurrency,
  evaluateVersionAlignmentCheck,
  evaluateHaltRecovery,
  evaluateCanaryConcurrentResetApply,
  evaluateCanaryConcurrentEmergencyDisableObservation,
  evaluateCanaryConcurrentExpiryApply,
  checkEmergencyDisablePriority,
  summarizeCanaryLoadSimulation,
  SIMULATED_HIGH_LOAD_REQ_PER_SEC,
  CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC,
  type CanaryWriteAttemptInput,
  type StagingDryRunRequestInput,
  type CiPartialFailureScenarioInput,
  type ManualApprovalRevalidationInput,
  type CiRevalidationTokenContract,
  type HighLoadSimulationInput,
  type VersionAlignmentCheckInput,
  type HaltRecoveryInput,
  type CanaryVersionedOperationAttempt,
  type ConcurrentResetApplyInput,
  type ConcurrentEmergencyDisableObservationInput,
  type ConcurrentExpiryApplyInput,
  type EmergencyDisablePriorityCheckInput,
} from '../canaryManager';
import type { EmergencyDisableContract } from '../realModelConfigApplyProductionGateService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5E: Canary Manager ---');

const NOW = '2026-06-08T00:20:00.000Z';

const emergencyOff: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: false, disabledBy: '', reason: '', disabledAt: '', auditTrailId: '',
};
const emergencyOn: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: true, disabledBy: 'op-1', reason: 'incident', disabledAt: NOW, auditTrailId: 'audit-em-1',
};

function attempt(kind: CanaryVersionedOperationAttempt['kind'], actorId: string, expectedVersion: number): CanaryVersionedOperationAttempt {
  return { _kind: 'f009_phase5e_versioned_operation_attempt', kind, actorId, expectedVersion, attemptedAt: NOW };
}

// ── IS_PRODUCTION_READINESS_ONLY hard guard ──────────────────────────────────
expect('IS_PRODUCTION_READINESS_ONLY is true (hard guard)', IS_PRODUCTION_READINESS_ONLY === true);

// ── Zero Real Write enforcement ──────────────────────────────────────────────
const writeKinds: CanaryWriteAttemptInput['targetKind'][] = ['PRODUCTION_WRITE', 'PRODUCTION_CANARY_WRITE', 'BROAD_ROLLOUT', 'CANARY_WITHOUT_DRY_RUN'];
for (const targetKind of writeKinds) {
  const input: CanaryWriteAttemptInput = { _kind: 'f009_phase5e_canary_write_attempt_input', targetKind, environment: 'production', dryRun: false, actorId: 'actor-x' };
  const r = evaluateCanaryWriteAttempt(input);
  expect(`Write attempt ${targetKind} → blocked+fatal`, r.blocked === true && r.fatal === true);
  expect(`Write attempt ${targetKind} → FATAL_SAFETY_VIOLATION`, r.blockedReasons.includes('F009_PHASE5E_FATAL_SAFETY_VIOLATION'));
  expect(`Write attempt ${targetKind} → isProductionReadinessOnly true`, r.isProductionReadinessOnly === true);
}
expect('Malformed write attempt → blocked+fatal default-deny', evaluateCanaryWriteAttempt(null).blocked === true);

// ── Staging-only dry-run ──────────────────────────────────────────────────────
const validDryRun: StagingDryRunRequestInput = {
  _kind: 'f009_phase5e_staging_dry_run_request_input', environment: 'staging', dryRun: true, featureFlagIsolated: true, actorId: 'actor-1',
};
const validDryRunResult = evaluateStagingDryRunRequest(validDryRun);
expect('Valid staging dry-run → allowed', validDryRunResult.allowed === true);
expect('Valid staging dry-run → never authorizes write', validDryRunResult.authorizesProductionWrite === false);
expect('Valid staging dry-run → STAGING_ONLY_DRY_RUN_ALLOWED', validDryRunResult.blockedReasons.includes('F009_PHASE5E_STAGING_ONLY_DRY_RUN_ALLOWED'));

const prodDryRun: StagingDryRunRequestInput = { ...validDryRun, environment: 'production' };
expect('Production dry-run request → blocked', evaluateStagingDryRunRequest(prodDryRun).allowed === false);

const noDryRun: StagingDryRunRequestInput = { ...validDryRun, dryRun: false };
expect('Canary without dry-run → blocked', evaluateStagingDryRunRequest(noDryRun).blockedReasons.includes('F009_PHASE5E_CANARY_WITHOUT_DRY_RUN_BLOCKED'));

// ── Real CI E2E partial-failure scenarios ────────────────────────────────────
const scenarios: { scenario: CiPartialFailureScenarioInput['scenario']; reason: string }[] = [
  { scenario: 'TOKEN_INJECTION_FAILURE', reason: 'F009_PHASE5E_TOKEN_INJECTION_FAILED' },
  { scenario: 'GATE_UPDATE_FAILURE', reason: 'F009_PHASE5E_GATE_UPDATE_FAILED' },
  { scenario: 'NETWORK_INTERRUPT_AFTER_TOKEN', reason: 'F009_PHASE5E_NETWORK_INTERRUPTED_AFTER_TOKEN_INJECTION' },
  { scenario: 'NETWORK_INTERRUPT_AFTER_GATE', reason: 'F009_PHASE5E_NETWORK_INTERRUPTED_AFTER_GATE_UPDATE' },
];
for (const { scenario, reason } of scenarios) {
  const input: CiPartialFailureScenarioInput = { _kind: 'f009_phase5e_ci_partial_failure_scenario_input', scenario, reachedStage: 'TOKEN_INJECTED', environment: 'staging' };
  const r = evaluateCiPartialFailureScenario(input);
  expect(`CI scenario ${scenario} → blocked`, r.blocked === true);
  expect(`CI scenario ${scenario} → specific reason present`, r.blockedReasons.includes(reason as never));
}
const networkInput: CiPartialFailureScenarioInput = { _kind: 'f009_phase5e_ci_partial_failure_scenario_input', scenario: 'NETWORK_INTERRUPT_AFTER_TOKEN', reachedStage: 'TOKEN_INJECTED', environment: 'staging' };
const networkResult = evaluateCiPartialFailureScenario(networkInput);
expect('Network interrupt → orphaned token suspected', networkResult.orphanedTokenSuspected === true);
expect('Network interrupt → SELF_INVALIDATE required', networkResult.requiresSelfInvalidate === true);
expect('Network interrupt → ORPHANED_TOKEN_DETECTED reason', networkResult.blockedReasons.includes('F009_PHASE5E_ORPHANED_TOKEN_DETECTED'));
expect('Network interrupt → SELF_INVALIDATE reason', networkResult.blockedReasons.includes('F009_PHASE5E_SELF_INVALIDATE'));
expect('Malformed CI scenario → default-deny blocked', evaluateCiPartialFailureScenario(null).blocked === true);

// ── Manual approval revalidation / no auto-retry / CI_REVALIDATION_TOKEN ──────
const validToken: CiRevalidationTokenContract = {
  _kind: 'f009_phase5e_ci_revalidation_token_contract', executable: false,
  tokenId: 'reval-tok-1', singleUse: true, authorizesWrite: false,
  issuedAt: NOW, expiresAt: '2026-06-08T01:00:00.000Z', scopedApprovalId: 'approval-2',
};
const validRevalidation: ManualApprovalRevalidationInput = {
  _kind: 'f009_phase5e_manual_approval_revalidation_input',
  isRetryAfterFailure: true, revalidationToken: validToken, freshManualApprovalGranted: true,
  previousApprovalId: 'approval-1', currentApprovalId: 'approval-2',
};
const validRevalResult = evaluateManualApprovalRevalidation(validRevalidation);
expect('Valid revalidation (fresh approval + token) → allowed', validRevalResult.allowed === true);
expect('Revalidation never enables auto-retry', validRevalResult.autoRetryAllowed === false);

const reusedRevalidation: ManualApprovalRevalidationInput = {
  ...validRevalidation, currentApprovalId: 'approval-1', revalidationToken: { ...validToken, scopedApprovalId: 'approval-1' },
};
const reusedResult = evaluateManualApprovalRevalidation(reusedRevalidation);
expect('Reused approval → blocked', reusedResult.allowed === false);
expect('Reused approval → MANUAL_APPROVAL_REVALIDATION_REQUIRED', reusedResult.blockedReasons.includes('F009_PHASE5E_MANUAL_APPROVAL_REVALIDATION_REQUIRED'));
expect('Reused approval → NO_AUTO_RETRY reason present', reusedResult.blockedReasons.includes('F009_PHASE5E_NO_AUTO_RETRY'));

const missingTokenRevalidation: ManualApprovalRevalidationInput = { ...validRevalidation, revalidationToken: null };
expect('Missing CI_REVALIDATION_TOKEN → blocked', evaluateManualApprovalRevalidation(missingTokenRevalidation).blockedReasons.includes('F009_PHASE5E_CI_REVALIDATION_TOKEN_REQUIRED'));

expect('Non-retry path → allowed, autoRetry false', evaluateManualApprovalRevalidation({ ...validRevalidation, isRetryAfterFailure: false }).allowed === true);
expect('Malformed revalidation input → blocked default-deny', evaluateManualApprovalRevalidation(null).allowed === false);

// DEPLOYMENT_ABORTED audit
const abortPayload = buildCanaryDeploymentAbortedAuditPayload({
  deploymentId: 'deploy-1', operatorId: 'op-1', auditTrailId: 'audit-1', reason: 'CI failure', occurredAt: NOW,
});
expect('DEPLOYMENT_ABORTED payload requires fresh approval for retry', abortPayload.requiresFreshApprovalForRetry === true);
expect('DEPLOYMENT_ABORTED payload never authorizes write', abortPayload.authorizesProductionWrite === false);

// ── Observation Mode extreme high-load concurrency (~500 req/s) ──────────────
expect('Simulated high load constant ~500 req/s', SIMULATED_HIGH_LOAD_REQ_PER_SEC === 500);
const highLoadInput: HighLoadSimulationInput = {
  _kind: 'f009_phase5e_high_load_simulation_input', observedReqPerSec: SIMULATED_HIGH_LOAD_REQ_PER_SEC, thresholdReqPerSec: CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC, tenantId: 'tenant-1', occurredAt: NOW,
};
const highLoadResult = evaluateHighLoadConcurrency(highLoadInput);
expect('High load (500 >= 200 threshold) → HALT triggered', highLoadResult.haltTriggered === true);
expect('High load → HALT reason present', highLoadResult.blockedReasons.includes('F009_PHASE5E_HALT'));
expect('High load → threshold-exceeded reason', highLoadResult.blockedReasons.includes('F009_PHASE5E_HIGH_LOAD_THRESHOLD_EXCEEDED'));

const lowLoadInput: HighLoadSimulationInput = { ...highLoadInput, observedReqPerSec: 50 };
expect('Low load below threshold → HALT not triggered', evaluateHighLoadConcurrency(lowLoadInput).haltTriggered === false);
expect('Malformed load input → default-deny HALT', evaluateHighLoadConcurrency(null).haltTriggered === true);

// ── HALT recovery → VersionAlignmentCheck → GATE_RESET ────────────────────────
const alignedCheck: VersionAlignmentCheckInput = { _kind: 'f009_phase5e_version_alignment_check_input', localVersion: 5, remoteVersion: 5, tenantId: 'tenant-1' };
const alignedResult = evaluateVersionAlignmentCheck(alignedCheck);
expect('Version alignment match → aligned + gateResetAllowed', alignedResult.aligned === true && alignedResult.gateResetAllowed === true);

const mismatchCheck: VersionAlignmentCheckInput = { _kind: 'f009_phase5e_version_alignment_check_input', localVersion: 5, remoteVersion: 6, tenantId: 'tenant-1' };
const mismatchResult = evaluateVersionAlignmentCheck(mismatchCheck);
expect('Version alignment mismatch → not aligned, gate reset blocked', mismatchResult.aligned === false && mismatchResult.gateResetAllowed === false);
expect('Version mismatch → VERSION_ALIGNMENT_MISMATCH reason', mismatchResult.blockedReasons.includes('F009_PHASE5E_VERSION_ALIGNMENT_MISMATCH'));

const recoveryAllowed: HaltRecoveryInput = {
  _kind: 'f009_phase5e_halt_recovery_input', emergencyDisable: emergencyOff, versionAlignment: alignedCheck,
};
const recoveryAllowedResult = evaluateHaltRecovery(recoveryAllowed);
expect('HALT recovery: emergency off + aligned → gate reset allowed', recoveryAllowedResult.gateResetAllowed === true);
expect('HALT recovery: emergencyDisableWins false when inactive', recoveryAllowedResult.emergencyDisableWins === false);

const recoveryEmergencyOn: HaltRecoveryInput = {
  _kind: 'f009_phase5e_halt_recovery_input', emergencyDisable: emergencyOn, versionAlignment: alignedCheck,
};
const recoveryEmergencyResult = evaluateHaltRecovery(recoveryEmergencyOn);
expect('HALT recovery: emergency disable wins → gate reset blocked', recoveryEmergencyResult.gateResetAllowed === false && recoveryEmergencyResult.emergencyDisableWins === true);
expect('HALT recovery: emergency disable → priority hook reason', recoveryEmergencyResult.blockedReasons.includes('F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK'));

const recoveryMismatchVersion: HaltRecoveryInput = {
  _kind: 'f009_phase5e_halt_recovery_input', emergencyDisable: emergencyOff, versionAlignment: mismatchCheck,
};
const recoveryMismatchResult = evaluateHaltRecovery(recoveryMismatchVersion);
expect('HALT recovery: version mismatch → gate reset blocked', recoveryMismatchResult.gateResetAllowed === false);
expect('HALT recovery: version mismatch → requires alignment reason', recoveryMismatchResult.blockedReasons.includes('F009_PHASE5E_HALT_RECOVERY_REQUIRES_VERSION_ALIGNMENT'));

expect('Malformed HALT recovery input → default-deny blocked', evaluateHaltRecovery(null).gateResetAllowed === false);

// ── Concurrent reset+apply / emergency-disable+observation / expiry+apply ────
const concurrentRA: ConcurrentResetApplyInput = {
  _kind: 'f009_phase5e_concurrent_reset_apply_input',
  resetAttempt: attempt('RESET', 'reset-actor', 3), applyAttempt: attempt('APPLY', 'apply-actor', 3),
  currentVersion: 3, emergencyDisable: emergencyOff,
};
const raResult = evaluateCanaryConcurrentResetApply(concurrentRA);
expect('Concurrent reset+apply same version → HALT', raResult.outcome === 'HALT');
expect('Concurrent reset+apply → CONCURRENT_RESET_APPLY_CONFLICT', raResult.blockedReasons.includes('F009_PHASE5E_CONCURRENT_RESET_APPLY_CONFLICT'));
expect('Concurrent reset+apply never authorizes write', raResult.authorizesProductionWrite === false);

const concurrentRAEmergency: ConcurrentResetApplyInput = { ...concurrentRA, emergencyDisable: emergencyOn };
const raEmergencyResult = evaluateCanaryConcurrentResetApply(concurrentRAEmergency);
expect('Concurrent reset+apply with emergency disable → blocked by priority hook', raEmergencyResult.outcome === 'BLOCKED' && raEmergencyResult.blockedReasons.includes('F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK'));

const concurrentED: ConcurrentEmergencyDisableObservationInput = {
  _kind: 'f009_phase5e_concurrent_emergency_disable_observation_input',
  emergencyDisable: emergencyOn, observationAttempt: attempt('OBSERVATION_EXPIRY', 'obs-actor', 1),
};
const edResult = evaluateCanaryConcurrentEmergencyDisableObservation(concurrentED);
expect('Concurrent emergency-disable+observation → emergency wins', edResult.emergencyDisableWins === true);
expect('Observation can never override emergency disable', edResult.observationModeCanOverrideEmergencyDisable === false);

const concurrentEDOff: ConcurrentEmergencyDisableObservationInput = { ...concurrentED, emergencyDisable: emergencyOff };
expect('Emergency disable off → does not win', evaluateCanaryConcurrentEmergencyDisableObservation(concurrentEDOff).emergencyDisableWins === false);

const expiryApplyOpenWindow: ConcurrentExpiryApplyInput = {
  _kind: 'f009_phase5e_concurrent_expiry_apply_input',
  observationPresent: true, observationExpiresAtSec: Date.parse(NOW) / 1000 + 600,
  nowSec: Date.parse(NOW) / 1000, applyAttempt: attempt('APPLY', 'apply-actor', 1), emergencyDisable: emergencyOff,
};
const expiryOpenResult = evaluateCanaryConcurrentExpiryApply(expiryApplyOpenWindow);
expect('Expiry+apply: window open, no emergency → proceed single winner (no auth)', expiryOpenResult.outcome === 'PROCEED_SINGLE_WINNER' && expiryOpenResult.authorizesProductionWrite === false);

const expiryApplyExpired: ConcurrentExpiryApplyInput = {
  ...expiryApplyOpenWindow, observationExpiresAtSec: Date.parse(NOW) / 1000 - 10,
};
expect('Expiry+apply: expired window → BLOCKED', evaluateCanaryConcurrentExpiryApply(expiryApplyExpired).outcome === 'BLOCKED');

const expiryApplyEmergency: ConcurrentExpiryApplyInput = { ...expiryApplyOpenWindow, emergencyDisable: emergencyOn };
const expiryEmergencyResult = evaluateCanaryConcurrentExpiryApply(expiryApplyEmergency);
expect('Expiry+apply with emergency disable → blocked by priority hook', expiryEmergencyResult.outcome === 'BLOCKED' && expiryEmergencyResult.blockedReasons.includes('F009_PHASE5E_EMERGENCY_DISABLE_PRIORITY_HOOK'));

expect('Malformed concurrent reset+apply → HALT', evaluateCanaryConcurrentResetApply(null).outcome === 'HALT');
expect('Malformed concurrent expiry+apply → HALT', evaluateCanaryConcurrentExpiryApply(null).outcome === 'HALT');

// ── Emergency Disable as highest-priority hook ────────────────────────────────
for (const pathName of ['APPLY', 'RESET', 'OBSERVATION', 'CANARY_DRY_RUN'] as const) {
  const onCheck: EmergencyDisablePriorityCheckInput = { _kind: 'f009_phase5e_emergency_disable_priority_check_input', emergencyDisable: emergencyOn, pathName };
  const offCheck: EmergencyDisablePriorityCheckInput = { _kind: 'f009_phase5e_emergency_disable_priority_check_input', emergencyDisable: emergencyOff, pathName };
  expect(`Priority hook ${pathName}: emergency on → wins + path blocked`, checkEmergencyDisablePriority(onCheck).emergencyDisableWins === true && checkEmergencyDisablePriority(onCheck).pathBlocked === true);
  expect(`Priority hook ${pathName}: emergency off → does not win`, checkEmergencyDisablePriority(offCheck).emergencyDisableWins === false);
}
expect('Priority hook: missing emergency contract → default to wins (safest)', checkEmergencyDisablePriority({ _kind: 'f009_phase5e_emergency_disable_priority_check_input', emergencyDisable: null, pathName: 'APPLY' }).emergencyDisableWins === true);
expect('Priority hook: malformed input → default-deny wins', checkEmergencyDisablePriority(null).emergencyDisableWins === true);

// ── Load simulation aggregator ────────────────────────────────────────────────
const sim = summarizeCanaryLoadSimulation([raResult, raEmergencyResult, expiryOpenResult]);
expect('Load simulation summary structurally sound', sim.totalAttempts === 3 && sim.noUnsafeWinners === true && sim.atMostOneWinnerPerRound === true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`canaryManager.test.ts: ${fail} assertion(s) failed`);
