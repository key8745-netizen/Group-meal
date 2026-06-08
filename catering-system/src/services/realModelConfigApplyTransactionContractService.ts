/**
 * realModelConfigApplyTransactionContractService.ts
 *
 * Feature 009 Phase 1: Transaction Read/Write Set Contract Builder
 *
 * Builds non-executable structural contracts for the four Firestore operations
 * inside a real apply transaction:
 *   READ: approval, settings, idempotency lock
 *   WRITE: lock, settingsHistory (immutable), settings update, audit event
 *
 * Phase 1: pure contract generation — nothing is read or written.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - All contracts: executable: false, aiCanExecute: false
 */

import type { BlockedReason, TenantId, AuditTrailId } from '../types/aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId } from '../types/modelConfigApply';
import type {
  ModelConfigApplyReadSetContract,
  ModelConfigApplyWriteSetContract,
  ModelConfigApplyTransactionContract,
} from '../types/realModelConfigApplyTransaction';
import { buildLockPath } from './realModelConfigApplyIdempotencyService';

function str(v: unknown): string { return v as string; }

export interface TransactionContractInput {
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
  callerUserId: string;
  now?: Date;
}

export interface TransactionContractResult {
  contract: ModelConfigApplyTransactionContract | null;
  blocked: boolean;
  blockedReasons: BlockedReason[];
}

export function buildTransactionReadSet(input: TransactionContractInput): ModelConfigApplyReadSetContract {
  return {
    _kind: 'model_config_apply_read_set_contract',
    executable: false,
    approvalPath: `modelConfigApprovals/${str(input.tenantId)}/${str(input.approvalId)}`,
    settingsPath: `settings/${str(input.tenantId)}`,
    lockPath: buildLockPath(input.tenantId, input.applyToken),
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    applyToken: input.applyToken,
  };
}

export function buildTransactionWriteSet(input: TransactionContractInput): ModelConfigApplyWriteSetContract {
  const lockId = `${str(input.tenantId)}:${str(input.applyToken)}`;
  const now = input.now ?? new Date();
  return {
    _kind: 'model_config_apply_write_set_contract',
    executable: false,
    aiCanExecute: false,
    lockWrite: {
      path: `modelConfigIdempotencyLocks/${lockId}`,
      lockId,
      ttlSeconds: 300,
      cleanupEligibleAfterSeconds: 360,
      executable: false,
      aiCanExecute: false,
    },
    historyWrite: {
      path: `settingsHistory/${str(input.tenantId)}/versions/${str(input.newVersion)}`,
      immutable: true,
      executable: false,
      aiCanExecute: false,
      version: input.newVersion,
      previousVersion: input.expectedCurrentVersion,
      configBeforeHash: input.configBeforeHash,
      configAfterHash: input.configAfterHash,
      diffHash: input.diffHash,
      approvalId: input.approvalId,
      auditTrailId: input.auditTrailId,
      createdByHumanUserId: input.callerUserId,
    },
    settingsUpdate: {
      path: `settings/${str(input.tenantId)}`,
      executable: false,
      aiCanExecute: false,
      newVersion: input.newVersion,
      expectedCurrentVersion: input.expectedCurrentVersion,
      configAfterHash: input.configAfterHash,
    },
    auditEventWrite: {
      path: `auditEvents/${str(input.auditTrailId)}`,
      executable: false,
      aiCanExecute: false,
    },
    generatedAt: now,
  };
}

export function buildTransactionContract(input: TransactionContractInput): TransactionContractResult {
  const blocked: BlockedReason[] = [];

  if (!input.tenantId || !str(input.tenantId).trim()) blocked.push('REAL_EXEC_TENANT_MISMATCH');
  if (!input.approvalId || !str(input.approvalId).trim()) blocked.push('REAL_EXEC_MISSING_APPROVAL_ID');
  if (!input.auditTrailId || !str(input.auditTrailId).trim()) blocked.push('REAL_EXEC_MISSING_AUDIT_TRAIL_ID');
  if (!input.applyToken || !str(input.applyToken).trim()) blocked.push('REAL_EXEC_MISSING_APPLY_TOKEN');
  if (!input.expectedCurrentVersion || !str(input.expectedCurrentVersion).trim()) blocked.push('REAL_EXEC_MISSING_EXPECTED_VERSION');
  if (!input.newVersion || !str(input.newVersion).trim()) blocked.push('REAL_EXEC_MISSING_NEW_VERSION');
  if (!input.callerUserId || !input.callerUserId.trim()) blocked.push('REAL_EXEC_MISSING_HUMAN_USER_ID');
  if (!input.configBeforeHash || !str(input.configBeforeHash).trim()) blocked.push('REAL_EXEC_CONFIG_BEFORE_HASH_MISSING');
  if (!input.configAfterHash || !str(input.configAfterHash).trim()) blocked.push('REAL_EXEC_CONFIG_AFTER_HASH_MISSING');
  if (!input.diffHash || !str(input.diffHash).trim()) blocked.push('REAL_EXEC_DIFF_HASH_MISSING');

  if (blocked.length > 0) return { contract: null, blocked: true, blockedReasons: blocked };

  const now = input.now ?? new Date();
  const contract: ModelConfigApplyTransactionContract = {
    _kind: 'model_config_apply_transaction_contract',
    executable: false,
    aiCanExecute: false,
    readSet: buildTransactionReadSet(input),
    writeSet: buildTransactionWriteSet({ ...input, now }),
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    generatedAt: now,
  };

  return { contract, blocked: false, blockedReasons: [] };
}
