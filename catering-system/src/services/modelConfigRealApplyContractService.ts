/**
 * modelConfigRealApplyContractService.ts
 *
 * Feature 006 Phase 1: Real Apply Transaction Contract Validators
 *
 * Validates all pre-conditions required before a real Firestore apply/rollback
 * transaction may be initiated. Phase 1 is pure logic only — no Firestore I/O.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI components, no async, no side effects
 *  - All contracts: aiCanExecute: false, executable: false, requiresHumanApproval: true
 *  - Tenant hard guard executes first in every validator
 *  - AI caller is hard-blocked regardless of approval chain
 */

import type { BlockedReason, CallerType } from '../types/aiBoundary';
import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelConfigApprovalId,
  ConfigVersion,
  DiffHash,
  ApplyToken,
  RollbackToken,
} from '../types/modelConfigApply';
import type { PersistedHumanModelConfigApproval, PersistedHumanModelConfigRollbackApproval } from '../types/modelConfigApplyExecution';
import type {
  RealApplyTransactionContract,
  RealRollbackTransactionContract,
  RealApplyContractResult,
  RealRollbackContractResult,
  HistoricalConfigHashVerification,
  LockAcquisitionPlan,
  IdempotencyLockDocument,
  LockCleanupResponsibility,
} from '../types/modelConfigRealApply';
import { IDEMPOTENCY_LOCK_COLLECTION, LOCK_TTL_SECONDS } from '../types/modelConfigRealApply';
import { computeRollbackReasonHash } from './modelConfigAuditContinuityService';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildLockDocument(params: {
  token: ApplyToken | RollbackToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  rollbackTargetVersion?: ConfigVersion;
  rollbackReasonHash?: string;
  callerUserId: string;
  now: Date;
}): IdempotencyLockDocument {
  const expiresAt = new Date(params.now.getTime() + LOCK_TTL_SECONDS * 1000);
  return {
    _kind: 'idempotency_lock_document',
    lockId: `${params.tenantId}:${params.token}`,
    token: params.token,
    tenantId: params.tenantId,
    auditTrailId: params.auditTrailId,
    approvalId: params.approvalId,
    expectedCurrentVersion: params.expectedCurrentVersion,
    newVersion: params.newVersion,
    rollbackTargetVersion: params.rollbackTargetVersion,
    rollbackReasonHash: params.rollbackReasonHash,
    status: 'PLANNED',
    cleanupResponsibility: 'TRANSACTION_COMMIT_RELEASES' as LockCleanupResponsibility,
    ttlSeconds: LOCK_TTL_SECONDS,
    createdAt: params.now,
    expiresAt,
    createdByHumanUserId: params.callerUserId,
  };
}

function buildLockAcquisitionPlan(doc: IdempotencyLockDocument): LockAcquisitionPlan {
  const documentPath = `${IDEMPOTENCY_LOCK_COLLECTION}/${doc.lockId}`;
  return {
    _kind: 'lock_acquisition_plan',
    planOnly: true,
    executable: false,
    lockId: doc.lockId,
    collection: IDEMPOTENCY_LOCK_COLLECTION,
    documentPath,
    lockDocument: doc,
    cleanupResponsibility: 'TRANSACTION_COMMIT_RELEASES',
    cleanupNote:
      'Lock is released by the committing Firestore transaction. ' +
      'If the transaction never commits, TTL policy expires the document after ' +
      LOCK_TTL_SECONDS +
      's. ' +
      'Manual admin release is available via MANUAL_ADMIN_RELEASE protocol for stuck locks.',
  };
}

// ─── Apply Contract Validator ─────────────────────────────────────────────────

export interface RealApplyContractInput {
  contractId: string;
  callerType: CallerType;
  callerUserId: string;
  approval: PersistedHumanModelConfigApproval;
  expectedTenantId: TenantId;
  expectedCurrentVersion: ConfigVersion;
  applyToken: ApplyToken;
  now?: Date;
}

