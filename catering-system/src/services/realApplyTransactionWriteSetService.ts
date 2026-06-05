/**
 * realApplyTransactionWriteSetService.ts
 *
 * Feature 008 Phase 1: Transaction Write-Set Contract Builder
 *
 * Builds a non-executable structural description of the four Firestore writes
 * in a real model config apply transaction:
 *   1. settings/{tenantId} — currentVersion + config update
 *   2. settingsHistory/{tenantId}/versions/{newVersion} — immutable append
 *   3. modelConfigIdempotencyLocks/{lockId} — lock acquire
 *   4. auditEvents/{auditTrailId} — event append
 *
 * Phase 1: pure contract generation — nothing is written.
 * Phase 2+ will execute this write-set inside a real runTransaction.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - All contracts have executable: false, aiCanExecute: false
 *  - AI caller always blocked
 */

import type { BlockedReason, TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ApplyToken,
  ConfigVersion,
  DiffHash,
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
} from '../types/modelConfigApply';
import type { RealApplyCallerType } from '../types/realModelConfigApplyExecution';
import type {
  TransactionWriteSetContract,
  SettingsWriteContract,
  SettingsHistoryWriteContract,
  IdempotencyLockWriteContract,
  AuditEventWriteContract,
  TokenVerificationSource,
} from '../types/realApplyTransactionExecution';
import { validateCanonicalModelConfigHashInput } from './realModelConfigCanonicalizationService';

export const LOCK_TTL_SECONDS = 300 as const;
export const LOCK_CLEANUP_GRACE_SECONDS = 60 as const;

export interface BuildWriteSetInput {
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
  callerType: RealApplyCallerType;
  tokenVerificationSource: TokenVerificationSource;
  /**
   * Phase 1: optional — when supplied, canonical hash must equal configBeforeHash.
   * Phase 2+ will always supply this from the Firestore settings read.
   */
  currentConfigObject?: unknown;
  now?: Date;
}

export interface BuildWriteSetResult {
  writeSet: TransactionWriteSetContract | null;
  blocked: boolean;
  blockedReasons: BlockedReason[];
}

function str(v: unknown): string { return v as string; }

function buildLockId(tenantId: TenantId, applyToken: ApplyToken): string {
  return `${str(tenantId)}:${str(applyToken)}`;
}

/**
 * Builds the structural write-set contract for a real apply transaction.
 * Returns blocked if any prerequisite validation fails.
 * All contracts are non-executable in Phase 1.
 */
