/**
 * realModelConfigApplyProductionGateService.ts
 *
 * Feature 009 Phase 5B: Production-Gated Rollout Foundation — Gate Models
 *
 * Pure-logic models and evaluators for the gates that must ALL pass before
 * any real production model-config-apply transaction could ever be permitted:
 *   - Deployment pipeline gate (CI-controlled, present/missing/wrong project/env)
 *   - Kill switch (ON/OFF/missing/stale) + two-person RESET contract
 *   - Emergency disable contract (disables all future applies, fully auditable)
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction, no I/O
 *  - Pure synchronous — default-deny on any missing/ambiguous input
 *  - Production remains disabled-by-default
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';

// ─── Deployment Pipeline Gate ────────────────────────────────────────────────

export type DeploymentEnvironment = 'staging' | 'production' | 'unknown';

/**
 * A gate record produced by the CI / deployment pipeline. Its mere presence
 * in app config is NOT sufficient — fields must match the expected project
 * and environment, and the gate must explicitly approve production rollout.
 */
export interface DeploymentPipelineGate {
  readonly _kind: 'f009_phase5b_deployment_pipeline_gate';
  present: boolean;
  projectId: string;
  environment: DeploymentEnvironment;
  approvedForProductionRollout: boolean;
  approvedByPipelineRunId?: string;
  approvedAt?: string;
}

export interface DeploymentGateEvaluationInput {
  gate: DeploymentPipelineGate | null | undefined;
  expectedProjectId: string;
  expectedEnvironment: DeploymentEnvironment;
}

export interface DeploymentGateEvaluationResult {
  readonly _kind: 'f009_phase5b_deployment_gate_evaluation_result';
  passed: boolean;
  blockedReasons: BlockedReason[];
}

export function evaluateDeploymentPipelineGate(
  input: DeploymentGateEvaluationInput,
): DeploymentGateEvaluationResult {
  const blocked: BlockedReason[] = [];

  if (!input.gate || input.gate.present !== true) {
    return {
      _kind: 'f009_phase5b_deployment_gate_evaluation_result',
      passed: false,
      blockedReasons: ['F009_PHASE5B_DEPLOYMENT_GATE_MISSING'],
    };
  }

  const gate = input.gate;

  if (gate.projectId !== input.expectedProjectId) {
    blocked.push('F009_PHASE5B_DEPLOYMENT_GATE_WRONG_PROJECT');
  }
  if (gate.environment !== input.expectedEnvironment || gate.environment === 'unknown') {
    blocked.push('F009_PHASE5B_DEPLOYMENT_GATE_WRONG_ENVIRONMENT');
  }
  if (gate.approvedForProductionRollout !== true) {
    blocked.push('F009_PHASE5B_DEPLOYMENT_GATE_MISSING');
  }

  return {
    _kind: 'f009_phase5b_deployment_gate_evaluation_result',
    passed: blocked.length === 0,
    blockedReasons: blocked,
  };
}

// ─── Kill Switch ─────────────────────────────────────────────────────────────

export type KillSwitchState = 'ON' | 'OFF';
export type KillSwitchScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'tenant'; readonly tenantId: TenantId };

export interface KillSwitchRecord {
  readonly _kind: 'f009_phase5b_kill_switch_record';
  present: boolean;
  state: KillSwitchState;
  scope: KillSwitchScope;
  lastUpdatedAt: string;
  /** Records considered stale beyond this freshness window must BLOCK. */
  staleAfterSeconds: number;
}

export interface KillSwitchEvaluationInput {
  record: KillSwitchRecord | null | undefined;
  /** ISO timestamp representing "now", supplied by caller for determinism. */
  now: string;
}

