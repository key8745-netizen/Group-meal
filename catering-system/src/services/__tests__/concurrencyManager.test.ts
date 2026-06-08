import {
  resolveVersionConflict,
  evaluateConcurrentResetApply,
  evaluateConcurrentEmergencyDisableObservation,
  evaluateConcurrentExpiryApply,
  classifyObservationFlag,
  buildConcurrencyMonitoringPayload,
  summarizeLoadSimulation,
  type VersionedOperationAttempt,
  type VersionConflictCheckInput,
  type ConcurrentResetApplyInput,
  type ConcurrentEmergencyDisableObservationInput,
  type ConcurrentExpiryApplyInput,
} from '../concurrencyManager';
import { buildObservationModeState, type ObservationModeState } from '../realModelConfigApplyObservationModeService';
import type { EmergencyDisableContract } from '../realModelConfigApplyProductionGateService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5D: Concurrency Manager ---');

const NOW = '2026-06-08T00:05:00.000Z';

const emergencyOff: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: false, disabledBy: '', reason: '', disabledAt: '', auditTrailId: '',
};
const emergencyOn: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: true, disabledBy: 'op-1', reason: 'incident', disabledAt: NOW, auditTrailId: 'audit-em-1',
};

function attempt(kind: VersionedOperationAttempt['kind'], actorId: string, expectedVersion: number): VersionedOperationAttempt {
  return { _kind: 'f009_phase5d_versioned_operation_attempt', kind, actorId, expectedVersion, attemptedAt: NOW };
}

// ── Version conflict resolution (optimistic locking) ─────────────────────────
const singleWinnerInput: VersionConflictCheckInput = {
  _kind: 'f009_phase5d_version_conflict_check_input',
  currentVersion: 3,
  attempts: [attempt('APPLY', 'actor-a', 3), attempt('RESET', 'actor-b', 2)],
};
const sw = resolveVersionConflict(singleWinnerInput);
expect('Version conflict: single matching winner proceeds', sw.outcome === 'PROCEED_SINGLE_WINNER' && sw.winnerActorId === 'actor-a');
expect('Version conflict: stale attempt reported', sw.blockedReasons.includes('F009_PHASE5D_VERSION_CONFLICT'));

const allStale: VersionConflictCheckInput = {
  _kind: 'f009_phase5d_version_conflict_check_input',
  currentVersion: 5,
  attempts: [attempt('APPLY', 'actor-a', 3), attempt('RESET', 'actor-b', 2)],
};
const allStaleResult = resolveVersionConflict(allStale);
expect('Version conflict: all-stale → BLOCKED', allStaleResult.outcome === 'BLOCKED');
expect('Version conflict: all-stale → CONCURRENCY_VIOLATION', allStaleResult.blockedReasons.includes('F009_PHASE5D_CONCURRENCY_VIOLATION'));
expect('Version conflict: all-stale → CONCURRENCY_VIOLATION_ERR', allStaleResult.blockedReasons.includes('F009_PHASE5D_CONCURRENCY_VIOLATION_ERR'));

const raceSameVersion: VersionConflictCheckInput = {
  _kind: 'f009_phase5d_version_conflict_check_input',
  currentVersion: 4,
  attempts: [attempt('APPLY', 'actor-a', 4), attempt('RESET', 'actor-b', 4)],
};
const raceResult = resolveVersionConflict(raceSameVersion);
expect('Version conflict: simultaneous matching attempts → HALT', raceResult.outcome === 'HALT');
expect('Version conflict: HALT reason present', raceResult.blockedReasons.includes('F009_PHASE5D_CONCURRENCY_HALT'));

expect('Version conflict: malformed input → HALT', resolveVersionConflict(null).outcome === 'HALT');
expect('Version conflict: never authorizes write', sw.authorizesProductionWrite === false && allStaleResult.authorizesProductionWrite === false && raceResult.authorizesProductionWrite === false);
expect('Version conflict: never overrides emergency disable', sw.overridesEmergencyDisable === false);

// ── Concurrent reset + apply ──────────────────────────────────────────────────
const concurrentRA: ConcurrentResetApplyInput = {
  _kind: 'f009_phase5d_concurrent_reset_apply_input',
  resetAttempt: attempt('RESET', 'reset-actor', 2),
  applyAttempt: attempt('APPLY', 'apply-actor', 2),
  currentVersion: 2,
};
const raResult = evaluateConcurrentResetApply(concurrentRA);
expect('Concurrent reset+apply same version → HALT', raResult.outcome === 'HALT');
expect('Concurrent reset+apply reason present', raResult.blockedReasons.includes('F009_PHASE5D_CONCURRENT_RESET_APPLY_CONFLICT'));

