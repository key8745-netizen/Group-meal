/**
 * modelConfigIdempotencyLockSchemaService.ts
 *
 * Feature 006 Phase 1: Idempotency Lock Schema Builder & Validator
 *
 * Defines, builds, and validates the schema for Firestore idempotency lock
 * documents used in real apply/rollback transactions.
 *
 * Phase 1: pure schema logic — no Firestore read/write.
 * Phase 2 (future): these schemas will be written inside runTransaction.
 *
 * LOCK CLEANUP RESPONSIBILITY (documented invariant):
 *   PRIMARY:   The Firestore transaction that acquires the lock deletes it
 *              atomically on commit. This is the expected path.
 *   SECONDARY: If the transaction never commits (process crash, timeout),
 *              Firestore TTL policy expires the document after LOCK_TTL_SECONDS.
 *              TTL precision is best-effort (~hours in production).
 *   TERTIARY:  Manual admin release via ops runbook if a lock is stuck
 *              beyond TTL due to Firestore TTL delay. Admin SDK only.
 *              Requires auditTrailId logging of the intervention.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI, no async, no side effects
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelConfigApprovalId,
  ConfigVersion,
  ApplyToken,
  RollbackToken,
} from '../types/modelConfigApply';
import type {
  IdempotencyLockDocument,
  LockAcquisitionPlan,
  LockSchemaValidationResult,
  LockCleanupResponsibility,
} from '../types/modelConfigRealApply';
import { IDEMPOTENCY_LOCK_COLLECTION, LOCK_TTL_SECONDS } from '../types/modelConfigRealApply';

// ─── Lock Schema Builder — Apply ──────────────────────────────────────────────

export interface BuildApplyLockSchemaInput {
  token: ApplyToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  createdByHumanUserId: string;
  now?: Date;
}

/**
 * Builds an idempotency lock document schema for a real apply transaction.
 * Document ID format: `{tenantId}:{token}`
 */
export function buildApplyLockSchema(input: BuildApplyLockSchemaInput): IdempotencyLockDocument {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);
  return {
    _kind: 'idempotency_lock_document',
    lockId: `${input.tenantId}:${input.token}`,
    token: input.token,
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    approvalId: input.approvalId,
    expectedCurrentVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    status: 'PLANNED',
    cleanupResponsibility: 'TRANSACTION_COMMIT_RELEASES',
    ttlSeconds: LOCK_TTL_SECONDS,
    createdAt: now,
    expiresAt,
    createdByHumanUserId: input.createdByHumanUserId,
  };
}

// ─── Lock Schema Builder — Rollback ───────────────────────────────────────────

export interface BuildRollbackLockSchemaInput {
  token: RollbackToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  rollbackTargetVersion: ConfigVersion;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  rollbackReasonHash: string;
  createdByHumanUserId: string;
  now?: Date;
}

/**
 * Builds an idempotency lock document schema for a real rollback transaction.
 * Includes rollbackTargetVersion and rollbackReasonHash to distinguish
 * rollback locks from apply locks using the same token format.
 */
export function buildRollbackLockSchema(input: BuildRollbackLockSchemaInput): IdempotencyLockDocument {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);
  return {
    _kind: 'idempotency_lock_document',
    lockId: `${input.tenantId}:${input.token}`,
    token: input.token,
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    approvalId: input.approvalId,
    expectedCurrentVersion: input.expectedCurrentVersion,
    newVersion: input.newVersion,
    rollbackTargetVersion: input.rollbackTargetVersion,
    rollbackReasonHash: input.rollbackReasonHash,
    status: 'PLANNED',
    cleanupResponsibility: 'TRANSACTION_COMMIT_RELEASES',
    ttlSeconds: LOCK_TTL_SECONDS,
    createdAt: now,
    expiresAt,
    createdByHumanUserId: input.createdByHumanUserId,
  };
}

// ─── Lock Schema Validator ────────────────────────────────────────────────────

/**
 * Validates a lock document schema for structural correctness.
 * Does not read from Firestore — validates the in-memory schema object.
 */
