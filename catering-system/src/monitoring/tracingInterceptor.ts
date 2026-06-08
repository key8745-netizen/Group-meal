/**
 * tracingInterceptor.ts
 *
 * Feature 009 Phase 5F: Production Readiness Next-Step Planning
 *
 * Pure-logic, non-executable contract/model layer for readiness-only
 * tracing / sampling / timing modeling. This module:
 *   - models a P99 `<50ms` contract-level acceptance target
 *   - models sampling/timing decisions (sample rate, span shape)
 *   - builds `Performance_Degradation_Risk` alert payloads when the P99
 *     target is exceeded
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no real tracing/telemetry SDK calls, no I/O
 *  - MUST NOT import from `src/core/`, `src/database/`, `src/production/`
 *  - Samples and models only — NEVER mutates business flow, NEVER wires into
 *    any real request path
 *  - Pure synchronous — default-deny / fail-closed on malformed input
 */

import type { BlockedReason } from '../types/aiBoundary';

export const IS_PRODUCTION_READINESS_ONLY = true as const;

/** Contract-level P99 acceptance target — readiness/staging/contract only */
export const P99_TARGET_MS = 50;

/** Mirrors Phase 5E's SIMULATED_HIGH_LOAD_REQ_PER_SEC pattern for tracing sampling load modeling */
export const SIMULATED_HIGH_LOAD_REQ_PER_SEC = 500;

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

// ─── Sampling decision model ─────────────────────────────────────────────────

export interface TracingSampleRequestInput {
  readonly _kind: 'f009_phase5f_tracing_sample_request_input';
  spanName: string;
  observedDurationsMs: number[];
  sampleRate: number;
  occurredAt: string;
}

export interface TracingSampleDecisionResult {
  readonly _kind: 'f009_phase5f_tracing_sample_decision_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → this span/sample is modeled as captured for readiness reporting only */
  sampled: boolean;
  /** Always true — sampling never authorizes mutation of business flow */
  samplesOnly: true;
  /** Always false — this module never mutates business flow */
  mutatesBusinessFlow: false;
  spanName: string;
  p99Ms: number | null;
  blockedReasons: BlockedReason[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * Models a tracing sample/timing decision for a single span. This function
 * NEVER mutates anything — it only computes a P99 estimate from a provided
 * sample of observed durations and reports whether the span would be
 * "sampled" for readiness reporting purposes. Default-deny (not sampled,
 * p99Ms null) on malformed input.
 */
export function evaluateTracingSampleDecision(
  input: TracingSampleRequestInput | null | undefined,
): TracingSampleDecisionResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5f_tracing_sample_request_input'
    || !isNonEmpty(input.spanName)
    || !Array.isArray(input.observedDurationsMs)
    || !input.observedDurationsMs.every((d) => isFiniteNonNegative(d))
    || typeof input.sampleRate !== 'number' || !Number.isFinite(input.sampleRate)
    || input.sampleRate < 0 || input.sampleRate > 1
    || !isNonEmpty(input.occurredAt)
  ) {
    return {
      _kind: 'f009_phase5f_tracing_sample_decision_result',
      executable: false, aiCanExecute: false,
      sampled: false,
      samplesOnly: true,
      mutatesBusinessFlow: false,
      spanName: typeof input?.spanName === 'string' ? input.spanName : '',
      p99Ms: null,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_TRACING_SAMPLE_ONLY'],
    };
  }

  const sorted = [...input.observedDurationsMs].sort((a, b) => a - b);
  const p99Ms = sorted.length > 0 ? percentile(sorted, 99) : null;

  return {
    _kind: 'f009_phase5f_tracing_sample_decision_result',
    executable: false, aiCanExecute: false,
    sampled: input.sampleRate > 0 && sorted.length > 0,
    samplesOnly: true,
    mutatesBusinessFlow: false,
    spanName: input.spanName,
    p99Ms,
    blockedReasons: ['F009_PHASE5F_TRACING_SAMPLE_ONLY'],
  };
}

// ─── P99 <50ms readiness target evaluation ───────────────────────────────────

