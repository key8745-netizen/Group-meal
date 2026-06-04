import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  RollbackToken,
} from '../types/modelConfigApply';
import { asApplyToken, asRollbackToken } from '../types/modelConfigApply';
import type { IdempotencyLockPlan } from '../types/modelConfigApplyExecution';
import { hashCanonicalObject } from './modelConfigCanonicalHashService';

export interface ApplyTokenPayload {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  auditTrailId: AuditTrailId;
  diffHash: DiffHash;
}

export interface RollbackTokenPayload {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  auditTrailId: AuditTrailId;
  rollbackReason: string;
}

export function generateApplyToken(payload: ApplyTokenPayload): ApplyToken {
  const result = hashCanonicalObject({
    tenantId: payload.tenantId,
    approvalId: payload.approvalId,
    sourceRecommendationId: payload.sourceRecommendationId,
    expectedCurrentVersion: payload.expectedCurrentVersion,
    newVersion: payload.newVersion,
    auditTrailId: payload.auditTrailId,
    diffHash: payload.diffHash,
  });
  if (!result.ok) throw new Error(`Cannot generate applyToken: ${result.reason}`);
  return asApplyToken(result.hash);
}

export function generateRollbackToken(payload: RollbackTokenPayload): RollbackToken {
  const result = hashCanonicalObject({
    tenantId: payload.tenantId,
    approvalId: payload.approvalId,
    rollbackTargetVersion: payload.rollbackTargetVersion,
    expectedCurrentVersion: payload.expectedCurrentVersion,
    auditTrailId: payload.auditTrailId,
    rollbackReason: payload.rollbackReason,
  });
  if (!result.ok) throw new Error(`Cannot generate rollbackToken: ${result.reason}`);
  return asRollbackToken(result.hash);
}

export function buildIdempotencyLockPlan(
  token: ApplyToken | RollbackToken,
  tenantId: TenantId,
  auditTrailId: AuditTrailId,
): IdempotencyLockPlan {
  return {
    _kind: 'idempotency_lock_plan',
    lockKey: `idempotency:${tenantId}:${token}`,
    token,
    tenantId,
    auditTrailId,
    planOnly: true,
  };
}
