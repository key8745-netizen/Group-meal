/**
 * tracingInterceptor.test.ts — Feature 009 Phase 5F
 * Pure runner pattern: `npx tsx`, passed/failed counters, throw on import failure.
 */
import {
  IS_PRODUCTION_READINESS_ONLY,
  P99_TARGET_MS,
  SIMULATED_HIGH_LOAD_REQ_PER_SEC,
  evaluateTracingSampleDecision,
  evaluateP99Target,
  buildPerformanceDegradationRiskAlert,
  evaluateTracingHighLoadSampling,
  type TracingSampleRequestInput,
  type P99TargetEvaluationInput,
  type TracingHighLoadSimulationInput,
} from '../tracingInterceptor';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5F: TracingInterceptor ---');

const NOW = '2026-06-08T00:40:00.000Z';

// ── Isolation / contract constants ───────────────────────────────────────────
expect('IS_PRODUCTION_READINESS_ONLY is true', IS_PRODUCTION_READINESS_ONLY === true);
expect('P99_TARGET_MS is 50 (<50ms target)', P99_TARGET_MS === 50);
expect('SIMULATED_HIGH_LOAD_REQ_PER_SEC mirrors Phase 5E (500)', SIMULATED_HIGH_LOAD_REQ_PER_SEC === 500);

// ── Sample decision: samples only, never mutates flow ───────────────────────
const sampleInput: TracingSampleRequestInput = {
  _kind: 'f009_phase5f_tracing_sample_request_input',
  spanName: 'menu.read', observedDurationsMs: [10, 12, 15, 18, 49, 51], sampleRate: 0.5, occurredAt: NOW,
};
const sampleResult = evaluateTracingSampleDecision(sampleInput);
expect('Sample decision → samplesOnly true', sampleResult.samplesOnly === true);
expect('Sample decision → mutatesBusinessFlow false', sampleResult.mutatesBusinessFlow === false);
expect('Sample decision → p99Ms computed', typeof sampleResult.p99Ms === 'number');
expect('Malformed sample input → default-deny not sampled', evaluateTracingSampleDecision(null).sampled === false);
expect('Malformed sample input → TRACING_SAMPLE_ONLY reason', evaluateTracingSampleDecision(null).blockedReasons.includes('F009_PHASE5F_TRACING_SAMPLE_ONLY'));
expect('Malformed sample input → mutatesBusinessFlow always false', evaluateTracingSampleDecision(undefined).mutatesBusinessFlow === false);

// ── P99 <50ms target evaluation ──────────────────────────────────────────────
const withinTargetInput: P99TargetEvaluationInput = {
  _kind: 'f009_phase5f_p99_target_evaluation_input',
  observedP99Ms: 30, targetMs: P99_TARGET_MS, spanName: 'menu.read', tenantId: 'tenant-1', occurredAt: NOW,
};
const withinResult = evaluateP99Target(withinTargetInput);
expect('P99 within target (<50ms) → withinTarget true', withinResult.withinTarget === true);
expect('P99 within target → no degradation risk', withinResult.degradationRiskTriggered === false);
expect('P99 within target → no blocked reasons', withinResult.blockedReasons.length === 0);

const exceedingInput: P99TargetEvaluationInput = { ...withinTargetInput, observedP99Ms: 75 };
const exceedingResult = evaluateP99Target(exceedingInput);
expect('P99 exceeding target → withinTarget false', exceedingResult.withinTarget === false);
expect('P99 exceeding target → degradation risk triggered', exceedingResult.degradationRiskTriggered === true);
expect('P99 exceeding target → P99_TARGET_EXCEEDED reason', exceedingResult.blockedReasons.includes('F009_PHASE5F_P99_TARGET_EXCEEDED'));
expect('P99 exceeding target → PERFORMANCE_DEGRADATION_RISK reason', exceedingResult.blockedReasons.includes('F009_PHASE5F_PERFORMANCE_DEGRADATION_RISK'));
expect('Malformed P99 input → default-deny (treated as exceeded)', evaluateP99Target(null).degradationRiskTriggered === true);

// ── Performance_Degradation_Risk alert payload ───────────────────────────────
const alertExceeding = buildPerformanceDegradationRiskAlert({
  tenantId: 'tenant-1', spanName: 'menu.read', observedP99Ms: 80, targetMs: P99_TARGET_MS,
  auditTrailId: 'audit-trace-1', occurredAt: NOW,
});
expect('Alert built when P99 exceeds target', alertExceeding.built === true);
expect('Alert payload eventType is Performance_Degradation_Risk', alertExceeding.payload?.eventType === 'Performance_Degradation_Risk');
expect('Alert payload never authorizes production write', alertExceeding.payload?.authorizesProductionWrite === false);
expect('Alert payload samplesOnly true', alertExceeding.payload?.samplesOnly === true);
expect('Alert payload executable false', alertExceeding.payload?.executable === false);

const alertWithin = buildPerformanceDegradationRiskAlert({
  tenantId: 'tenant-1', spanName: 'menu.read', observedP99Ms: 20, targetMs: P99_TARGET_MS,
  auditTrailId: 'audit-trace-2', occurredAt: NOW,
});
expect('No alert built when P99 within target', alertWithin.built === false);
expect('No alert payload when within target', alertWithin.payload === null);

const alertMalformed = buildPerformanceDegradationRiskAlert(null);
expect('Malformed alert input → not built', alertMalformed.built === false);
expect('Malformed alert input → AUDIT_PAYLOAD_INCOMPLETE reason', alertMalformed.blockedReasons.includes('F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'));

// ── High-load tracing sampling (mirrors Phase 5E ~500 req/s pattern) ─────────
const highLoadInput: TracingHighLoadSimulationInput = {
  _kind: 'f009_phase5f_tracing_high_load_simulation_input',
  observedReqPerSec: SIMULATED_HIGH_LOAD_REQ_PER_SEC, thresholdReqPerSec: 200, tenantId: 'tenant-1', occurredAt: NOW,
};
const highLoadResult = evaluateTracingHighLoadSampling(highLoadInput);
expect('High load (500 req/s ≥ threshold) → HALT triggered', highLoadResult.haltTriggered === true);
expect('High load → samplesOnly true', highLoadResult.samplesOnly === true);
expect('High load → HIGH_LOAD_THRESHOLD_EXCEEDED reason', highLoadResult.blockedReasons.includes('F009_PHASE5F_HIGH_LOAD_THRESHOLD_EXCEEDED'));

const lowLoadInput: TracingHighLoadSimulationInput = { ...highLoadInput, observedReqPerSec: 10 };
expect('Low load → HALT not triggered', evaluateTracingHighLoadSampling(lowLoadInput).haltTriggered === false);
expect('Malformed high-load input → default-deny HALT', evaluateTracingHighLoadSampling(null).haltTriggered === true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`tracingInterceptor.test.ts: ${fail} assertion(s) failed`);
