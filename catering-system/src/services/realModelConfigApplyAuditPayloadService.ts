/**
 * realModelConfigApplyAuditPayloadService.ts
 *
 * Feature 009 Phase 1: Audit Event Payload Pure Helper
 *
 * Builds audit event payloads for real apply transaction events.
 * Phase 1: pure payload generation — nothing is written to Firestore.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { TenantId, AuditTrailId, BlockedReason } from '../types/aiBoundary';
import type {
  ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId,
} from '../types/modelConfigApply';
import type { TokenVerificationSource } from '../types/realApplyTransactionExecution';
import type {
  ModelConfigApplyAuditEventPayload,
  AuditEventType,
  F009CallerType,
} from '../types/realModelConfigApplyTransaction';

export interface AuditPayloadInput {
  eventType: AuditEventType;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  actualCurrentVersion?: ConfigVersion;
  newVersion?: ConfigVersion;
  configBeforeHash: DiffHash;
  currentConfigHash?: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  payloadHash?: DiffHash;
  callerUserId: string;
  callerType: F009CallerType;
  tokenVerificationSource: TokenVerificationSource;
  blockedReasons?: BlockedReason[];
}

/** Builds a pure audit event payload. Does not write to Firestore. */
export function buildAuditEventPayload(input: AuditPayloadInput): ModelConfigApplyAuditEventPayload {
  return {
    _kind: 'model_config_apply_audit_event_payload',
    eventType: input.eventType,
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    sourceRecommendationId: input.sourceRecommendationId,
    auditTrailId: input.auditTrailId,
    expectedCurrentVersion: input.expectedCurrentVersion,
    actualCurrentVersion: input.actualCurrentVersion,
    newVersion: input.newVersion,
    configBeforeHash: input.configBeforeHash,
    currentConfigHash: input.currentConfigHash,
    configAfterHash: input.configAfterHash,
    diffHash: input.diffHash,
    applyToken: input.applyToken,
    payloadHash: input.payloadHash,
    callerUserId: input.callerUserId,
    callerType: input.callerType,
    tokenVerificationSource: input.tokenVerificationSource,
    blockedReasons: input.blockedReasons,
    generatedAt: new Date(),
  };
}

/** Validates that an audit payload contains all mandatory fields. */
export function validateAuditPayloadCompleteness(
  payload: ModelConfigApplyAuditEventPayload,
): { complete: boolean; missingFields: string[] } {
  const required: (keyof ModelConfigApplyAuditEventPayload)[] = [
    'eventType', 'tenantId', 'approvalId', 'sourceRecommendationId', 'auditTrailId',
    'expectedCurrentVersion', 'configBeforeHash', 'configAfterHash', 'diffHash',
    'applyToken', 'callerUserId', 'callerType', 'tokenVerificationSource', 'generatedAt',
  ];
  const missing = required.filter(f => payload[f] === undefined || payload[f] === null || payload[f] === '');
  return { complete: missing.length === 0, missingFields: missing };
}