export interface P99TargetEvaluationInput {
  readonly _kind: 'f009_phase5f_p99_target_evaluation_input';
  observedP99Ms: number;
  targetMs: number;
  spanName: string;
  tenantId: string;
  occurredAt: string;
}

export interface P99TargetEvaluationResult {
  readonly _kind: 'f009_phase5f_p99_target_evaluation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true → observed P99 stays within the contract-level target */
  withinTarget: boolean;
  observedP99Ms: number;
  targetMs: number;
  /** true → degradation-risk alert must be modeled/built */
  degradationRiskTriggered: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Evaluates an observed P99 timing sample against the `P99_TARGET_MS` (<50ms)
 * contract-level readiness target. Default-deny (treated as exceeding target,
 * the only safe closed state) on malformed/negative input.
 */
export function evaluateP99Target(
  input: P99TargetEvaluationInput | null | undefined,
): P99TargetEvaluationResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5f_p99_target_evaluation_input'
    || !isFiniteNonNegative(input.observedP99Ms)
    || !isFiniteNonNegative(input.targetMs) || input.targetMs <= 0
    || !isNonEmpty(input.spanName)
    || !isNonEmpty(input.tenantId)
  ) {
    return {
      _kind: 'f009_phase5f_p99_target_evaluation_result',
      executable: false, aiCanExecute: false,
      withinTarget: false,
      observedP99Ms: typeof input?.observedP99Ms === 'number' ? input.observedP99Ms : -1,
      targetMs: typeof input?.targetMs === 'number' ? input.targetMs : P99_TARGET_MS,
      degradationRiskTriggered: true,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_P99_TARGET_EXCEEDED', 'F009_PHASE5F_PERFORMANCE_DEGRADATION_RISK'],
    };
  }

  const withinTarget = input.observedP99Ms < input.targetMs;
  const degradationRiskTriggered = !withinTarget;

  return {
    _kind: 'f009_phase5f_p99_target_evaluation_result',
    executable: false, aiCanExecute: false,
    withinTarget,
    observedP99Ms: input.observedP99Ms,
    targetMs: input.targetMs,
    degradationRiskTriggered,
    blockedReasons: degradationRiskTriggered
      ? ['F009_PHASE5F_P99_TARGET_EXCEEDED', 'F009_PHASE5F_PERFORMANCE_DEGRADATION_RISK']
      : [],
  };
}

// ─── Performance_Degradation_Risk alert payload ──────────────────────────────

export interface PerformanceDegradationRiskAlertPayload {
  readonly _kind: 'f009_phase5f_performance_degradation_risk_alert_payload';
  readonly executable: false;
  eventType: 'Performance_Degradation_Risk';
  tenantId: string;
  spanName: string;
  observedP99Ms: number;
  targetMs: number;
  auditTrailId: string;
  occurredAt: string;
  /** Always false — alert payloads never authorize a production write */
  authorizesProductionWrite: false;
  /** Always true — alert is sample-derived only, never mutates flow */
  samplesOnly: true;
}

export interface PerformanceDegradationRiskAlertInput {
  tenantId: string;
  spanName: string;
  observedP99Ms: number;
  targetMs: number;
  auditTrailId: string;
  occurredAt: string;
}

export interface PerformanceDegradationRiskAlertBuildResult {
  readonly _kind: 'f009_phase5f_performance_degradation_risk_alert_build_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  built: boolean;
  payload: PerformanceDegradationRiskAlertPayload | null;
  blockedReasons: BlockedReason[];
}

/**
 * Builds a `Performance_Degradation_Risk` alert payload ONLY when the P99
 * target is exceeded (`observedP99Ms >= targetMs`). Default-deny (no payload
 * built) on malformed input or when the target is not exceeded — this builder
 * never produces a payload that would imply a healthy state is at risk.
 */
