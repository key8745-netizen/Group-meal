/**
 * securityAudit.ts
 *
 * Feature 009 Phase 5D: Security Audit Helpers
 *
 * Pure-logic, non-executable `SecurityAlertPayload` builder per Spec section
 * 11. Used to model security-alert emission for Phase 5D failure modes
 * (deployment gate partial failure, orphaned token, observation mode
 * concurrency violations, emergency disable interplay) WITHOUT performing
 * any real I/O, alerting SDK call, or production write.
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no real alerting/SDK calls, no I/O
 *  - Pure synchronous — default-deny on any missing/malformed input
 */

import type { BlockedReason } from '../types/aiBoundary';

// ─── SecurityAlertPayload (Spec section 11) ──────────────────────────────────

export interface SecurityAlertPayload {
  readonly _kind: 'f009_phase5d_security_alert_payload';
  readonly executable: false;
  deploymentId: string;
  operatorId: string;
  systemState: string;
  errorType: string;
  auditTrailId: string;
  occurredAt: number;
  tenantId?: string;
  gateState?: string;
  observationModeVersion?: number;
}

export interface SecurityAlertPayloadInput {
  deploymentId: string;
  operatorId: string;
  systemState: string;
  errorType: string;
  auditTrailId: string;
  occurredAt: number;
  tenantId?: string;
  gateState?: string;
  observationModeVersion?: number;
}

export interface SecurityAlertBuildResult {
  readonly _kind: 'f009_phase5d_security_alert_build_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  ok: boolean;
  payload: SecurityAlertPayload | null;
  blockedReasons: BlockedReason[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Builds a `SecurityAlertPayload` per Spec section 11. Default-deny: any
 * missing required field results in `ok: false` and a null payload — this
 * function NEVER produces a partially-populated payload, and never performs
 * any actual alert dispatch (pure data construction only).
 */
export function buildSecurityAlertPayload(
  input: SecurityAlertPayloadInput | null | undefined,
): SecurityAlertBuildResult {
  if (!input) {
    return {
      _kind: 'f009_phase5d_security_alert_build_result',
      executable: false,
      aiCanExecute: false,
      ok: false,
      payload: null,
      blockedReasons: ['F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY', 'F009_PHASE5D_MISSING_DEPLOYMENT_ID'],
    };
  }

  const blocked: BlockedReason[] = [];
  if (!isNonEmptyString(input.deploymentId)) blocked.push('F009_PHASE5D_MISSING_DEPLOYMENT_ID');
  if (!isNonEmptyString(input.operatorId)) blocked.push('F009_PHASE5D_MISSING_OPERATOR_ID');
  if (!isNonEmptyString(input.auditTrailId)) blocked.push('F009_PHASE5D_MISSING_AUDIT_TRAIL_ID');
  if (!isNonEmptyString(input.systemState)) blocked.push('F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY');
  if (!isNonEmptyString(input.errorType)) blocked.push('F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY');
  if (typeof input.occurredAt !== 'number' || !Number.isFinite(input.occurredAt) || input.occurredAt <= 0) {
    blocked.push('F009_PHASE5D_UNKNOWN_STATE_DEFAULT_DENY');
  }

  if (blocked.length > 0) {
    return {
      _kind: 'f009_phase5d_security_alert_build_result',
      executable: false,
      aiCanExecute: false,
      ok: false,
      payload: null,
      blockedReasons: [...new Set(blocked)],
    };
  }

  const payload: SecurityAlertPayload = {
    _kind: 'f009_phase5d_security_alert_payload',
    executable: false,
    deploymentId: input.deploymentId,
    operatorId: input.operatorId,
    systemState: input.systemState,
    errorType: input.errorType,
    auditTrailId: input.auditTrailId,
    occurredAt: input.occurredAt,
    tenantId: input.tenantId,
    gateState: input.gateState,
    observationModeVersion: input.observationModeVersion,
  };

  return {
    _kind: 'f009_phase5d_security_alert_build_result',
    executable: false,
    aiCanExecute: false,
    ok: true,
    payload,
    blockedReasons: [],
  };
}

// ─── Convenience builders for specific Phase 5D failure modes ────────────────

/** Builds a SecurityAlertPayload for a deployment-gate partial-failure event. */
export function buildDeploymentGateFailureAlert(input: {
  deploymentId: string;
  operatorId: string;
  auditTrailId: string;
  occurredAt: number;
  errorType: string;
  gateState: string;
  tenantId?: string;
}): SecurityAlertBuildResult {
  return buildSecurityAlertPayload({
    deploymentId: input.deploymentId,
    operatorId: input.operatorId,
    systemState: 'DEPLOYMENT_GATE_PARTIAL_FAILURE',
    errorType: input.errorType,
    auditTrailId: input.auditTrailId,
    occurredAt: input.occurredAt,
    tenantId: input.tenantId,
    gateState: input.gateState,
  });
}

/** Builds a SecurityAlertPayload for an observation-mode concurrency-violation event. */
export function buildObservationConcurrencyAlert(input: {
  deploymentId: string;
  operatorId: string;
  auditTrailId: string;
  occurredAt: number;
  errorType: string;
  observationModeVersion: number;
  tenantId?: string;
}): SecurityAlertBuildResult {
  return buildSecurityAlertPayload({
    deploymentId: input.deploymentId,
    operatorId: input.operatorId,
    systemState: 'OBSERVATION_MODE_CONCURRENCY_VIOLATION',
    errorType: input.errorType,
    auditTrailId: input.auditTrailId,
    occurredAt: input.occurredAt,
    tenantId: input.tenantId,
    observationModeVersion: input.observationModeVersion,
  });
}