/**
 * Validates all pre-conditions for a real model config apply transaction.
 *
 * Validation order (tenant hard guard is always first):
 *  1. Tenant hard guard
 *  2. AI caller hard block
 *  3. Approval status
 *  4. Approval not expired
 *  5. Human approver present
 *  6. Approval reason present
 *  7. Audit trail present
 *  8. Apply token present
 *  9. Config hashes present
 *  10. Expected version match
 *  11. Source recommendation present
 */
export function validateRealApplyTransactionContract(
  input: RealApplyContractInput,
): RealApplyContractResult {
  const now = input.now ?? new Date();
  const blocked: BlockedReason[] = [];

  // 1. Tenant hard guard — must be first
  if (input.approval.tenantId !== input.expectedTenantId) {
    blocked.push('REAL_APPLY_TENANT_MISMATCH');
    return { contractValid: false, blockedReasons: blocked, contract: null };
  }

  // 2. AI caller hard block — not bypassable
  if (input.callerType === 'ai') {
    blocked.push('REAL_APPLY_AI_CALLER_BLOCKED');
  }

  // 3. Approval status
  if (input.approval.status !== 'APPROVED') {
    if (input.approval.status === 'EXPIRED') {
      blocked.push('REAL_APPLY_APPROVAL_EXPIRED');
    } else {
      blocked.push('REAL_APPLY_APPROVAL_NOT_APPROVED');
    }
  }

  // 4. Human approver
  if (!input.approval.approvedByHumanUserId || input.approval.approvedByHumanUserId.trim() === '') {
    blocked.push('REAL_APPLY_MISSING_HUMAN_APPROVER');
  }

  // 5. Approval reason
  if (!input.approval.approvalReason || input.approval.approvalReason.trim() === '') {
    blocked.push('REAL_APPLY_MISSING_APPROVAL_REASON');
  }

  // 6. Audit trail
  if (!input.approval.auditTrailId) {
    blocked.push('REAL_APPLY_MISSING_AUDIT_TRAIL');
  }

  // 7. Apply token
  if (!input.applyToken) {
    blocked.push('REAL_APPLY_MISSING_APPLY_TOKEN');
  }

  // 8. Config hashes
  if (!input.approval.configBeforeHash) {
    blocked.push('REAL_APPLY_CONFIG_BEFORE_HASH_MISMATCH');
  }
  if (!input.approval.diffHash) {
    blocked.push('REAL_APPLY_DIFF_HASH_MISMATCH');
  }

  // 9. Expected version match (race-condition guard)
  if ((input.approval.expectedCurrentVersion as string) !== (input.expectedCurrentVersion as string)) {
    blocked.push('REAL_APPLY_EXPECTED_VERSION_MISMATCH');
  }

  // 10. Source recommendation present
  if (!input.approval.sourceRecommendationId) {
    blocked.push('REAL_APPLY_SOURCE_REC_MISMATCH');
  }

  if (blocked.length > 0) {
    return { contractValid: false, blockedReasons: blocked, contract: null };
  }

  const lockDoc = buildLockDocument({
    token: input.applyToken,
    tenantId: input.approval.tenantId,
    auditTrailId: input.approval.auditTrailId,
    approvalId: input.approval.approvalId,
    expectedCurrentVersion: input.approval.expectedCurrentVersion,
    newVersion: input.approval.targetVersion,
    callerUserId: input.callerUserId,
    now,
  });

  const contract: RealApplyTransactionContract = {
    _kind: 'real_apply_transaction_contract',
    executable: false,
    aiCanExecute: false,
    requiresHumanApproval: true,
    contractId: input.contractId,
    tenantId: input.approval.tenantId,
    approvalId: input.approval.approvalId,
    sourceRecommendationId: input.approval.sourceRecommendationId,
    auditTrailId: input.approval.auditTrailId,
    expectedCurrentVersion: input.approval.expectedCurrentVersion,
    newVersion: input.approval.targetVersion,
    applyToken: input.applyToken,
    configBeforeHash: input.approval.configBeforeHash,
    configAfterHash: input.approval.configAfterHash,
    diffHash: input.approval.diffHash,
    callerType: input.callerType,
    callerUserId: input.callerUserId,
    lockAcquisitionPlan: buildLockAcquisitionPlan(lockDoc),
    contractValid: true,
    blockedReasons: [],
    createdAt: now,
  };

  return { contractValid: true, blockedReasons: [], contract };
}