export function buildPerformanceDegradationRiskAlert(
  input: PerformanceDegradationRiskAlertInput | null | undefined,
): PerformanceDegradationRiskAlertBuildResult {
  if (
    !input
    || !isNonEmpty(input.tenantId)
    || !isNonEmpty(input.spanName)
    || !isFiniteNonNegative(input.observedP99Ms)
    || !isFiniteNonNegative(input.targetMs) || input.targetMs <= 0
    || !isNonEmpty(input.auditTrailId)
    || !isNonEmpty(input.occurredAt)
  ) {
    return {
      _kind: 'f009_phase5f_performance_degradation_risk_alert_build_result',
      executable: false, aiCanExecute: false,
      built: false, payload: null,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'],
    };
  }

  if (input.observedP99Ms < input.targetMs) {
    return {
      _kind: 'f009_phase5f_performance_degradation_risk_alert_build_result',
      executable: false, aiCanExecute: false,
      built: false, payload: null,
      blockedReasons: [],
    };
  }

  const payload: PerformanceDegradationRiskAlertPayload = {
    _kind: 'f009_phase5f_performance_degradation_risk_alert_payload',
    executable: false,
    eventType: 'Performance_Degradation_Risk',
    tenantId: input.tenantId,
    spanName: input.spanName,
    observedP99Ms: input.observedP99Ms,
    targetMs: input.targetMs,
    auditTrailId: input.auditTrailId,
    occurredAt: input.occurredAt,
    authorizesProductionWrite: false,
    samplesOnly: true,
  };

  return {
    _kind: 'f009_phase5f_performance_degradation_risk_alert_build_result',
    executable: false, aiCanExecute: false,
    built: true,
    payload,
    blockedReasons: ['F009_PHASE5F_P99_TARGET_EXCEEDED', 'F009_PHASE5F_PERFORMANCE_DEGRADATION_RISK'],
  };
}

// ─── High-load tracing sampling simulation (mirrors Phase 5E pattern) ────────

export interface TracingHighLoadSimulationInput {
  readonly _kind: 'f009_phase5f_tracing_high_load_simulation_input';
  observedReqPerSec: number;
  thresholdReqPerSec: number;
  tenantId: string;
  occurredAt: string;
}

export interface TracingHighLoadSimulationResult {
  readonly _kind: 'f009_phase5f_tracing_high_load_simulation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  haltTriggered: boolean;
  observedReqPerSec: number;
  thresholdReqPerSec: number;
  /** Always true — high-load sampling never mutates business flow */
  samplesOnly: true;
  blockedReasons: BlockedReason[];
}

/**
 * Models tracing/sampling behavior under simulated high load (mirrors Phase
 * 5E `evaluateHighLoadConcurrency` / `SIMULATED_HIGH_LOAD_REQ_PER_SEC`
 * pattern at ~500 req/s). ANY observed load at/above threshold triggers HALT
 * of further sampling — default-deny on malformed/negative inputs.
 */
export function evaluateTracingHighLoadSampling(
  input: TracingHighLoadSimulationInput | null | undefined,
): TracingHighLoadSimulationResult {
  if (
    !input
    || (input as { _kind?: string })._kind !== 'f009_phase5f_tracing_high_load_simulation_input'
    || typeof input.observedReqPerSec !== 'number' || !Number.isFinite(input.observedReqPerSec)
    || typeof input.thresholdReqPerSec !== 'number' || !Number.isFinite(input.thresholdReqPerSec)
    || input.thresholdReqPerSec <= 0
  ) {
    return {
      _kind: 'f009_phase5f_tracing_high_load_simulation_result',
      executable: false, aiCanExecute: false,
      haltTriggered: true,
      observedReqPerSec: typeof input?.observedReqPerSec === 'number' ? input.observedReqPerSec : -1,
      thresholdReqPerSec: typeof input?.thresholdReqPerSec === 'number' ? input.thresholdReqPerSec : SIMULATED_HIGH_LOAD_REQ_PER_SEC,
      samplesOnly: true,
      blockedReasons: ['F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5F_HALT'],
    };
  }

  const haltTriggered = input.observedReqPerSec >= input.thresholdReqPerSec;

  return {
    _kind: 'f009_phase5f_tracing_high_load_simulation_result',
    executable: false, aiCanExecute: false,
    haltTriggered,
    observedReqPerSec: input.observedReqPerSec,
    thresholdReqPerSec: input.thresholdReqPerSec,
    samplesOnly: true,
    blockedReasons: haltTriggered
      ? ['F009_PHASE5F_HIGH_LOAD_THRESHOLD_EXCEEDED', 'F009_PHASE5F_HALT']
      : [],
  };
}
