/**
 * Feature 009 Phase 5C: Observation Mode tests
 * Pure runner — no test framework. npx tsx from repo root.
 */
import {
  evaluateObservationMode,
  buildObservationModeState,
  evaluateObservationModeConcurrency,
  buildObservationModeMonitoringPayload,
  OBSERVATION_MODE_DURATION_SECONDS,
} from '../realModelConfigApplyObservationModeService';
import {
  buildEmergencyDisableContract,
} from '../realModelConfigApplyProductionGateService';
import type { ObservationModeState, ObservationModeConcurrentMutationAttempt } from '../realModelConfigApplyObservationModeService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5C: Observation Mode ===\n');

const startedAt = '2026-06-08T12:00:00Z';
const within = '2026-06-08T12:05:00Z';
const after = '2026-06-08T12:11:00Z';

console.log('[Creation + expiry]\n');

const state = buildObservationModeState({ triggeringResetAuditTrailId: 'audit-reset-tx-1', startedAt });
expect('post-reset observation mode created', state.present === true && state._kind === 'f009_phase5c_observation_mode_state');
expect('observation mode has explicit expiry (10 minutes)', new Date(state.expiresAt).getTime() - new Date(state.startedAt).getTime() === OBSERVATION_MODE_DURATION_SECONDS * 1000);
expect('observation mode duration constant is 600 seconds', OBSERVATION_MODE_DURATION_SECONDS === 600);
expect('observation mode structurally cannot enable production writes', state.canEnableProductionWrites === false);

console.log('\n[Active / expired evaluation]\n');

const e1 = evaluateObservationMode({ state, now: within, emergencyDisable: null });
expect('observation mode active within window', e1.active === true);
expect('observation mode payload complete (active eval)', e1._kind === 'f009_phase5c_observation_mode_evaluation_result');

const e2 = evaluateObservationMode({ state, now: after, emergencyDisable: null });
expect('observation mode expired after 10 minutes', e2.active === false && e2.blockedReasons.includes('F009_PHASE5C_OBSERVATION_MODE_EXPIRED'));

console.log('\n[Default-deny on missing/malformed]\n');

const e3 = evaluateObservationMode({ state: null, now: within, emergencyDisable: null });
expect('observation mode missing state BLOCKED if required', e3.blockedReasons.includes('F009_PHASE5C_OBSERVATION_MODE_MISSING_STATE') && e3.active === false);

const malformed: ObservationModeState = { ...state, expiresAt: 'not-a-date' };
const e4 = evaluateObservationMode({ state: malformed, now: within, emergencyDisable: null });
expect('observation mode malformed state BLOCKED', e4.blockedReasons.includes('F009_PHASE5C_OBSERVATION_MODE_MALFORMED_STATE'));

const malformed2: ObservationModeState = { ...state, expiresAt: '2026-06-08T12:20:00Z' }; // not exactly +10m
const e5 = evaluateObservationMode({ state: malformed2, now: within, emergencyDisable: null });
expect('observation mode with non-explicit (wrong) expiry BLOCKED as malformed', e5.blockedReasons.includes('F009_PHASE5C_OBSERVATION_MODE_MALFORMED_STATE'));

const e6 = evaluateObservationMode({ state: { ...state, status: 'BOGUS' as any }, now: within, emergencyDisable: null });
expect('observation mode failure default-deny (bogus status)', e6.active === false && e6.blockedReasons.length > 0);

console.log('\n[Bypass-channel guard]\n');

const e7 = evaluateObservationMode({ state, now: within, emergencyDisable: null, requestedToAuthorizeWrite: true });
expect('observation mode cannot be used to authorize a write', e7.blockedReasons.includes('F009_PHASE5C_OBSERVATION_MODE_CANNOT_ENABLE_PRODUCTION_WRITE'));
expect('observation mode never authorizes production write (structural)', e7.authorizesProductionWrite === false);
expect('observation mode does not enable production write by itself (active path too)', e1.authorizesProductionWrite === false);

console.log('\n[Emergency disable override]\n');

const emergency = buildEmergencyDisableContract({ disabledBy: 'admin-x', reason: 'incident', disabledAt: within, auditTrailId: 'audit-emerg-1' });
const e8 = evaluateObservationMode({ state, now: within, emergencyDisable: emergency });
expect('observation mode does not override emergency disable', e8.overriddenByEmergencyDisable === true && e8.active === false);
expect('emergency disable override blocked reason present', e8.blockedReasons.includes('F009_PHASE5C_OBSERVATION_MODE_OVERRIDDEN_BY_EMERGENCY_DISABLE'));
expect('emergency disable overrides observation mode reason present', e8.blockedReasons.includes('F009_PHASE5C_EMERGENCY_DISABLE_OVERRIDES_OBSERVATION_MODE'));

console.log('\n[High-concurrency edge cases]\n');

const attempt = (id: string, v: number, actor: string): ObservationModeConcurrentMutationAttempt => ({
  _kind: 'f009_phase5c_observation_mode_concurrent_mutation_attempt', attemptId: id, expectedVersion: v, actorId: actor,
});

const c1 = evaluateObservationModeConcurrency({ currentVersion: 0, attempts: [attempt('a1', 0, 'op-a')] });
expect('single concurrent attempt with correct version wins', c1.winningAttemptId === 'a1' && c1.blockedAttemptIds.length === 0);

const c2 = evaluateObservationModeConcurrency({ currentVersion: 0, attempts: [attempt('a1', 0, 'op-a'), attempt('a2', 0, 'op-b')] });
expect('high-concurrency true race on same version → both blocked, ambiguous default-deny', c2.winningAttemptId === null && c2.blockedAttemptIds.includes('a1') && c2.blockedAttemptIds.includes('a2'));
expect('concurrency conflict reason present', c2.blockedReasons.includes('F009_PHASE5C_OBSERVATION_MODE_CONCURRENCY_CONFLICT'));

const c3 = evaluateObservationModeConcurrency({ currentVersion: 1, attempts: [attempt('a1', 0, 'op-a'), attempt('a2', 1, 'op-b')] });
expect('stale-version attempt blocked, current-version attempt wins', c3.winningAttemptId === 'a2' && c3.blockedAttemptIds.includes('a1'));

console.log('\n[Monitoring payload]\n');

const monitoring = buildObservationModeMonitoringPayload({ state, evaluation: e1, observedAt: within });
expect('observation mode payload complete', monitoring._kind === 'f009_phase5c_observation_mode_monitoring_payload' && monitoring.triggeringResetAuditTrailId === 'audit-reset-tx-1' && monitoring.durationSeconds === OBSERVATION_MODE_DURATION_SECONDS);
expect('monitoring payload non-executable / aiCanExecute false', monitoring.executable === false && monitoring.aiCanExecute === false);
expect('monitoring payload structurally cannot authorize production write', monitoring.authorizesProductionWrite === false);

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5C Observation Mode (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