export interface KillSwitchEvaluationResult {
  readonly _kind: 'f009_phase5b_kill_switch_evaluation_result';
  passed: boolean;
  blockedReasons: BlockedReason[];
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

export function evaluateKillSwitch(input: KillSwitchEvaluationInput): KillSwitchEvaluationResult {
  if (!input.record || input.record.present !== true) {
    return {
      _kind: 'f009_phase5b_kill_switch_evaluation_result',
      passed: false,
      blockedReasons: ['F009_PHASE5B_KILL_SWITCH_MISSING'],
    };
  }

  const blocked: BlockedReason[] = [];
  const rec = input.record;

  if (rec.state === 'ON') {
    blocked.push('F009_PHASE5B_KILL_SWITCH_ON');
  }

  const nowSec = isoToSeconds(input.now);
  const updatedSec = isoToSeconds(rec.lastUpdatedAt);
  if (!Number.isFinite(nowSec) || !Number.isFinite(updatedSec)
    || (nowSec - updatedSec) > rec.staleAfterSeconds) {
    blocked.push('F009_PHASE5B_KILL_SWITCH_STALE');
  }

  return {
    _kind: 'f009_phase5b_kill_switch_evaluation_result',
    passed: blocked.length === 0,
    blockedReasons: blocked,
  };
}

// ─── Kill Switch Reset (two-person integrity, fully audited) ────────────────

/**
 * Complete audit payload required to reset a kill switch. Per Phase 5B
 * Priority Risk #1, ANY missing field BLOCKS the reset, and a scoped reset
 * requires distinct requestedBy / approvedBy identities (two-person integrity).
 */
export interface KillSwitchResetAuditPayload {
  readonly _kind: 'f009_phase5b_kill_switch_reset_audit_payload';
  scope: KillSwitchScope;
  requestedBy: string;
  approvedBy: string;
  previousState: KillSwitchState;
  nextState: KillSwitchState;
  reason: string;
  timestamp: string;
  auditTrailId: string;
}

export interface KillSwitchResetEvaluationResult {
  readonly _kind: 'f009_phase5b_kill_switch_reset_evaluation_result';
  passed: boolean;
  blockedReasons: BlockedReason[];
  missingFields: string[];
}

const RESET_REQUIRED_STRING_FIELDS: (keyof KillSwitchResetAuditPayload)[] = [
  'requestedBy', 'approvedBy', 'previousState', 'nextState', 'reason', 'timestamp', 'auditTrailId',
];

function isNonEmpty(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validates a kill switch reset audit payload contract.
 * Missing ANY required field → BLOCKED. A scoped (tenant) reset additionally
 * requires requestedBy !== approvedBy (two-person integrity).
 */
export function evaluateKillSwitchResetAuditPayload(
  payload: KillSwitchResetAuditPayload | null | undefined,
): KillSwitchResetEvaluationResult {
  if (!payload || (payload as { _kind?: string })._kind !== 'f009_phase5b_kill_switch_reset_audit_payload') {
    return {
      _kind: 'f009_phase5b_kill_switch_reset_evaluation_result',
      passed: false,
      blockedReasons: ['F009_PHASE5B_KILL_SWITCH_RESET_AUDIT_INCOMPLETE'],
      missingFields: ['_kind'],
    };
  }

  const missing: string[] = [];
  if (!payload.scope || (payload.scope.kind !== 'global' && payload.scope.kind !== 'tenant')) {
    missing.push('scope');
  }
  if (payload.scope?.kind === 'tenant' && !isNonEmpty(payload.scope.tenantId as unknown as string)) {
    missing.push('scope.tenantId');
  }
  for (const field of RESET_REQUIRED_STRING_FIELDS) {
    if (!isNonEmpty(payload[field] as unknown as string)) missing.push(field as string);
  }

  const blocked: BlockedReason[] = [];
  if (missing.length > 0) {
    blocked.push('F009_PHASE5B_KILL_SWITCH_RESET_AUDIT_INCOMPLETE');
  }

  // Two-person integrity: requestedBy and approvedBy must be distinct humans.
  if (
    isNonEmpty(payload.requestedBy) && isNonEmpty(payload.approvedBy)
    && payload.requestedBy === payload.approvedBy
  ) {
    blocked.push('F009_PHASE5B_KILL_SWITCH_RESET_TWO_PERSON_REQUIRED');
  }

  return {
    _kind: 'f009_phase5b_kill_switch_reset_evaluation_result',
    passed: blocked.length === 0,
    blockedReasons: blocked,
    missingFields: missing,
  };
}

// ─── Emergency Disable Contract ──────────────────────────────────────────────

/**
 * Non-executable contract describing an emergency-disable event. Once active,
 * it disables ALL future production applies (global, regardless of any other
 * gate state) and must be fully auditable.
 */
export interface EmergencyDisableContract {
  readonly _kind: 'f009_phase5b_emergency_disable_contract';
  readonly executable: false;
  active: boolean;
  disabledBy: string;
  reason: string;
  disabledAt: string;
  auditTrailId: string;
}

export interface EmergencyDisableEvaluationResult {
  readonly _kind: 'f009_phase5b_emergency_disable_evaluation_result';
  /** true → future applies must be BLOCKED */
  blocksFutureApplies: boolean;
  blockedReasons: BlockedReason[];
}

export function evaluateEmergencyDisableContract(
  contract: EmergencyDisableContract | null | undefined,
): EmergencyDisableEvaluationResult {
  if (!contract || contract.active !== true) {
    return {
      _kind: 'f009_phase5b_emergency_disable_evaluation_result',
      blocksFutureApplies: false,
      blockedReasons: [],
    };
  }
  return {
    _kind: 'f009_phase5b_emergency_disable_evaluation_result',
    blocksFutureApplies: true,
    blockedReasons: ['F009_PHASE5B_EMERGENCY_DISABLE_ACTIVE'],
  };
}

/** Builds a non-executable, fully-auditable emergency disable contract. */
export function buildEmergencyDisableContract(input: {
  disabledBy: string;
  reason: string;
  disabledAt: string;
  auditTrailId: string;
}): EmergencyDisableContract {
  return {
    _kind: 'f009_phase5b_emergency_disable_contract',
    executable: false,
    active: true,
    disabledBy: input.disabledBy,
    reason: input.reason,
    disabledAt: input.disabledAt,
    auditTrailId: input.auditTrailId,
  };
}
