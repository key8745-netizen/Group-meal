/**
 * canaryManager.phase5f.test.ts — Feature 009 Phase 5F additive extensions
 * Pure runner pattern: `npx tsx`, passed/failed counters, throw on failure.
 */
import {
  IS_PRODUCTION_READINESS_ONLY,
  evaluateCanaryWriteAttempt,
  F009_PHASE5F_IS_PRODUCTION_READINESS_ONLY,
  F009_PHASE5F_SIMULATED_HIGH_LOAD_REQ_PER_SEC,
  F009_PHASE5F_CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC,
  evaluateTenantLockDecision,
  evaluateF009Phase5FHighLoadConcurrency,
  evaluateRolloutKillCriteria,
  evaluateF009Phase5FWriteAttempt,
  checkF009Phase5FEmergencyDisablePriority,
  type TenantLockDecisionInput,
  type F009Phase5FHighLoadSimulationInput,
  type RolloutKillCriteriaInput,
  type F009Phase5FWriteAttemptInput,
  type F009Phase5FEmergencyDisablePriorityCheckInput,
} from '../canaryManager';
import type { EmergencyDisableContract } from '../realModelConfigApplyProductionGateService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5F: canaryManager additive extensions ---');

const NOW = '2026-06-08T01:00:00.000Z';

const emergencyOff: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: false, disabledBy: '', reason: '', disabledAt: '', auditTrailId: '',
};
const emergencyOn: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract', executable: false,
  active: true, disabledBy: 'op-1', reason: 'incident', disabledAt: NOW, auditTrailId: 'audit-em-1',
};

// ── No regression: Phase 5E hard guard / write attempt remain intact ─────────
expect('Phase 5E IS_PRODUCTION_READINESS_ONLY remains true (no regression)', IS_PRODUCTION_READINESS_ONLY === true);
expect('Phase 5E evaluateCanaryWriteAttempt still blocks (no regression)', evaluateCanaryWriteAttempt({
  _kind: 'f009_phase5e_canary_write_attempt_input', targetKind: 'PRODUCTION_WRITE', environment: 'production', dryRun: false, actorId: 'a',
}).blocked === true);

// ── Phase 5F readiness-only guard ────────────────────────────────────────────
expect('F009_PHASE5F_IS_PRODUCTION_READINESS_ONLY is true', F009_PHASE5F_IS_PRODUCTION_READINESS_ONLY === true);

// ── Phase 5F write-attempt → FATAL_SAFETY_VIOLATION ──────────────────────────
const writeKinds: F009Phase5FWriteAttemptInput['targetKind'][] = ['PRODUCTION_WRITE', 'PRODUCTION_CANARY_WRITE', 'BROAD_ROLLOUT', 'PRODUCTION_MUTATION'];
for (const targetKind of writeKinds) {
  const r = evaluateF009Phase5FWriteAttempt({ _kind: 'f009_phase5f_write_attempt_input', targetKind, environment: 'production', actorId: 'actor-x' });
  expect(`Phase 5F write attempt ${targetKind} → blocked+fatal`, r.blocked === true && r.fatal === true);
  expect(`Phase 5F write attempt ${targetKind} → FATAL_SAFETY_VIOLATION`, r.blockedReasons.includes('F009_PHASE5F_FATAL_SAFETY_VIOLATION'));
  expect(`Phase 5F write attempt ${targetKind} → isProductionReadinessOnly true`, r.isProductionReadinessOnly === true);
}
expect('Phase 5F malformed write attempt → blocked default-deny', evaluateF009Phase5FWriteAttempt(null).blocked === true);

// ── Phase 5F Emergency Disable priority hook (highest priority) ──────────────
const edInput: F009Phase5FEmergencyDisablePriorityCheckInput = {
  _kind: 'f009_phase5f_emergency_disable_priority_check_input', emergencyDisable: emergencyOn, pathName: 'TENANT_LOCK',
};
const edActive = checkF009Phase5FEmergencyDisablePriority(edInput);
expect('Emergency disable active → wins, path blocked', edActive.emergencyDisableWins === true && edActive.pathBlocked === true);
expect('Emergency disable active → priority hook reason', edActive.blockedReasons.includes('F009_PHASE5F_EMERGENCY_DISABLE_PRIORITY_HOOK'));