const divergentRA: ConcurrentResetApplyInput = {
  _kind: 'f009_phase5d_concurrent_reset_apply_input',
  resetAttempt: attempt('RESET', 'reset-actor', 1),
  applyAttempt: attempt('APPLY', 'apply-actor', 2),
  currentVersion: 2,
};
const divergentResult = evaluateConcurrentResetApply(divergentRA);
expect('Concurrent reset+apply divergent versions → BLOCKED', divergentResult.outcome === 'BLOCKED');
expect('Concurrent reset+apply divergent → version conflict reported', divergentResult.blockedReasons.includes('F009_PHASE5D_VERSION_CONFLICT'));

expect('Concurrent reset+apply malformed input → HALT', evaluateConcurrentResetApply(null).outcome === 'HALT');
expect('Concurrent reset+apply never authorizes write', raResult.authorizesProductionWrite === false);

// ── Concurrent emergency disable + observation mode ──────────────────────────
const concurrentED: ConcurrentEmergencyDisableObservationInput = {
  _kind: 'f009_phase5d_concurrent_emergency_disable_observation_input',
  emergencyDisable: emergencyOn,
  observationAttempt: attempt('OBSERVATION_EXPIRY', 'obs-actor', 1),
};
const edResult = evaluateConcurrentEmergencyDisableObservation(concurrentED);
expect('Concurrent emergency disable wins over observation mode', edResult.emergencyDisableWins === true);
expect('Observation mode can never override emergency disable (structural)', edResult.observationModeCanOverrideEmergencyDisable === false);
expect('Concurrent ED+OBS conflict reason present', edResult.blockedReasons.includes('F009_PHASE5D_CONCURRENT_EMERGENCY_DISABLE_CONFLICT'));
expect('Concurrent ED+OBS override-block reason present', edResult.blockedReasons.includes('F009_PHASE5D_OBSERVATION_MODE_CANNOT_OVERRIDE_EMERGENCY_DISABLE'));

const noEmergency: ConcurrentEmergencyDisableObservationInput = { ...concurrentED, emergencyDisable: emergencyOff };
const noEmResult = evaluateConcurrentEmergencyDisableObservation(noEmergency);
expect('When emergency disable inactive, observation may proceed under own rules', noEmResult.emergencyDisableWins === false);
expect('observationModeCanOverrideEmergencyDisable always false even when ED inactive', noEmResult.observationModeCanOverrideEmergencyDisable === false);

expect('Malformed concurrent ED+OBS input defaults to ED-wins (safest)', evaluateConcurrentEmergencyDisableObservation(null).emergencyDisableWins === true);

// ── Concurrent observation expiry + apply attempt race ───────────────────────
const activeState = buildObservationModeState({ triggeringResetAuditTrailId: 'audit-reset-1', startedAt: '2026-06-08T00:00:00.000Z', version: 1 });
const expiredState: ObservationModeState = { ...activeState, status: 'EXPIRED' };

const expiryRaceActive: ConcurrentExpiryApplyInput = {
  _kind: 'f009_phase5d_concurrent_expiry_apply_input',
  observationState: activeState,
  now: '2026-06-08T00:01:00.000Z',
  applyAttempt: attempt('APPLY', 'apply-actor', 1),
};
const activeRaceResult = evaluateConcurrentExpiryApply(expiryRaceActive);
expect('Expiry race: window still open → no race-block (single winner reported)', activeRaceResult.outcome === 'PROCEED_SINGLE_WINNER');
expect('Expiry race: window-open never authorizes write directly', activeRaceResult.authorizesProductionWrite === false);

const expiryRaceExpired: ConcurrentExpiryApplyInput = {
  _kind: 'f009_phase5d_concurrent_expiry_apply_input',
  observationState: expiredState,
  now: '2026-06-08T00:11:00.000Z',
  applyAttempt: attempt('APPLY', 'apply-actor', 1),
};
const expiredRaceResult = evaluateConcurrentExpiryApply(expiryRaceExpired);
expect('Expiry race: expired window → BLOCKED', expiredRaceResult.outcome === 'BLOCKED');
expect('Expiry race: expired reason present', expiredRaceResult.blockedReasons.includes('F009_PHASE5D_OBSERVATION_FLAG_EXPIRED'));

const expiryRaceAtBoundary: ConcurrentExpiryApplyInput = {
  _kind: 'f009_phase5d_concurrent_expiry_apply_input',
  observationState: activeState,
  now: activeState.expiresAt, // exactly at expiry — must be treated as expired
  applyAttempt: attempt('APPLY', 'apply-actor', 1),
};
expect('Expiry race: exact-boundary timing treated as expired (no sneak-through)', evaluateConcurrentExpiryApply(expiryRaceAtBoundary).outcome === 'BLOCKED');

