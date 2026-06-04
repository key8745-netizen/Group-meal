import type { TenantId, AuditTrailId, BlockedReason } from './aiBoundary';

// ─── Branded Primitives ───────────────────────────────────────────────────────

declare const _applyToken: unique symbol;
export type ApplyToken = string & { readonly [_applyToken]: true };
export function asApplyToken(v: string): ApplyToken { return v as ApplyToken; }

declare const _rollbackToken: unique symbol;
export type RollbackToken = string & { readonly [_rollbackToken]: true };
export function asRollbackToken(v: string): RollbackToken { return v as RollbackToken; }

declare const _configVersion: unique symbol;
export type ConfigVersion = string & { readonly [_configVersion]: true };
export function asConfigVersion(v: string): ConfigVersion { return v as ConfigVersion; }

declare const _diffHash: unique symbol;
export type DiffHash = string & { readonly [_diffHash]: true };
export function asDiffHash(v: string): DiffHash { return v as DiffHash; }

declare const _recommendationId: unique symbol;
export type ModelConfigRecommendationId = string & { readonly [_recommendationId]: true };
export function asModelConfigRecommendationId(v: string): ModelConfigRecommendationId { return v as ModelConfigRecommendationId; }

declare const _approvalId: unique symbol;
export type ModelConfigApprovalId = string & { readonly [_approvalId]: true };
export function asModelConfigApprovalId(v: string): ModelConfigApprovalId { return v as ModelConfigApprovalId; }

// ─── Weight Config ────────────────────────────────────────────────────────────

export type WeightMode = 'normalized' | 'independent_multiplier';

export interface ModelWeights {
  historicalUsageWeight: number;
  wasteRiskWeight: number;
  receivingDeltaWeight: number;
  safetyStockWeight: number;
}

export interface WeightBounds {
  min: number;
  max: number;
}

export const DEFAULT_WEIGHT_BOUNDS: Record<keyof ModelWeights, WeightBounds> = {
  historicalUsageWeight:  { min: 0.5, max: 2.0 },
  wasteRiskWeight:        { min: 0.5, max: 2.0 },
  receivingDeltaWeight:   { min: 0.5, max: 2.0 },
  safetyStockWeight:      { min: 0.5, max: 2.0 },
};

export const NORMALIZED_WEIGHT_EPSILON = 0.0001;

// ─── Config Version ───────────────────────────────────────────────────────────

export type ConfigApprovalStatus =
  | 'RECOMMENDED'
  | 'REVIEWING'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLY_BLOCKED'
  | 'APPLIED'
  | 'ROLLBACK_REQUESTED'
  | 'ROLLED_BACK';

export interface ModelConfigVersion {
  version: ConfigVersion;
  tenantId: TenantId;
  weights: ModelWeights;
  weightMode: WeightMode;
  createdAt: Date;
  createdByHumanUserId: string;
  auditTrailId: AuditTrailId;
  sourceRecommendationId: ModelConfigRecommendationId | null;
  configHash: DiffHash;
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export interface ModelConfigDiff {
  tenantId: TenantId;
  previousVersion: ConfigVersion;
  proposedVersion: ConfigVersion;
  previousWeights: ModelWeights;
  proposedWeights: Partial<ModelWeights>;
  changedFields: (keyof ModelWeights)[];
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  computedAt: Date;
}

// ─── Human Approval ───────────────────────────────────────────────────────────

export interface HumanModelConfigApproval {
  readonly _kind: 'model_config_approval';
  approvalId: ModelConfigApprovalId;
  tenantId: TenantId;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvedByHumanUserId: string;
  approvalReason: string;
  approvedAt: Date;
  auditTrailId: AuditTrailId;
  targetVersion: ConfigVersion;
  diffHash: DiffHash;
  aiCanApprove: false;
}

// ─── Apply Plan (dry-run only) ────────────────────────────────────────────────

export interface ModelConfigApplyPlan {
  readonly _kind: 'model_config_apply_plan';
  planId: string;
  tenantId: TenantId;
  sourceRecommendationId: ModelConfigRecommendationId;
  humanApprovalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  previousVersion: ConfigVersion;
  proposedNewVersion: ConfigVersion;
  proposedWeights: Partial<ModelWeights>;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  weightMode: WeightMode;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  executable: false;
  aiCanApply: false;
  requiresHumanApproval: true;
  createdAt: Date;
}

// ─── Rollback Plan (dry-run only) ─────────────────────────────────────────────

export interface ModelConfigRollbackPlan {
  readonly _kind: 'model_config_rollback_plan';
  planId: string;
  tenantId: TenantId;
  currentVersion: ConfigVersion;
  rollbackTargetVersion: ConfigVersion;
  rollbackToken: RollbackToken;
  rollbackReason: string;
  auditTrailId: AuditTrailId;
  humanApprovalRequired: true;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  executable: false;
  aiCanRollback: false;
  createdAt: Date;
}

// ─── Audit Events ─────────────────────────────────────────────────────────────

export type ModelConfigAuditEventType =
  | 'MODEL_CONFIG_REVIEW_STARTED'
  | 'MODEL_CONFIG_APPROVED_BY_HUMAN'
  | 'MODEL_CONFIG_REJECTED_BY_HUMAN'
  | 'MODEL_CONFIG_APPLY_PLAN_CREATED'
  | 'MODEL_CONFIG_APPLY_BLOCKED'
  | 'MODEL_CONFIG_ROLLBACK_PLAN_CREATED'
  | 'MODEL_CONFIG_ROLLBACK_BLOCKED';

export interface ModelConfigAuditEvent {
  eventType: ModelConfigAuditEventType;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  sourceRecommendationId: ModelConfigRecommendationId | null;
  approvalId: ModelConfigApprovalId | null;
  previousVersion: ConfigVersion | null;
  newVersion: ConfigVersion | null;
  diffHash: DiffHash | null;
  blockedReasons: BlockedReason[];
  metadata: {
    aiCanApply: false;
    requiresHumanApproval: true;
    approvedByHumanUserId: string | null;
    appliedByHumanUserId: string | null;
    rollbackReason: string | null;
    rollbackReference: ConfigVersion | null;
  };
  createdAt: Date;
}

// ─── Validation Results ───────────────────────────────────────────────────────

export interface WeightValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  weightMode: WeightMode;
  normalizedSum: number | null;
}

export interface ApplyPlanValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

export interface RollbackPlanValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}
