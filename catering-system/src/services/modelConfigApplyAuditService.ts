import type { TenantId, AuditTrailId, BlockedReason } from '../types/aiBoundary';
import type {
  ModelConfigAuditEvent,
  ModelConfigAuditEventType,
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
} from '../types/modelConfigApply';

export interface BuildAuditEventInput {
  eventType: ModelConfigAuditEventType;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  sourceRecommendationId?: ModelConfigRecommendationId | null;
  approvalId?: ModelConfigApprovalId | null;
  previousVersion?: ConfigVersion | null;
  newVersion?: ConfigVersion | null;
  diffHash?: DiffHash | null;
  blockedReasons?: BlockedReason[];
  approvedByHumanUserId?: string | null;
  appliedByHumanUserId?: string | null;
  rollbackReason?: string | null;
  rollbackReference?: ConfigVersion | null;
  now?: Date;
}

export function buildModelConfigAuditEvent(input: BuildAuditEventInput): ModelConfigAuditEvent {
  return {
    eventType: input.eventType,
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    sourceRecommendationId: input.sourceRecommendationId ?? null,
    approvalId: input.approvalId ?? null,
    previousVersion: input.previousVersion ?? null,
    newVersion: input.newVersion ?? null,
    diffHash: input.diffHash ?? null,
    blockedReasons: input.blockedReasons ?? [],
    metadata: {
      aiCanApply: false,
      requiresHumanApproval: true,
      approvedByHumanUserId: input.approvedByHumanUserId ?? null,
      appliedByHumanUserId: input.appliedByHumanUserId ?? null,
      rollbackReason: input.rollbackReason ?? null,
      rollbackReference: input.rollbackReference ?? null,
    },
    createdAt: input.now ?? new Date(),
  };
}
