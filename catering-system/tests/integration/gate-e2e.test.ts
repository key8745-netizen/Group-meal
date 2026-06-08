/**
 * gate-e2e.test.ts
 *
 * Feature 009 Phase 5D: Integration-style end-to-end gate scenario coverage.
 *
 * Pure-logic, non-executable scenario chains exercising the Phase 5D
 * deployment-gate-recovery and concurrency-manager contracts together, as
 * they would be invoked in sequence during a real (but never-executed) CI
 * pipeline run. NO real CI, Firestore, or production write occurs anywhere
 * in this file — every step is a pure function call over modeled data.
 */

import {
  evaluateCiInterruption,
  detectOrphanedToken,
  evaluateTokenGateCrossState,
  evaluateDeploymentAbortScenario,
  evaluateRetryRequiresFreshApproval,
  evaluateGateStaleness,
  buildDeploymentAbortedAuditPayload,
  buildSelfInvalidateAuditPayload,
  buildGateAutoInvalidateAuditPayload,
} from '../../src/services/realModelConfigApplyDeploymentGateRecoveryService';
import {
  resolveVersionConflict,
  evaluateConcurrentResetApply,
  evaluateConcurrentEmergencyDisableObservation,
  evaluateConcurrentExpiryApply,
  classifyObservationFlag,
  type VersionedOperationAttempt,
} from '../../src/services/concurrencyManager';
import { buildObservationModeState, type ObservationModeState } from '../../src/services/realModelConfigApplyObservationModeService';
import { buildSecurityAlertPayload } from '../../src/services/securityAudit';
import type { EmergencyDisableContract } from '../../src/services/realModelConfigApplyProductionGateService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5D: gate-e2e integration scenarios ---');

const NOW = '2026-06-08T00:30:00.000Z';

// ── Scenario 1: CI interrupted after token injection → orphan → SELF_INVALIDATE ──
{
  const interruption = evaluateCiInterruption({
    _kind: 'f009_phase5d_ci_interruption_input', reachedStage: 'TOKEN_INJECTED', interrupted: true,
  });
  expect('Scenario 1: CI interruption detected and blocked', interruption.blocked === true);
  expect('Scenario 1: orphan token suspected after token-injection interruption', interruption.orphanedTokenSuspected === true);

  const orphan = detectOrphanedToken({
    _kind: 'f009_phase5d_orphaned_token_candidate',
    tokenId: 'tok-e2e-1', gateRecordMissing: true, gateRecordTokenMismatch: false, ciRunTerminated: true,
    issuedAt: '2026-06-08T00:00:00.000Z', now: NOW, staleAfterSeconds: 600,
  });
  expect('Scenario 1: orphaned token detected', orphan.isOrphaned === true);
  expect('Scenario 1: orphaned token self-invalidates', orphan.selfInvalidate === true);

  const selfInvalidatePayload = buildSelfInvalidateAuditPayload({
    tokenId: 'tok-e2e-1', auditTrailId: 'audit-e2e-1', detectedAt: NOW,
    reason: 'CI interrupted after token injection; gate record missing and CI run terminated',
  });
  expect('Scenario 1: SELF_INVALIDATE audit payload complete', selfInvalidatePayload.eventType === 'SELF_INVALIDATE' && selfInvalidatePayload.tokenRemainsUsable === false);

  const alert = buildSecurityAlertPayload({
    deploymentId: 'deploy-e2e-1', operatorId: 'op-e2e-1', systemState: 'ORPHANED_TOKEN_SELF_INVALIDATED',
    errorType: 'F009_PHASE5D_SELF_INVALIDATE', auditTrailId: 'audit-e2e-1', occurredAt: Date.parse(NOW),
  });
  expect('Scenario 1: security alert builds for orphan self-invalidation', alert.ok === true);
}