const edInactive = checkF009Phase5FEmergencyDisablePriority({ ...edInput, emergencyDisable: emergencyOff });
expect('Emergency disable inactive → does not win', edInactive.emergencyDisableWins === false && edInactive.pathBlocked === false);

const edMissing = checkF009Phase5FEmergencyDisablePriority({ ...edInput, emergencyDisable: null });
expect('Emergency disable missing → default-deny treated as active (wins)', edMissing.emergencyDisableWins === true);

expect('Malformed emergency-disable-priority input → default-deny wins', checkF009Phase5FEmergencyDisablePriority(null).emergencyDisableWins === true);

// ── Tenant lock: blocking-decision-only, non-write, audit-only ───────────────
const lockedInput: TenantLockDecisionInput = {
  _kind: 'f009_phase5f_tenant_lock_decision_input', tenantId: 't1', observedState: 'LOCKED', operatorId: 'op-1', occurredAt: NOW, traceId: 'trace-1',
};
const lockedResult = evaluateTenantLockDecision(lockedInput);
expect('Tenant lock LOCKED → decision BLOCKED', lockedResult.decision === 'BLOCKED');
expect('Tenant lock → modeled non-write', lockedResult.nonWrite === true);
expect('Tenant lock → never writes production state', lockedResult.writesProductionState === false);
expect('Tenant lock → audit-only payload emitted', lockedResult.auditPayload != null && lockedResult.auditPayload.eventType === 'TENANT_LOCK_DECISION');
expect('Tenant lock audit payload never authorizes write', lockedResult.auditPayload.authorizesProductionWrite === false);
expect('Tenant lock → TENANT_LOCK_NON_WRITE reason', lockedResult.blockedReasons.includes('F009_PHASE5F_TENANT_LOCK_NON_WRITE'));

const unlockedResult = evaluateTenantLockDecision({ ...lockedInput, observedState: 'UNLOCKED' });
expect('Even UNLOCKED observed state → still modeled BLOCKED (decision-only)', unlockedResult.decision === 'BLOCKED');

const ambiguousResult = evaluateTenantLockDecision({ ...lockedInput, observedState: 'AMBIGUOUS' });
expect('Ambiguous tenant lock state → defaults to BLOCKED/DENY', ambiguousResult.decision === 'BLOCKED');
expect('Ambiguous tenant lock state → AMBIGUOUS_DEFAULT_DENY reason', ambiguousResult.blockedReasons.includes('F009_PHASE5F_TENANT_LOCK_AMBIGUOUS_DEFAULT_DENY'));

const unknownResult = evaluateTenantLockDecision({ ...lockedInput, observedState: 'UNKNOWN' });
expect('Unknown tenant lock state → defaults to BLOCKED/DENY', unknownResult.decision === 'BLOCKED');
expect('Unknown tenant lock state → AMBIGUOUS_DEFAULT_DENY reason', unknownResult.blockedReasons.includes('F009_PHASE5F_TENANT_LOCK_AMBIGUOUS_DEFAULT_DENY'));

const malformedLock = evaluateTenantLockDecision(null);
expect('Malformed tenant lock input → BLOCKED default-deny', malformedLock.decision === 'BLOCKED');
expect('Malformed tenant lock input → still nonWrite', malformedLock.nonWrite === true);
expect('Malformed tenant lock input → audit payload still emitted', malformedLock.auditPayload != null);

// ── High-load concurrency simulation at 500 req/s ────────────────────────────
expect('F009_PHASE5F_SIMULATED_HIGH_LOAD_REQ_PER_SEC mirrors Phase 5E pattern (500)', F009_PHASE5F_SIMULATED_HIGH_LOAD_REQ_PER_SEC === 500);

