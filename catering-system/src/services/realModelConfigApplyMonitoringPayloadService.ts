/**
 * realModelConfigApplyMonitoringPayloadService.ts
 *
 * Feature 009 Phase 5B: Audit / Monitoring Payload Builders
 *
 * Builds pure, non-executable audit/monitoring payloads describing gate
 * outcomes and aggregate metrics for the production-gated apply rollout.
 * Nothing here writes to Firestore or any monitoring backend.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction, no I/O
 *  - Pure synchronous payload construction only
 */

import type { BlockedReason, TenantId, AuditTrailId } from '../types/aiBoundary';
import type { ApplyToken, ModelConfigApprovalId } from '../types/modelConfigApply';

export type F009Phase5BMonitoringEventType =
  | 'PRODUCTION_GATE_PASSED'
  | 'PRODUCTION_GATE_BLOCKED'
  | 'KILL_SWITCH_BLOCKED'
  | 'KILL_SWITCH_RESET'
  | 'DRY_RUN_MISMATCH_BLOCKED'
  | 'OPERATOR_CONFIRMATION'
  | 'EMERGENCY_DISABLE'
  | 'DEPLOYMENT_GATE_BLOCKED';

export interface MonitoringPayloadBase {
  readonly _kind: 'f009_phase5b_monitoring_payload';
  readonly executable: false;
  eventType: F009Phase5BMonitoringEventType;
  tenantId: TenantId | null;
  auditTrailId: AuditTrailId | null;
  generatedAt: Date;
  details: Record<string, unknown>;
  blockedReasons: BlockedReason[];
}

function buildBase(
  eventType: F009Phase5BMonitoringEventType,
  input: {
    tenantId?: TenantId | null;
    auditTrailId?: AuditTrailId | null;
    details?: Record<string, unknown>;
    blockedReasons?: BlockedReason[];
  },
): MonitoringPayloadBase {
  return {
    _kind: 'f009_phase5b_monitoring_payload',
    executable: false,
    eventType,
    tenantId: input.tenantId ?? null,
    auditTrailId: input.auditTrailId ?? null,
    generatedAt: new Date(),
    details: input.details ?? {},
    blockedReasons: input.blockedReasons ?? [],
  };
}

// ─── Production gate pass / blocked ──────────────────────────────────────────

export function buildProductionGatePassedPayload(input: {
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
}): MonitoringPayloadBase {
  return buildBase('PRODUCTION_GATE_PASSED', {
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    details: { approvalId: input.approvalId, applyToken: input.applyToken },
  });
}

export function buildProductionGateBlockedPayload(input: {
  tenantId: TenantId | null;
  auditTrailId: AuditTrailId | null;
  blockedReasons: BlockedReason[];
}): MonitoringPayloadBase {
  return buildBase('PRODUCTION_GATE_BLOCKED', {
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    blockedReasons: input.blockedReasons,
    details: { blockedCount: input.blockedReasons.length },
  });
}

// ─── Kill switch blocked / reset ─────────────────────────────────────────────

export function buildKillSwitchBlockedPayload(input: {
  tenantId: TenantId | null;
  blockedReasons: BlockedReason[];
  scopeKind: 'global' | 'tenant';
}): MonitoringPayloadBase {
  return buildBase('KILL_SWITCH_BLOCKED', {
    tenantId: input.tenantId,
    blockedReasons: input.blockedReasons,
    details: { scopeKind: input.scopeKind },
  });
}

export function buildKillSwitchResetPayload(input: {
  tenantId: TenantId | null;
  auditTrailId: AuditTrailId;
  requestedBy: string;
  approvedBy: string;
  previousState: string;
  nextState: string;
  reason: string;
  blockedReasons?: BlockedReason[];
}): MonitoringPayloadBase {
  return buildBase('KILL_SWITCH_RESET', {
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    blockedReasons: input.blockedReasons ?? [],
    details: {
      requestedBy: input.requestedBy,
      approvedBy: input.approvedBy,
      previousState: input.previousState,
      nextState: input.nextState,
      reason: input.reason,
    },
  });
}

