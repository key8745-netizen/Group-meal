/**
 * realModelConfigApplyExecution.ts
 *
 * Feature 007 Phase 1: Real Model Config Apply Transaction Execution
 * TypeScript interfaces for the real apply transaction boundary.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI, no async, no side effects
 *  - All plans are non-executable (executable: false, aiCanExecute: false)
 *  - AI caller hard-blocked
 *  - Tenant hard guard executes first
 */

import type { TenantId, AuditTrailId, BlockedReason } from './aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId } from './modelConfigApply';

// ─── Caller Context ───────────────────────────────────────────────────────────

export type RealApplyCallerType = 'HUMAN' | 'AI' | 'UNKNOWN';

export interface RealModelConfigApplyCallerContext {
  callerType: RealApplyCallerType;
  callerUserId: string | null | undefined;
  isServiceAccount?: boolean;
  isAdminSdk?: boolean;
  clientIp?: string;
}

// ─── Apply Request ────────────────────────────────────────────────────────────

export interface RealModelConfigApplyRequest {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  applyToken: ApplyToken;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  callerContext: RealModelConfigApplyCallerContext;
}

// ─── Guard Result ─────────────────────────────────────────────────────────────

export interface RealModelConfigApplyGuardResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
}

// ─── Transaction Contract (non-executable plan) ───────────────────────────────

export interface RealModelConfigApplyTransactionContract {
  readonly _kind: 'real_model_config_apply_transaction_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly requiresHumanApproval: true;
  readonly dryRunOnly: true;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  applyToken: ApplyToken;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  guardResult: RealModelConfigApplyGuardResult;
  blockedReasons: BlockedReason[];
  generatedAt: Date;
  note: string;
}

// ─── Pseudo-plan Step Descriptors ────────────────────────────────────────────

export interface PseudoPlanStep {
  readonly step: number;
  readonly name: string;
  readonly description: string;
  readonly executable: false;
}

export interface RealModelConfigApplyPseudoPlan {
  readonly _kind: 'real_model_config_apply_pseudo_plan';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly dryRunOnly: true;
  readonly containsRunTransaction: false;
  readonly containsWriteFunction: false;
  readonly containsDeleteFunction: false;
  readonly containsFirestoreReference: false;
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  applyToken: ApplyToken;
  guardPlan: PseudoPlanStep;
  approvalValidationPlan: PseudoPlanStep;
  settingsReadPlan: PseudoPlanStep;
  idempotencyLockPlan: PseudoPlanStep;
  settingsHistoryWritePlan: PseudoPlanStep;
  settingsUpdatePlan: PseudoPlanStep;
  auditEventPlan: PseudoPlanStep;
  generatedAt: Date;
}

// ─── Idempotency Lock Schema ──────────────────────────────────────────────────

export type RealApplyLockStatus =
  | 'PENDING'
  | 'CONSUMED'
  | 'ABANDONED'
  | 'EXPIRED';

export interface RealModelConfigIdempotencyLockSchema {
  readonly _kind: 'real_model_config_idempotency_lock_schema';
  /** `{tenantId}:{applyToken}` */
  lockId: string;
  collectionPath: 'modelConfigIdempotencyLocks';
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
  payloadHash: DiffHash;
  expectedCurrentVersion: ConfigVersion;
  status: RealApplyLockStatus;
  createdAt: Date;
  expiresAt: Date;
  cleanupEligibleAt: Date;
  readonly aiCanOwnLock: false;
  cleanupOwner: 'HUMAN_SERVICE' | 'SYSTEM_MAINTENANCE';
  cleanupTtlSeconds: number;
}

// ─── settingsHistory Write Contract ──────────────────────────────────────────

export interface RealModelConfigSettingsHistoryWriteContract {
  readonly _kind: 'real_model_config_settings_history_write_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly immutable: true;
  tenantId: TenantId;
  version: ConfigVersion;
  previousVersion: ConfigVersion;
  configHash: DiffHash;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  sourceRecommendationId: ModelConfigRecommendationId;
  approvalId: ModelConfigApprovalId;
  auditTrailId: AuditTrailId;
  createdByHumanUserId: string;
  collectionPath: string;
  note: string;
}

// ─── Audit Event Payload ──────────────────────────────────────────────────────

export type RealApplyAuditEventType =
  | 'MODEL_CONFIG_APPLY_REQUESTED'
  | 'MODEL_CONFIG_APPLY_STARTED_PLAN'
  | 'MODEL_CONFIG_APPLIED_PLAN_CREATED'
  | 'MODEL_CONFIG_APPLY_BLOCKED'
  | 'MODEL_CONFIG_IDEMPOTENCY_BLOCKED'
  | 'MODEL_CONFIG_VERSION_CONFLICT_BLOCKED'
  | 'MODEL_CONFIG_AUDIT_WRITE_FAILED_PLAN';

export interface RealModelConfigAuditEventPayload {
  readonly _kind: 'real_model_config_audit_event_payload';
  readonly executable: false;
  readonly aiCanExecute: false;
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
  blockedReasons: BlockedReason[];
  generatedAt: Date;
  note: string;
}

// ─── Canonicalization ─────────────────────────────────────────────────────────

export interface CanonicalizedModelConfigHashInput {
  readonly _kind: 'canonicalized_model_config_hash_input';
  canonicalJson: string;
  inputHash: DiffHash;
  deterministicKeys: string[];
  warnings: string[];
}

export interface CanonicalizationGuardResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  canonicalized: CanonicalizedModelConfigHashInput | null;
}
