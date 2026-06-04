import type { TenantId, AuditTrailId, BlockedReason } from '../types/aiBoundary';
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
  newVersion: ConfigVersion;
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
    newVersion: payload.newVersion,
    auditTrailId: payload.auditTrailId,
    rollbackReason: payload.rollbackReason,
  });
  if (!result.ok) throw new Error(`Cannot generate rollbackToken: ${result.reason}`);
  return asRollbackToken(result.hash);
}

export interface IdempotencyLockPlanInput {
  token: ApplyToken | RollbackToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId?: ModelConfigApprovalId;
  rollbackTargetVersion?: ConfigVersion;
  expectedCurrentVersion?: ConfigVersion;
  newVersion?: ConfigVersion;
}

export function buildIdempotencyLockPlan(input: IdempotencyLockPlanInput): IdempotencyLockPlan {
  return {
    _kind: 'idempotency_lock_plan',
    lockKey: `idempotency:${input.tenantId}:${input.token}`,
    token: input.token,
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    planOnly: true,
    approvalId: input.approvalId,
    rollbackTargetVersion: input.rollbackTargetVersion,
    expectedCurrentVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    status: 'PLANNED',
    duplicatePolicy: 'BLOCKED_DUPLICATE',
    conflictPolicy: 'VERSION_CONFLICT_BLOCKED',
  };
}

export type IdempotencyConflictType =
  | 'BLOCKED_DUPLICATE'
  | 'IDEMPOTENT_REPLAY_BLOCKED'
  | 'VERSION_CONFLICT'
  | 'APPROVAL_REUSE_BLOCKED'
  | 'NO_CONFLICT';

export interface IdempotencyConflictResult {
  conflict: IdempotencyConflictType;
  blockedReason: BlockedReason | null;
}

export function simulateIdempotencyConflict(
  existing: IdempotencyLockPlan,
  incoming: IdempotencyLockPlan,
): IdempotencyConflictResult {
  // Same token + same approvalId + same versions = idempotent replay
  if (existing.token === incoming.token &&
      existing.approvalId === incoming.approvalId &&
      existing.rollbackTargetVersion === incoming.rollbackTargetVersion &&
      existing.newVersion === incoming.newVersion) {
    return { conflict: 'IDEMPOTENT_REPLAY_BLOCKED', blockedReason: 'IDEMPOTENCY_REPLAY_BLOCKED' };
  }
  // Same token but different approvalId = duplicate with different approval
  if (existing.token === incoming.token && existing.approvalId !== incoming.approvalId) {
    return { conflict: 'BLOCKED_DUPLICATE', blockedReason: 'IDEMPOTENCY_DUPLICATE_ROLLBACK_TOKEN' };
  }
  // Same rollbackTargetVersion but different newVersion = version conflict
  if (existing.rollbackTargetVersion &&
      incoming.rollbackTargetVersion &&
      existing.rollbackTargetVersion === incoming.rollbackTargetVersion &&
      existing.newVersion !== incoming.newVersion) {
    return { conflict: 'VERSION_CONFLICT', blockedReason: 'IDEMPOTENCY_VERSION_CONFLICT' };
  }
  // Same approvalId but different token = approval reuse
  if (existing.approvalId &&
      incoming.approvalId &&
      existing.approvalId === incoming.approvalId &&
      existing.token !== incoming.token) {
    return { conflict: 'APPROVAL_REUSE_BLOCKED', blockedReason: 'IDEMPOTENCY_APPROVAL_REUSE_BLOCKED' };
  }
  return { conflict: 'NO_CONFLICT', blockedReason: null };
}