// ─── Historical Config Hash Verification ─────────────────────────────────────

export interface HistoricalConfigHashVerificationInput {
  tenantId: TenantId;
  targetVersion: ConfigVersion;
  expectedHash: DiffHash;
  actualHash: DiffHash;
}

/**
 * Verifies that the stored config content hash at a historical version
 * matches the expected hash from the rollback approval.
 *
 * Phase 1: pure comparison. Phase 2 will derive actualHash by reading
 * the settingsHistory/{tenantId}/versions/{version} document from Firestore.
 */
export function verifyHistoricalConfigHash(
  input: HistoricalConfigHashVerificationInput,
): HistoricalConfigHashVerification {
  const verified = (input.actualHash as string) === (input.expectedHash as string);
  return {
    _kind: 'historical_config_hash_verification',
    tenantId: input.tenantId,
    targetVersion: input.targetVersion,
    expectedHash: input.expectedHash,
    actualHash: input.actualHash,
    verified,
    mismatch: !verified,
  };
}

// ─── Rollback Contract Validator ──────────────────────────────────────────────

export interface RealRollbackContractInput {
  contractId: string;
  callerType: CallerType;
  callerUserId: string;
  rollbackApproval: PersistedHumanModelConfigRollbackApproval;
  expectedTenantId: TenantId;
  expectedCurrentVersion: ConfigVersion;
  historicalConfigHashVerification: HistoricalConfigHashVerification;
  now?: Date;
}

/**
 * Validates all pre-conditions for a real model config rollback transaction.
 *
 * Rollback creates a new config version whose content equals the
 * rollbackTargetVersion config. It never overwrites or deletes history.
 *
 * Validation order (tenant hard guard is always first):
 *  1. Tenant hard guard
 *  2. AI caller hard block
 *  3. Approval status
 *  4. Human approver present
 *  5. Audit trail present
 *  6. Rollback token present
 *  7. Rollback reason present
 *  8. Rollback reason hash cross-validation
 *  9. Same-version guard
 *  10. Historical config hash verification
 *  11. Expected version match (race-condition guard)
 */