const highLoadInput: F009Phase5FHighLoadSimulationInput = {
  _kind: 'f009_phase5f_high_load_simulation_input',
  observedReqPerSec: F009_PHASE5F_SIMULATED_HIGH_LOAD_REQ_PER_SEC,
  thresholdReqPerSec: F009_PHASE5F_CONCURRENCY_HALT_THRESHOLD_REQ_PER_SEC,
  tenantId: 't1', occurredAt: NOW,
};
const highLoadResult = evaluateF009Phase5FHighLoadConcurrency(highLoadInput);
expect('500 req/s ≥ threshold → HALT triggered', highLoadResult.haltTriggered === true);
expect('High-load → HIGH_LOAD_THRESHOLD_EXCEEDED reason', highLoadResult.blockedReasons.includes('F009_PHASE5F_HIGH_LOAD_THRESHOLD_EXCEEDED'));
expect('High-load → HALT reason', highLoadResult.blockedReasons.includes('F009_PHASE5F_HALT'));

const lowLoadResult = evaluateF009Phase5FHighLoadConcurrency({ ...highLoadInput, observedReqPerSec: 5 });
expect('Low load → no HALT', lowLoadResult.haltTriggered === false);
expect('Malformed high-load input → default-deny HALT', evaluateF009Phase5FHighLoadConcurrency(null).haltTriggered === true);

// ── Rollout kill criteria modeling ───────────────────────────────────────────
const killInputBase: RolloutKillCriteriaInput = {
  _kind: 'f009_phase5f_rollout_kill_criteria_input',
  errorRatePercent: 1, errorRateThresholdPercent: 5,
  p99Ms: 30, p99TargetMs: 50,
  emergencyDisable: emergencyOff, tenantId: 't1', occurredAt: NOW,
};
const killHealthy = evaluateRolloutKillCriteria(killInputBase);
expect('Healthy metrics + emergency off → kill not triggered', killHealthy.killTriggered === false);
expect('Healthy metrics → authorizesRollout always false', killHealthy.authorizesRollout === false);

const killErrorRate = evaluateRolloutKillCriteria({ ...killInputBase, errorRatePercent: 9 });
expect('Error rate exceeds threshold → kill triggered', killErrorRate.killTriggered === true && killErrorRate.errorRateExceeded === true);
expect('Error rate kill → ROLLOUT_KILL_CRITERIA_TRIGGERED reason', killErrorRate.blockedReasons.includes('F009_PHASE5F_ROLLOUT_KILL_CRITERIA_TRIGGERED'));

const killP99 = evaluateRolloutKillCriteria({ ...killInputBase, p99Ms: 80 });
expect('P99 exceeds target → kill triggered', killP99.killTriggered === true && killP99.p99Exceeded === true);
expect('P99 kill → P99_TARGET_EXCEEDED reason', killP99.blockedReasons.includes('F009_PHASE5F_P99_TARGET_EXCEEDED'));

const killEmergency = evaluateRolloutKillCriteria({ ...killInputBase, emergencyDisable: emergencyOn });
expect('Emergency disable active → kill triggered, wins first', killEmergency.killTriggered === true && killEmergency.emergencyDisableWins === true);
expect('Emergency disable kill → EMERGENCY_DISABLE_PRIORITY_HOOK reason', killEmergency.blockedReasons.includes('F009_PHASE5F_EMERGENCY_DISABLE_PRIORITY_HOOK'));
expect('Emergency disable kill → never authorizes rollout', killEmergency.authorizesRollout === false);

const killMalformed = evaluateRolloutKillCriteria(null);
expect('Malformed kill-criteria input → default-deny (kill triggered)', killMalformed.killTriggered === true);
expect('Malformed kill-criteria input → never authorizes rollout', killMalformed.authorizesRollout === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`canaryManager.phase5f.test.ts: ${fail} assertion(s) failed`);
