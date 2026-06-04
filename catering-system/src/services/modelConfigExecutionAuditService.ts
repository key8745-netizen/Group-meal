import type { TenantId, AuditTrailId, BlockedReason } from '../types/aiBoundary';
import type {
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  RollbackToken,
} from '../types/modelConfigApply';
import type {
  ModelConfigExecutionAuditEvent,
  ModelConfigExecutionAuditEventType,
} from '../types/modelConfigApplyExecution';

export interface BuildExecutionAuditEventInput {
  eventType: ModelConfigExecutionAuditEventType;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId | null;
  sourceRecommendationId: ModelConfigRecommendationId | null;
  previousVersion: ConfigVersion | null;
  newVersion: ConfigVersion | null;
  rollbackTargetVersion: ConfigVersion | null;
  diffHash: DiffHash | null;
  applyToken: ApplyToken | null;
  rollbackToken: RollbackToken | null;
  blockedReasons: BlockedReason[];
  approvedByHumanUserId: string | null;
  rollbackReason: string | null;
  now?: Date;
}

export function buildModelConfigExecutionAuditEvent(
  input: BuildExecutionAuditEventInput,
): ModelConfigExecutionAuditEvent {
  const now = input.now ?? new Date();
  return {
    eventType: input.eventType,
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    approvalId: input.approvalId,
    sourceRecommendationId: input.sourceRecommendationId,
    previousVersion: input.previousVersion,
    newVersion: input.newVersion,
    rollbackTargetVersion: input.rollbackTargetVersion,
    diffHash: input.diffHash,
    applyToken: input.applyToken,
    rollbackToken: input.rollbackToken,
    blockedReasons: input.blockedReasons,
    metadata: {
      aiCanExecute: false,
      executable: false,
      requiresHumanApproval: true,
      approvedByHumanUserId: input.approvedByHumanUserId,
      rollbackReason: input.rollbackReason,
    },
    createdAt: now,
  };
}