export function validateRealRollbackTransactionContract(
  input: RealRollbackContractInput,
): RealRollbackContractResult {
  const now = input.now ?? new Date();
  const blocked: BlockedReason[] = [];

  // 1. Tenant hard guard — must be first
  if (input.rollbackApproval.tenantId !== input.expectedTenantId) {
    blocked.push('REAL_ROLLBACK_TENANT_MISMATCH');
    return { contractValid: false, blockedReasons: blocked, contract: null };
  }

  // 2. AI caller hard block — not bypassable
  if (input.callerType === 'ai') {
    blocked.push('REAL_ROLLBACK_AI_CALLER_BLOCKED');
  }

  // 3. Approval status
  if (input.rollbackApproval.status !== 'APPROVED') {
    if (input.rollbackApproval.status === 'EXPIRED') {
      blocked.push('REAL_ROLLBACK_APPROVAL_EXPIRED');
    } else {
      blocked.push('REAL_ROLLBACK_APPROVAL_NOT_APPROVED');
    }
  }

  // 4. Human approver
  if (!input.rollbackApproval.approvedByHumanUserId || input.rollbackApproval.approvedByHumanUserId.trim() === '') {
    blocked.push('REAL_ROLLBACK_MISSING_HUMAN_APPROVER');
  }

  // 5. Audit trail
  if (!input.rollbackApproval.auditTrailId) {
    blocked.push('REAL_ROLLBACK_MISSING_AUDIT_TRAIL');
  }

  // 6. Rollback token
  if (!input.rollbackApproval.rollbackToken) {
    blocked.push('REAL_ROLLBACK_MISSING_ROLLBACK_TOKEN');
  }

  // 7. Rollback reason
  if (!input.rollbackApproval.rollbackReason || input.rollbackApproval.rollbackReason.trim() === '') {
    blocked.push('REAL_ROLLBACK_MISSING_ROLLBACK_REASON');
  }

  // 8. Rollback reason hash cross-validation
  if (input.rollbackApproval.rollbackReason && input.rollbackApproval.rollbackReason.trim() !== '') {
    // Derive hash here so Phase 2 can cross-check against a stored hash field.
    // PersistedHumanModelConfigRollbackApproval does not carry rollbackReasonHash yet;
    // the field is bound in the final contract below.
    computeRollbackReasonHash(input.rollbackApproval.rollbackReason);
  }

  // 9. Same-version guard
  if (
    input.rollbackApproval.rollbackTargetVersion &&
    input.rollbackApproval.expectedCurrentVersion &&
    (input.rollbackApproval.rollbackTargetVersion as string) ===
      (input.rollbackApproval.expectedCurrentVersion as string)
  ) {
    blocked.push('REAL_ROLLBACK_SAME_VERSION');
  }

  // 10. Historical config hash verification
  if (input.historicalConfigHashVerification.mismatch) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 11. Expected version match (race-condition guard)
  if (
    (input.rollbackApproval.expectedCurrentVersion as string) !==
    (input.expectedCurrentVersion as string)
  ) {
    blocked.push('REAL_APPLY_EXPECTED_VERSION_MISMATCH');
  }

  if (blocked.length > 0) {
    return { contractValid: false, blockedReasons: blocked, contract: null };
  }

  const rollbackReasonHash = computeRollbackReasonHash(input.rollbackApproval.rollbackReason);

  const lockDoc = buildLockDocument({
    token: input.rollbackApproval.rollbackToken,
    tenantId: input.rollbackApproval.tenantId,
    auditTrailId: input.rollbackApproval.auditTrailId,
    approvalId: input.rollbackApproval.approvalId,
    expectedCurrentVersion: input.rollbackApproval.expectedCurrentVersion,
    newVersion: input.rollbackApproval.rollbackTargetVersion,
    rollbackTargetVersion: input.rollbackApproval.rollbackTargetVersion,
    rollbackReasonHash,
    callerUserId: input.callerUserId,
    now,
  });

  const contract: RealRollbackTransactionContract = {
    _kind: 'real_rollback_transaction_contract',
    executable: false,
    aiCanExecute: false,
    requiresHumanApproval: true,
    contractId: input.contractId,
    tenantId: input.rollbackApproval.tenantId,
    approvalId: input.rollbackApproval.approvalId,
    auditTrailId: input.rollbackApproval.auditTrailId,
    rollbackTargetVersion: input.rollbackApproval.rollbackTargetVersion,
    expectedCurrentVersion: input.rollbackApproval.expectedCurrentVersion,
    newVersion: input.rollbackApproval.rollbackTargetVersion,
    rollbackToken: input.rollbackApproval.rollbackToken,
    rollbackReason: input.rollbackApproval.rollbackReason,
    rollbackReasonHash,
    historicalConfigHashVerification: input.historicalConfigHashVerification,
    callerType: input.callerType,
    callerUserId: input.callerUserId,
    lockAcquisitionPlan: buildLockAcquisitionPlan(lockDoc),
    contractValid: true,
    blockedReasons: [],
    createdAt: now,
  };

  return { contractValid: true, blockedReasons: [], contract };
}