// ── Scenario 2: Token injected, gate update fails → BLOCKED → DEPLOYMENT_ABORTED ──
{
  const crossState = evaluateTokenGateCrossState({
    _kind: 'f009_phase5d_token_gate_cross_state_input',
    tokenInjected: true, tokenValid: true, tokenExpiredMidFlow: false,
    gateUpdateAttempted: true, gateUpdateSucceeded: false,
  });
  expect('Scenario 2: token-injected/gate-update-failed BLOCKED', crossState.blocked === true && crossState.outcome === 'TOKEN_INJECTED_GATE_UPDATE_FAILED');

  const abort = evaluateDeploymentAbortScenario({
    _kind: 'f009_phase5d_deployment_abort_scenario_input',
    manualApprovalGranted: true, approvalId: 'appr-e2e-2', deploymentSucceeded: false,
    deploymentId: 'deploy-e2e-2', operatorId: 'op-e2e-2', auditTrailId: 'audit-e2e-2',
  });
  expect('Scenario 2: deployment aborted', abort.aborted === true);

  const abortPayload = buildDeploymentAbortedAuditPayload({
    deploymentId: 'deploy-e2e-2', operatorId: 'op-e2e-2', approvalId: 'appr-e2e-2',
    auditTrailId: 'audit-e2e-2', reason: 'gate update failed after token injection', occurredAt: NOW,
  });
  expect('Scenario 2: DEPLOYMENT_ABORTED audit complete', abortPayload.eventType === 'DEPLOYMENT_ABORTED' && abortPayload.requiresFreshApprovalForRetry === true);

  // Retry without a fresh approval must be blocked.
  const retryBlocked = evaluateRetryRequiresFreshApproval({
    _kind: 'f009_phase5d_retry_attempt_input', isRetry: true, freshApprovalRequiredForScope: true,
    previousApprovalId: 'appr-e2e-2', currentApprovalId: 'appr-e2e-2', freshApprovalGranted: false,
  });
  expect('Scenario 2: retry without fresh approval blocked', retryBlocked.allowed === false);

  // Retry WITH a fresh approval is allowed (still requires the rest of the flow to pass).
  const retryAllowed = evaluateRetryRequiresFreshApproval({
    _kind: 'f009_phase5d_retry_attempt_input', isRetry: true, freshApprovalRequiredForScope: true,
    previousApprovalId: 'appr-e2e-2', currentApprovalId: 'appr-e2e-2-fresh', freshApprovalGranted: true,
  });
  expect('Scenario 2: retry with fresh approval allowed to proceed', retryAllowed.allowed === true);
}

// ── Scenario 3: Gate updated but token invalid → BLOCKED ─────────────────────
{
  const crossState = evaluateTokenGateCrossState({
    _kind: 'f009_phase5d_token_gate_cross_state_input',
    tokenInjected: true, tokenValid: false, tokenExpiredMidFlow: false,
    gateUpdateAttempted: true, gateUpdateSucceeded: true,
  });
  expect('Scenario 3: gate-updated/token-invalid BLOCKED', crossState.blocked === true && crossState.outcome === 'GATE_UPDATED_TOKEN_INVALID');
  expect('Scenario 3: token must be invalidated', crossState.invalidateToken === true);
}

// ── Scenario 4: Token expires mid-flow → BLOCKED ─────────────────────────────
{
  const crossState = evaluateTokenGateCrossState({
    _kind: 'f009_phase5d_token_gate_cross_state_input',
    tokenInjected: true, tokenValid: true, tokenExpiredMidFlow: true,
    gateUpdateAttempted: true, gateUpdateSucceeded: true,
  });
  expect('Scenario 4: token expired mid-flow BLOCKED', crossState.blocked === true && crossState.outcome === 'TOKEN_EXPIRED_MID_FLOW');
}

// ── Scenario 5: Stale gate (>30min, never reaches ENABLED) → GATE_AUTO_INVALIDATE ──
{
  const staleness = evaluateGateStaleness({
    _kind: 'f009_phase5d_gate_staleness_input',
    gateCreatedAt: '2026-06-08T00:00:00.000Z', now: '2026-06-08T00:35:00.000Z', reachedEnabled: false,
  });
  expect('Scenario 5: stale gate auto-invalidates', staleness.autoInvalidate === true);

  const payload = buildGateAutoInvalidateAuditPayload({
    gateId: 'gate-e2e-5', tenantId: 'tenant-e2e-5', auditTrailId: 'audit-e2e-5',
    gateCreatedAt: '2026-06-08T00:00:00.000Z', invalidatedAt: '2026-06-08T00:35:00.000Z',
    reason: 'gate did not reach ENABLED within 30 minutes',
  });
  expect('Scenario 5: GATE_AUTO_INVALIDATE audit complete and fail-closed', payload.eventType === 'GATE_AUTO_INVALIDATE' && payload.failedClosed === true);
}