// ─── Dry-run mismatch blocked ────────────────────────────────────────────────

export function buildDryRunMismatchBlockedPayload(input: {
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  mismatchedFields: string[];
  blockedReasons: BlockedReason[];
}): MonitoringPayloadBase {
  return buildBase('DRY_RUN_MISMATCH_BLOCKED', {
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    blockedReasons: input.blockedReasons,
    details: { mismatchedFields: input.mismatchedFields },
  });
}

// ─── Operator confirmation ───────────────────────────────────────────────────

export function buildOperatorConfirmationPayload(input: {
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  operatorUserId: string;
  approvalId: ModelConfigApprovalId;
  passed: boolean;
  blockedReasons?: BlockedReason[];
}): MonitoringPayloadBase {
  return buildBase('OPERATOR_CONFIRMATION', {
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    blockedReasons: input.blockedReasons ?? [],
    details: { operatorUserId: input.operatorUserId, approvalId: input.approvalId, passed: input.passed },
  });
}

// ─── Emergency disable ───────────────────────────────────────────────────────

export function buildEmergencyDisablePayload(input: {
  auditTrailId: AuditTrailId;
  disabledBy: string;
  reason: string;
  active: boolean;
}): MonitoringPayloadBase {
  return buildBase('EMERGENCY_DISABLE', {
    tenantId: null,
    auditTrailId: input.auditTrailId,
    blockedReasons: input.active ? ['F009_PHASE5B_EMERGENCY_DISABLE_ACTIVE'] : [],
    details: { disabledBy: input.disabledBy, reason: input.reason, active: input.active },
  });
}

// ─── Deployment gate blocked ─────────────────────────────────────────────────

export function buildDeploymentGateBlockedPayload(input: {
  expectedProjectId: string;
  expectedEnvironment: string;
  blockedReasons: BlockedReason[];
}): MonitoringPayloadBase {
  return buildBase('DEPLOYMENT_GATE_BLOCKED', {
    tenantId: null,
    auditTrailId: null,
    blockedReasons: input.blockedReasons,
    details: { expectedProjectId: input.expectedProjectId, expectedEnvironment: input.expectedEnvironment },
  });
}

// ─── Generic monitoring metrics ──────────────────────────────────────────────

export interface MonitoringMetricsSnapshot {
  readonly _kind: 'f009_phase5b_monitoring_metrics_snapshot';
  readonly executable: false;
  windowStart: Date;
  windowEnd: Date;
  transactionSuccessRate: number;
  blockedApplyCount: number;
  duplicateApplyCount: number;
  versionConflictCount: number;
  hashMismatchCount: number;
  productionErrorCount: number;
}

export interface MonitoringMetricsInput {
  windowStart: Date;
  windowEnd: Date;
  totalAttempts: number;
  successfulAttempts: number;
  blockedApplyCount: number;
  duplicateApplyCount: number;
  versionConflictCount: number;
  hashMismatchCount: number;
  productionErrorCount: number;
}

/** Builds a pure, non-executable monitoring metrics snapshot. */
export function buildMonitoringMetricsSnapshot(input: MonitoringMetricsInput): MonitoringMetricsSnapshot {
  const rate = input.totalAttempts > 0 ? input.successfulAttempts / input.totalAttempts : 0;
  return {
    _kind: 'f009_phase5b_monitoring_metrics_snapshot',
    executable: false,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    transactionSuccessRate: rate,
    blockedApplyCount: input.blockedApplyCount,
    duplicateApplyCount: input.duplicateApplyCount,
    versionConflictCount: input.versionConflictCount,
    hashMismatchCount: input.hashMismatchCount,
    productionErrorCount: input.productionErrorCount,
  };
}
