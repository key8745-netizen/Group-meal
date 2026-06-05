/**
 * realModelConfigExecutionAuditService.ts
 *
 * Feature 007 Phase 1: Audit Event Pure Helper
 *
 * Builds pure audit event payloads for real model config apply operations.
 * Does NOT write to Firestore — pure payload generation only.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No async, no side effects
 *  - executable: false, aiCanExecute: false on all payloads
 *  - AI cannot write audit events
 */

import type { BlockedReason, AuditTrailId } from '../types/aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId } from '../types/modelConfigApply';
import type {
  RealModelConfigAuditEventPayload,
  RealApplyAuditEventType,
  RealApplyCallerType,
} from '../types/realModelConfigApplyExecution';
import type { TenantId } from '../types/aiBoundary';

export interface BuildAuditEventInput {
  eventType: RealApplyAuditEventType;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  callerUserId: string;
  callerType: RealApplyCallerType;
  blockedReasons?: BlockedReason[];
  now?: Date;
}

/**
 * Builds a pure audit event payload for a real model config apply operation.
 *
 * Supported event types:
 *  - MODEL_CONFIG_APPLY_REQUESTED
 *  - MODEL_CONFIG_APPLY_STARTED_PLAN
 *  - MODEL_CONFIG_APPLIED_PLAN_CREATED
 *  - MODEL_CONFIG_APPLY_BLOCKED
 *  - MODEL_CONFIG_IDEMPOTENCY_BLOCKED
 *  - MODEL_CONFIG_VERSION_CONFLICT_BLOCKED
 *  - MODEL_CONFIG_AUDIT_WRITE_FAILED_PLAN
 *
 * Phase 1: pure payload — not written to Firestore.
 * Phase 2+ (future): caller writes this payload to auditTrail collection inside transaction.
 */
export function buildRealModelConfigApplyAuditEventPayload(
  input: BuildAuditEventInput,
): RealModelConfigAuditEventPayload {
  const now = input.now ?? new Date();
  const blockedReasons = input.blockedReasons ?? [];

  const note = buildNote(input.eventType, blockedReasons, input.applyToken as string);

  return {
    _kind: 'real_model_config_audit_event_payload',
    executable: false,
    aiCanExecute: false,
    eventType: input.eventType,
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    sourceRecommendationId: input.sourceRecommendationId,
    auditTrailId: input.auditTrailId,
    expectedCurrentVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    configBeforeHash: input.configBeforeHash,
    configAfterHash: input.configAfterHash,
    diffHash: input.diffHash,
    applyToken: input.applyToken,
    callerUserId: input.callerUserId,
    callerType: input.callerType,
    blockedReasons,
    generatedAt: now,
    note,
  };
}

function buildNote(
  eventType: RealApplyAuditEventType,
  blockedReasons: BlockedReason[],
  applyToken: string,
): string {
  switch (eventType) {
    case 'MODEL_CONFIG_APPLY_REQUESTED':
      return `Apply requested. Token: ${applyToken}. Awaiting guard validation.`;
    case 'MODEL_CONFIG_APPLY_STARTED_PLAN':
      return `Apply transaction pseudo-plan started. Token: ${applyToken}.`;
    case 'MODEL_CONFIG_APPLIED_PLAN_CREATED':
      return `Apply transaction pseudo-plan created. Token: ${applyToken}. Awaiting human execution.`;
    case 'MODEL_CONFIG_APPLY_BLOCKED':
      return `Apply blocked. Token: ${applyToken}. Reasons: ${blockedReasons.join(', ')}.`;
    case 'MODEL_CONFIG_IDEMPOTENCY_BLOCKED':
      return `Apply blocked by idempotency lock. Token: ${applyToken}. Reasons: ${blockedReasons.join(', ')}.`;
    case 'MODEL_CONFIG_VERSION_CONFLICT_BLOCKED':
      return `Apply blocked by version conflict. Token: ${applyToken}. Reasons: ${blockedReasons.join(', ')}.`;
    case 'MODEL_CONFIG_AUDIT_WRITE_FAILED_PLAN':
      return `Audit write failed (plan only). Token: ${applyToken}. Reasons: ${blockedReasons.join(', ')}.`;
  }
}