expect('Expiry race: missing observation state → BLOCKED', evaluateConcurrentExpiryApply({
  _kind: 'f009_phase5d_concurrent_expiry_apply_input', observationState: null, now: NOW, applyAttempt: attempt('APPLY', 'a', 1),
}).outcome === 'BLOCKED');
expect('Expiry race: malformed input → HALT', evaluateConcurrentExpiryApply(null).outcome === 'HALT');

// ── Stale / missing / malformed / expired flag classification ────────────────
expect('Missing flag → BLOCKED/MISSING', classifyObservationFlag({ state: null, now: NOW }).classification === 'MISSING' && classifyObservationFlag({ state: null, now: NOW }).blocked === true);
expect('Malformed flag → BLOCKED/MALFORMED', classifyObservationFlag({ state: { ...activeState, version: -1 }, now: NOW }).classification === 'MALFORMED');
expect('Expired flag → BLOCKED/EXPIRED', classifyObservationFlag({ state: expiredState, now: NOW }).classification === 'EXPIRED');

const staleState: ObservationModeState = {
  ...activeState,
  startedAt: '2026-06-01T00:00:00.000Z',
  expiresAt: '2026-06-01T00:10:00.000Z',
  status: 'ACTIVE',
};
const staleClassification = classifyObservationFlag({ state: staleState, now: NOW });
// staleState has already expired by NOW (2026-06-08), so classification is EXPIRED first per priority — verify it's blocked either way
expect('Old/expired-by-clock flag is BLOCKED', staleClassification.blocked === true);

const genuinelyStale: ObservationModeState = {
  ...activeState,
  startedAt: '2026-06-01T00:00:00.000Z',
  expiresAt: '2026-08-01T00:00:00.000Z', // far future expiry but started long ago — "stale data"
};
const staleResult2 = classifyObservationFlag({ state: genuinelyStale, now: NOW });
expect('Stale (long-running) flag classified and blocked', staleResult2.classification === 'STALE' && staleResult2.blocked === true);
expect('Stale flag reason present', staleResult2.blockedReasons.includes('F009_PHASE5D_OBSERVATION_FLAG_STALE'));

const validState: ObservationModeState = buildObservationModeState({ triggeringResetAuditTrailId: 'audit-reset-2', startedAt: '2026-06-08T00:00:00.000Z', version: 1 });
const validClassification = classifyObservationFlag({ state: validState, now: '2026-06-08T00:01:00.000Z' });
expect('Valid flag within window classified VALID and not blocked', validClassification.classification === 'VALID' && validClassification.blocked === false);

// ── Monitoring payload for concurrency failures ──────────────────────────────
const monitoringPayload = buildConcurrencyMonitoringPayload({
  outcome: 'HALT', tenantId: 'tenant-1', observationModeVersion: 2,
  blockedReasons: ['F009_PHASE5D_CONCURRENCY_VIOLATION', 'F009_PHASE5D_CONCURRENCY_HALT'],
  occurredAt: NOW,
});
expect('Monitoring payload eventType correct', monitoringPayload.eventType === 'CONCURRENCY_FAILURE');
expect('Monitoring payload outcome present', monitoringPayload.outcome === 'HALT');
expect('Monitoring payload tenantId present', monitoringPayload.tenantId === 'tenant-1');
expect('Monitoring payload observationModeVersion present', monitoringPayload.observationModeVersion === 2);
expect('Monitoring payload blockedReasons non-empty', monitoringPayload.blockedReasons.length > 0);
expect('Monitoring payload never authorizes write', monitoringPayload.authorizesProductionWrite === false);
expect('Monitoring payload never overrides emergency disable', monitoringPayload.overridesEmergencyDisable === false);
expect('Monitoring payload non-executable', monitoringPayload.executable === false);

// ── Load / concurrency simulation acceptance ─────────────────────────────────
const simResults = [sw, allStaleResult, raceResult, raResult, divergentResult, activeRaceResult, expiredRaceResult];
const simSummary = summarizeLoadSimulation(simResults);
expect('Load simulation: total attempts matches input', simSummary.totalAttempts === simResults.length);
expect('Load simulation: no unsafe winners', simSummary.noUnsafeWinners === true);
expect('Load simulation: at most one winner per round', simSummary.atMostOneWinnerPerRound === true);
expect('Load simulation: counts add up', (simSummary.haltedCount + simSummary.blockedCount + simSummary.singleWinnerCount) === simSummary.totalAttempts);

// ── Observation mode does not override emergency disable / does not enable production write ──
expect('Structural: no concurrency result type ever sets authorizesProductionWrite true', simResults.every((r) => r.authorizesProductionWrite === false));
expect('Structural: no concurrency result type ever sets overridesEmergencyDisable true', simResults.every((r) => r.overridesEmergencyDisable === false));

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5D Concurrency Manager (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