// ── Scenario 6: Concurrent reset+apply race against observation-governed state ──
{
  function attempt(kind: VersionedOperationAttempt['kind'], actorId: string, expectedVersion: number): VersionedOperationAttempt {
    return { _kind: 'f009_phase5d_versioned_operation_attempt', kind, actorId, expectedVersion, attemptedAt: NOW };
  }

  const raceResult = evaluateConcurrentResetApply({
    _kind: 'f009_phase5d_concurrent_reset_apply_input',
    resetAttempt: attempt('RESET', 'reset-actor-e2e', 5),
    applyAttempt: attempt('APPLY', 'apply-actor-e2e', 5),
    currentVersion: 5,
  });
  expect('Scenario 6: concurrent reset+apply same version → HALT (safe)', raceResult.outcome === 'HALT');
  expect('Scenario 6: never authorizes a write', raceResult.authorizesProductionWrite === false);

  const versionConflict = resolveVersionConflict({
    _kind: 'f009_phase5d_version_conflict_check_input',
    currentVersion: 5,
    attempts: [attempt('APPLY', 'apply-actor-e2e', 4)],
  });
  expect('Scenario 6: stale version attempt → CONCURRENCY_VIOLATION/BLOCKED', versionConflict.outcome === 'BLOCKED' && versionConflict.blockedReasons.includes('F009_PHASE5D_CONCURRENCY_VIOLATION_ERR'));
}

// ── Scenario 7: Concurrent emergency disable + observation mode — ED always wins ──
{
  const emergencyOn: EmergencyDisableContract = {
    _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
    active: true, disabledBy: 'op-e2e-7', reason: 'incident', disabledAt: NOW, auditTrailId: 'audit-e2e-7',
  };
  const result = evaluateConcurrentEmergencyDisableObservation({
    _kind: 'f009_phase5d_concurrent_emergency_disable_observation_input',
    emergencyDisable: emergencyOn,
    observationAttempt: { _kind: 'f009_phase5d_versioned_operation_attempt', kind: 'OBSERVATION_EXPIRY', actorId: 'obs-e2e-7', expectedVersion: 1, attemptedAt: NOW },
  });
  expect('Scenario 7: emergency disable wins over observation mode', result.emergencyDisableWins === true);
  expect('Scenario 7: observation mode structurally cannot override emergency disable', result.observationModeCanOverrideEmergencyDisable === false);
}

// ── Scenario 8: Concurrent observation expiry + apply attempt race ───────────
{
  const state: ObservationModeState = buildObservationModeState({ triggeringResetAuditTrailId: 'audit-reset-e2e-8', startedAt: '2026-06-08T00:00:00.000Z', version: 1 });
  const result = evaluateConcurrentExpiryApply({
    _kind: 'f009_phase5d_concurrent_expiry_apply_input',
    observationState: state,
    now: state.expiresAt,
    applyAttempt: { _kind: 'f009_phase5d_versioned_operation_attempt', kind: 'APPLY', actorId: 'apply-e2e-8', expectedVersion: 1, attemptedAt: NOW },
  });
  expect('Scenario 8: apply attempted exactly at expiry boundary → BLOCKED (no sneak-through)', result.outcome === 'BLOCKED');
  expect('Scenario 8: expired-flag classification confirms BLOCKED', classifyObservationFlag({ state, now: state.expiresAt }).blocked === true);
}

// ── Scenario 9: Missing / malformed / stale observation flags → BLOCKED ──────
{
  expect('Scenario 9: missing flag → BLOCKED', classifyObservationFlag({ state: null, now: NOW }).blocked === true);
  expect('Scenario 9: malformed flag → BLOCKED', classifyObservationFlag({
    state: { ...buildObservationModeState({ triggeringResetAuditTrailId: 'a', startedAt: NOW, version: 0 }), expiresAt: 'not-a-date' },
    now: NOW,
  }).blocked === true);
}

// ── Scenario 10: Production readiness boundary — confirm no write path ───────
{
  expect('Scenario 10: deployment gate recovery results never set executable true',
    [evaluateCiInterruption({ _kind: 'f009_phase5d_ci_interruption_input', reachedStage: 'TOKEN_INJECTED', interrupted: true })]
      .every((r) => r.executable === false && r.aiCanExecute === false));
  expect('Scenario 10: concurrency manager results never set executable true',
    [resolveVersionConflict(null)].every((r) => r.executable === false && r.aiCanExecute === false));
}

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5D gate-e2e integration (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