export function buildTransactionWriteSet(
  input: BuildWriteSetInput,
): BuildWriteSetResult {
  const blocked: BlockedReason[] = [];
  const now = input.now ?? new Date();

  // Required field checks
  if (!input.tenantId || !str(input.tenantId).trim()) blocked.push('REAL_EXEC_TENANT_MISMATCH');
  if (!input.approvalId || !str(input.approvalId).trim()) blocked.push('REAL_EXEC_MISSING_APPROVAL_ID');
  if (!input.auditTrailId || !str(input.auditTrailId).trim()) blocked.push('REAL_EXEC_MISSING_AUDIT_TRAIL_ID');
  if (!input.applyToken || !str(input.applyToken).trim()) blocked.push('REAL_EXEC_MISSING_APPLY_TOKEN');
  if (!input.expectedCurrentVersion || !str(input.expectedCurrentVersion).trim()) blocked.push('REAL_EXEC_MISSING_EXPECTED_VERSION');
  if (!input.newVersion || !str(input.newVersion).trim()) blocked.push('REAL_EXEC_MISSING_NEW_VERSION');
  if (!input.callerUserId || !input.callerUserId.trim()) blocked.push('REAL_EXEC_MISSING_HUMAN_USER_ID');

  // AI caller hard-blocked
  if (input.callerType === 'AI') blocked.push('REAL_EXEC_AI_CALLER_BLOCKED');

  // Hash fields must be present
  if (!input.configBeforeHash || !str(input.configBeforeHash).trim()) blocked.push('REAL_EXEC_CONFIG_BEFORE_HASH_MISSING');
  if (!input.configAfterHash || !str(input.configAfterHash).trim()) blocked.push('REAL_EXEC_CONFIG_AFTER_HASH_MISSING');
  if (!input.diffHash || !str(input.diffHash).trim()) blocked.push('REAL_EXEC_DIFF_HASH_MISSING');

  // Verify write-set paths would be valid
  if (!input.tenantId) {
    blocked.push('F008_WRITE_SET_MISSING_SETTINGS_PATH');
    blocked.push('F008_WRITE_SET_MISSING_HISTORY_PATH');
    blocked.push('F008_WRITE_SET_MISSING_LOCK_PATH');
  }

  // Optional canonical hash check
  if (input.currentConfigObject !== undefined && blocked.length === 0) {
    const canon = validateCanonicalModelConfigHashInput(input.currentConfigObject);
    if (!canon.valid || !canon.canonicalized) {
      blocked.push(...canon.blockedReasons);
    } else if (str(canon.canonicalized.inputHash) !== str(input.configBeforeHash)) {
      blocked.push('REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH');
      blocked.push('F008_WRITE_SET_HASH_CONTINUITY_BROKEN');
    }
  }

  if (blocked.length > 0) {
    return { writeSet: null, blocked: true, blockedReasons: blocked };
  }

  const settingsWrite: SettingsWriteContract = {
    _kind: 'settings_write_contract',
    executable: false,
    aiCanExecute: false,
    collectionPath: 'settings',
    documentPath: `settings/${str(input.tenantId)}`,
    newVersion: input.newVersion,
    expectedCurrentVersion: input.expectedCurrentVersion,
    configAfterHash: input.configAfterHash,
    tenantId: input.tenantId,
  };

  const settingsHistoryWrite: SettingsHistoryWriteContract = {
    _kind: 'settings_history_write_contract',
    executable: false,
    aiCanExecute: false,
    immutable: true,
    collectionPath: `settingsHistory/${str(input.tenantId)}/versions`,
    documentPath: `settingsHistory/${str(input.tenantId)}/versions/${str(input.newVersion)}`,
    tenantId: input.tenantId,
    version: input.newVersion,
    previousVersion: input.expectedCurrentVersion,
    configBeforeHash: input.configBeforeHash,
    configAfterHash: input.configAfterHash,
    diffHash: input.diffHash,
    sourceRecommendationId: input.sourceRecommendationId,
    approvalId: input.approvalId,
    auditTrailId: input.auditTrailId,
    createdByHumanUserId: input.callerUserId,
  };

  const idempotencyLockWrite: IdempotencyLockWriteContract = {
    _kind: 'idempotency_lock_write_contract',
    executable: false,
    aiCanExecute: false,
    aiCanOwnLock: false,
    collectionPath: 'modelConfigIdempotencyLocks',
    lockId: buildLockId(input.tenantId, input.applyToken),
    tenantId: input.tenantId,
    approvalId: input.approvalId,
    applyToken: input.applyToken,
    payloadHash: input.configAfterHash,
    expectedCurrentVersion: input.expectedCurrentVersion,
    ttlSeconds: LOCK_TTL_SECONDS,
    cleanupEligibleAfterSeconds: LOCK_TTL_SECONDS + LOCK_CLEANUP_GRACE_SECONDS,
  };

  const auditEventWrite: AuditEventWriteContract = {
    _kind: 'audit_event_write_contract',
    executable: false,
    aiCanExecute: false,
    collectionPath: 'auditEvents',
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    approvalId: input.approvalId,
    sourceRecommendationId: input.sourceRecommendationId,
    callerUserId: input.callerUserId,
    callerType: input.callerType,
    configBeforeHash: input.configBeforeHash,
    configAfterHash: input.configAfterHash,
    diffHash: input.diffHash,
    applyToken: input.applyToken,
    newVersion: input.newVersion,
    tokenVerificationSource: input.tokenVerificationSource,
  };

  const writeSet: TransactionWriteSetContract = {
    _kind: 'transaction_write_set_contract',
    executable: false,
    aiCanExecute: false,
    settingsWrite,
    settingsHistoryWrite,
    idempotencyLockWrite,
    auditEventWrite,
    generatedAt: now,
  };

  return { writeSet, blocked: false, blockedReasons: [] };
}
