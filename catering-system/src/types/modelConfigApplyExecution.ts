import type { TenantId, AuditTrailId, BlockedReason, CallerType } from './aiBoundary';
import type {
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  RollbackToken,
  ModelWeights,
  WeightMode,
} from './modelConfigApply';

// ─── Approval Status ──────────────────────────────────────────────────────────

export type PersistedApprovalStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

// ─── Persisted Human Approval (real, would be stored in Firestore) ────────────

export interface PersistedHumanModelConfigApproval {
  readonly _kind: 'persisted_human_model_config_approval';
  approvalId: ModelConfigApprovalId;
  tenantId: TenantId;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvedByHumanUserId: string;
  approvalReason: string;
  approvedAt: Date;
  auditTrailId: AuditTrailId;
  targetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  diffHash: DiffHash;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  status: PersistedApprovalStatus;
  /** Hard invariant: AI can never approve config changes */
  readonly aiCanApprove: false;
  /** Hard invariant: this is a persisted record (contrast with SimulatedHumanModelConfigApproval) */
  readonly persisted: true;
}

// ─── Rollback Approval (real persisted, separate from apply approval) ─────────

export interface PersistedHumanModelConfigRollbackApproval {
  readonly _kind: 'persisted_human_model_config_rollback_approval';
  approvalId: ModelConfigApprovalId;
  tenantId: TenantId;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  approvedByHumanUserId: string;
  approvalReason: string;
  rollbackReason: string;
  approvedAt: Date;
  auditTrailId: AuditTrailId;
  rollbackToken: RollbackToken;
  status: PersistedApprovalStatus;
  readonly aiCanApprove: false;
  readonly persisted: true;
}

// ─── Apply Transaction Plan (planning only — not executable) ─────────────────

export interface SettingsHistoryWritePlan {
  readonly _kind: 'settings_history_write_plan';
  tenantId: TenantId;
  newVersion: ConfigVersion;
  previousVersion: ConfigVersion;
  configHash: DiffHash;
  diffHash: DiffHash;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  createdByHumanUserId: string;
  createdAt: Date;
  readonly immutable: true;
  readonly appendOnly: true;
}

export interface SettingsUpdatePlan {
  readonly _kind: 'settings_update_plan';
  tenantId: TenantId;
  currentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  proposedWeights: Partial<ModelWeights>;
  weightMode: WeightMode;
  configAfterHash: DiffHash;
}

export interface IdempotencyLockPlan {
  readonly _kind: 'idempotency_lock_plan';
  lockKey: string;
  token: ApplyToken | RollbackToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  readonly planOnly: true;
  // Phase 3 additions:
  rollbackTargetVersion?: ConfigVersion;
  expectedCurrentVersion?: ConfigVersion;
  newVersion?: ConfigVersion;
  approvalId?: ModelConfigApprovalId;
  status: 'PLANNED';
  duplicatePolicy: 'BLOCKED_DUPLICATE';
  conflictPolicy: 'VERSION_CONFLICT_BLOCKED';
}

export interface AuditEventPlan {
  readonly _kind: 'audit_event_plan';
  eventType: string;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId | null;
  previousVersion: ConfigVersion;
  newVersion: ConfigVersion;
  rollbackTargetVersion: ConfigVersion | null;
  diffHash: DiffHash | null;
  configBeforeHash: DiffHash | null;
  configAfterHash: DiffHash | null;
  applyToken: ApplyToken | null;
  rollbackToken: RollbackToken | null;
  rollbackReason: string | null;
  readonly aiCanExecute: false;
  readonly executable: false;
}

export interface ModelConfigApplyTransactionPlan {
  readonly _kind: 'model_config_apply_transaction_plan';
  planId: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  applyToken: ApplyToken;
  settingsHistoryWritePlan: SettingsHistoryWritePlan;
  settingsUpdatePlan: SettingsUpdatePlan;
  idempotencyLockPlan: IdempotencyLockPlan;
  auditEventPlan: AuditEventPlan;
  blockedReasons: BlockedReason[];
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly requiresHumanApproval: true;
  createdAt: Date;
}

export interface ModelConfigRollbackTransactionPlan {
  readonly _kind: 'model_config_rollback_transaction_plan';
  planId: string;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  rollbackToken: RollbackToken;
  settingsHistoryWritePlan: SettingsHistoryWritePlan;
  settingsUpdatePlan: SettingsUpdatePlan;
  idempotencyLockPlan: IdempotencyLockPlan;
  auditEventPlan: AuditEventPlan;
  blockedReasons: BlockedReason[];
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly requiresHumanApproval: true;
  createdAt: Date;
}

// ─── Preflight Results ────────────────────────────────────────────────────────

export interface ModelConfigApplyPreflightResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  tenantId: TenantId;
  callerType: CallerType;
}

export interface ModelConfigRollbackPreflightResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  tenantId: TenantId;
  callerType: CallerType;
}

// ─── Settings History Version ─────────────────────────────────────────────────

export interface SettingsHistoryVersion {
  readonly _kind: 'settings_history_version';
  tenantId: TenantId;
  version: ConfigVersion;
  previousVersion: ConfigVersion;
  configHash: DiffHash;
  diffHash: DiffHash;
  sourceRecommendationId: ModelConfigRecommendationId | null;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  createdByHumanUserId: string;
  createdAt: Date;
  readonly immutable: true;
}

// ─── Execution Audit Events ───────────────────────────────────────────────────

export type ModelConfigExecutionAuditEventType =
  | 'MODEL_CONFIG_APPLY_REQUESTED'
  | 'MODEL_CONFIG_APPLIED_PLAN_CREATED'
  | 'MODEL_CONFIG_APPLY_BLOCKED'
  | 'MODEL_CONFIG_ROLLBACK_REQUESTED'
  | 'MODEL_CONFIG_ROLLBACK_PLAN_CREATED'
  | 'MODEL_CONFIG_ROLLBACK_BLOCKED';

export interface ModelConfigExecutionAuditEvent {
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
  metadata: {
    readonly aiCanExecute: false;
    readonly executable: false;
    readonly requiresHumanApproval: true;
    approvedByHumanUserId: string | null;
    rollbackReason: string | null;
  };
  createdAt: Date;
}