export function validateLockSchema(doc: IdempotencyLockDocument): LockSchemaValidationResult {
  const blocked: BlockedReason[] = [];

  if (!doc.token) blocked.push('LOCK_SCHEMA_MISSING_TOKEN');
  if (!doc.tenantId) blocked.push('LOCK_SCHEMA_MISSING_TENANT');
  if (!doc.approvalId) blocked.push('LOCK_SCHEMA_MISSING_APPROVAL');
  if (!doc.auditTrailId) blocked.push('LOCK_SCHEMA_MISSING_AUDIT_TRAIL');

  if (doc.ttlSeconds <= 0 || !Number.isFinite(doc.ttlSeconds)) {
    blocked.push('LOCK_SCHEMA_TTL_INVALID');
  }

  if (!doc.cleanupResponsibility) {
    blocked.push('LOCK_SCHEMA_CLEANUP_UNDEFINED');
  }

  if (doc.expiresAt <= doc.createdAt) {
    blocked.push('LOCK_SCHEMA_EXPIRES_BEFORE_CREATED');
  }

  if (!doc.lockId || doc.lockId.trim() === '' || !doc.lockId.includes(':')) {
    blocked.push('LOCK_SCHEMA_DOCUMENT_PATH_INVALID');
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}

// ─── Lock Acquisition Plan Builder ───────────────────────────────────────────

/**
 * Wraps a lock document in a plan-only acquisition plan.
 * Phase 1: plan-only. Phase 2: this plan drives the Firestore transaction.
 */
export function buildLockAcquisitionPlan(doc: IdempotencyLockDocument): LockAcquisitionPlan {
  return {
    _kind: 'lock_acquisition_plan',
    planOnly: true,
    executable: false,
    lockId: doc.lockId,
    collection: IDEMPOTENCY_LOCK_COLLECTION,
    documentPath: `${IDEMPOTENCY_LOCK_COLLECTION}/${doc.lockId}`,
    lockDocument: doc,
    cleanupResponsibility: doc.cleanupResponsibility,
    cleanupNote:
      'PRIMARY: transaction commit deletes the lock atomically. ' +
      'SECONDARY: Firestore TTL expires after ' +
      LOCK_TTL_SECONDS +
      's if commit never occurs. ' +
      'TERTIARY: manual admin release via ops runbook with auditTrailId logging.',
  };
}

// ─── Cleanup Responsibility Reference ────────────────────────────────────────

/**
 * Returns the documented cleanup responsibility chain for idempotency locks.
 * This is the authoritative reference for Phase 2 implementation.
 */
export function getLockCleanupResponsibilityChain(): readonly {
  priority: number;
  responsibility: LockCleanupResponsibility;
  description: string;
  condition: string;
}[] {
  return [
    {
      priority: 1,
      responsibility: 'TRANSACTION_COMMIT_RELEASES',
      description: 'Firestore transaction atomically deletes the lock document on commit.',
      condition: 'Transaction commits successfully.',
    },
    {
      priority: 2,
      responsibility: 'TTL_EXPIRES',
      description: `Firestore TTL policy expires the document after ${LOCK_TTL_SECONDS}s.`,
      condition: 'Transaction never commits (crash, timeout, network failure). TTL precision is best-effort (~hours in Firestore production).',
    },
    {
      priority: 3,
      responsibility: 'MANUAL_ADMIN_RELEASE',
      description: 'Ops team deletes the lock document via Admin SDK following the ops runbook.',
      condition: `Lock is stuck beyond TTL due to Firestore TTL delay. Requires auditTrailId logging of the intervention.`,
    },
  ] as const;
}

// ─── Lock Document Path Utility ───────────────────────────────────────────────

/** Returns the Firestore document path for a given lock document. */
export function getLockDocumentPath(tenantId: TenantId, token: ApplyToken | RollbackToken): string {
  return `${IDEMPOTENCY_LOCK_COLLECTION}/${tenantId}:${token}`;
}
