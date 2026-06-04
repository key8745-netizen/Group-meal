/**
 * modelConfigLockCleanupService.ts
 *
 * Feature 006 Phase 2: Idempotency Lock Lifecycle & Cleanup Strategy
 *
 * Defines the lifecycle states, cleanup eligibility rules, and
 * pseudo-implementation for idempotency lock cleanup.
 *
 * LOCK CLEANUP RESPONSIBILITY (authoritative definition):
 *
 *   PRIMARY — TRANSACTION_COMMIT_RELEASES:
 *     The Firestore transaction that acquires the lock deletes the document
 *     atomically on commit. This is the expected path for all successful
 *     apply / rollback operations.
 *     Owner: the real apply/rollback transaction service (Phase 3+).
 *
 *   SECONDARY — TTL_EXPIRES:
 *     Firestore TTL index on `expiresAt` automatically deletes expired lock
 *     documents. TTL precision is best-effort (~hours in production).
 *     No code required — configured via Firestore console TTL policy.
 *     Trigger: Firestore TTL background process.
 *     Owner: Firestore managed infrastructure.
 *
 *   TERTIARY — SCHEDULED_MAINTENANCE_JOB:
 *     A scheduled maintenance job (not AI, not client) queries for
 *     cleanup-eligible locks past their expiresAt and deletes them.
 *     Trigger: cron schedule (e.g., every 15 minutes).
 *     Owner: system maintenance role (human-operated service account,
 *     not an AI agent).
 *     Must log audit entry for every deletion.
 *     Must use dry-run mode before live deletion in staging.
 *
 *   FALLBACK — MANUAL_ADMIN_RELEASE:
 *     Ops team uses Admin SDK script following the ops runbook.
 *     Requires auditTrailId logging of the intervention.
 *     Must never delete locks with status ACTIVE.
 *     Script must support dry-run preview before deletion.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI, no async, no side effects
 *  - AI caller must NEVER own a lock or trigger cleanup
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type { ModelConfigApprovalId, ApplyToken, RollbackToken } from '../types/modelConfigApply';
import { LOCK_TTL_SECONDS } from '../types/modelConfigRealApply';

// ─── Lock Lifecycle Status ────────────────────────────────────────────────────

export type LockLifecycleStatus =
  | 'PLANNED'          // Phase 1: plan-only, never written to Firestore
  | 'ACTIVE'           // Phase 3+: written to Firestore, transaction in flight
  | 'CONSUMED'         // Transaction committed successfully, lock released
  | 'EXPIRED'          // TTL passed, Firestore TTL has or will delete it
  | 'CLEANUP_ELIGIBLE'; // Past expiresAt but TTL not yet processed; safe to delete

// ─── Lock Owner ───────────────────────────────────────────────────────────────

export type LockOwner = 'HUMAN_SERVICE';

// ─── Lock Lifecycle Document ──────────────────────────────────────────────────

export interface LockLifecycleDocument {
  readonly _kind: 'lock_lifecycle_document';
  lockId: string;
  token: ApplyToken | RollbackToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  status: LockLifecycleStatus;
  readonly lockOwner: LockOwner;
  readonly aiCanOwnLock: false;
  createdAt: Date;
  expiresAt: Date;
  cleanupEligibleAt: Date;
  consumedAt?: Date;
  releasedAt?: Date;
  /** duplicate detection */
  duplicatePolicy: 'BLOCKED_DUPLICATE';
  /** replay detection */
  replayPolicy: 'IDEMPOTENT_REPLAY_BLOCKED';
  /** version conflict detection */
  versionConflictPolicy: 'VERSION_CONFLICT_BLOCKED';
  /** approval reuse detection */
  approvalReusePolicy: 'APPROVAL_REUSE_BLOCKED';
}

// ─── Cleanup Plan ─────────────────────────────────────────────────────────────

export interface LockCleanupPlan {
  readonly _kind: 'lock_cleanup_plan';
  readonly dryRunOnly: true;
  readonly aiCanTrigger: false;
  lockId: string;
  tenantId: TenantId;
  status: LockLifecycleStatus;
  cleanupEligible: boolean;
  cleanupBlockedReason: BlockedReason | null;
  cleanupStrategy: 'TTL_INDEX' | 'SCHEDULED_JOB' | 'MANUAL_ADMIN';
  cleanupNote: string;
}

// ─── Lifecycle Builder ────────────────────────────────────────────────────────

export interface BuildLockLifecycleInput {
  lockId: string;
  token: ApplyToken | RollbackToken;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  approvalId: ModelConfigApprovalId;
  now?: Date;
}

/**
 * Builds a lock lifecycle document in PLANNED state.
 * cleanupEligibleAt = expiresAt + grace period (60 seconds)
 * to allow Firestore TTL a window before the cleanup job runs.
 */
export function buildLockLifecycleDocument(input: BuildLockLifecycleInput): LockLifecycleDocument {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);
  const CLEANUP_GRACE_SECONDS = 60;
  const cleanupEligibleAt = new Date(expiresAt.getTime() + CLEANUP_GRACE_SECONDS * 1000);

  return {
    _kind: 'lock_lifecycle_document',
    lockId: input.lockId,
    token: input.token,
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    approvalId: input.approvalId,
    status: 'PLANNED',
    lockOwner: 'HUMAN_SERVICE',
    aiCanOwnLock: false,
    createdAt: now,
    expiresAt,
    cleanupEligibleAt,
    duplicatePolicy: 'BLOCKED_DUPLICATE',
    replayPolicy: 'IDEMPOTENT_REPLAY_BLOCKED',
    versionConflictPolicy: 'VERSION_CONFLICT_BLOCKED',
    approvalReusePolicy: 'APPROVAL_REUSE_BLOCKED',
  };
}

// ─── Cleanup Eligibility Check ────────────────────────────────────────────────

export interface CleanupEligibilityInput {
  lock: LockLifecycleDocument;
  now?: Date;
}

export interface CleanupEligibilityResult {
  eligible: boolean;
  reason: string;
  blockedReason: BlockedReason | null;
}

/**
 * Determines whether a lock document is safe to delete by a cleanup job.
 *
 * Safe to delete when:
 *  - status is EXPIRED or CLEANUP_ELIGIBLE
 *  - status is CONSUMED and consumedAt is present
 *  - now >= cleanupEligibleAt
 *
 * Must NOT delete when:
 *  - status is ACTIVE (transaction in flight)
 *  - status is PLANNED (not yet written to Firestore — should not be in cleanup scope)
 *  - now < cleanupEligibleAt (TTL grace period not elapsed)
 */
export function checkLockCleanupEligibility(input: CleanupEligibilityInput): CleanupEligibilityResult {
  const now = input.now ?? new Date();
  const { lock } = input;

  if (lock.status === 'ACTIVE') {
    return {
      eligible: false,
      reason: 'Lock is ACTIVE — transaction may be in flight. Must not delete.',
      blockedReason: 'LOCK_SCHEMA_CLEANUP_UNDEFINED',
    };
  }

  if (lock.status === 'PLANNED') {
    return {
      eligible: false,
      reason: 'Lock is PLANNED — never written to Firestore. Not a cleanup target.',
      blockedReason: 'LOCK_SCHEMA_CLEANUP_UNDEFINED',
    };
  }

  if (now < lock.cleanupEligibleAt) {
    return {
      eligible: false,
      reason: `Lock cleanupEligibleAt not yet reached. Wait until ${lock.cleanupEligibleAt.toISOString()}.`,
      blockedReason: 'LOCK_SCHEMA_CLEANUP_UNDEFINED',
    };
  }

  if (lock.status === 'CONSUMED') {
    if (!lock.consumedAt) {
      return {
        eligible: false,
        reason: 'Lock is CONSUMED but consumedAt is missing. Cannot safely determine cleanup eligibility.',
        blockedReason: 'LOCK_SCHEMA_CLEANUP_UNDEFINED',
      };
    }
    return { eligible: true, reason: 'Lock CONSUMED and cleanupEligibleAt passed.', blockedReason: null };
  }

  if (lock.status === 'EXPIRED' || lock.status === 'CLEANUP_ELIGIBLE') {
    return { eligible: true, reason: `Lock status is ${lock.status} and cleanupEligibleAt passed.`, blockedReason: null };
  }

  return {
    eligible: false,
    reason: `Unknown status: ${lock.status}`,
    blockedReason: 'LOCK_SCHEMA_CLEANUP_UNDEFINED',
  };
}

// ─── Cleanup Plan Builder ─────────────────────────────────────────────────────

/**
 * Builds a cleanup plan for a lock document.
 * Phase 2: dry-run only — no actual Firestore deletion.
 * Phase 3+: a real cleanup job will execute plans where eligible=true.
 */
export function buildLockCleanupPlan(lock: LockLifecycleDocument, now?: Date): LockCleanupPlan {
  const result = checkLockCleanupEligibility({ lock, now });

  let strategy: LockCleanupPlan['cleanupStrategy'] = 'TTL_INDEX';
  let note = '';

  if (!result.eligible) {
    note = `Not eligible: ${result.reason}`;
  } else if (lock.status === 'CONSUMED') {
    strategy = 'SCHEDULED_JOB';
    note =
      'Consumed lock — eligible for deletion by scheduled maintenance job. ' +
      'Must log auditTrailId for deletion. No AI may trigger this job.';
  } else {
    strategy = 'TTL_INDEX';
    note =
      `Expired/cleanup-eligible lock — primary cleanup via Firestore TTL index on expiresAt. ` +
      `If TTL has not yet processed, scheduled job or manual admin script may delete. ` +
      `Script must run dry-run preview first. Must log auditTrailId.`;
  }

  return {
    _kind: 'lock_cleanup_plan',
    dryRunOnly: true,
    aiCanTrigger: false,
    lockId: lock.lockId,
    tenantId: lock.tenantId,
    status: lock.status,
    cleanupEligible: result.eligible,
    cleanupBlockedReason: result.blockedReason,
    cleanupStrategy: strategy,
    cleanupNote: note,
  };
}

// ─── Cleanup Schedule Reference ───────────────────────────────────────────────

/**
 * Returns the documented cleanup schedule and ownership chain.
 * This is the authoritative reference for Phase 3 implementation.
 */
export function getLockCleanupSchedule(): readonly {
  priority: number;
  trigger: string;
  owner: string;
  condition: string;
  auditRequired: boolean;
  aiAllowed: false;
}[] {
  return [
    {
      priority: 1,
      trigger: 'Firestore TTL index on expiresAt field',
      owner: 'Firestore managed infrastructure',
      condition: 'Lock document expiresAt has passed. No code required beyond TTL index configuration.',
      auditRequired: false,
      aiAllowed: false,
    },
    {
      priority: 2,
      trigger: 'Scheduled maintenance job (cron, every 15 minutes)',
      owner: 'System maintenance role (human-operated service account)',
      condition: 'Lock is EXPIRED or CLEANUP_ELIGIBLE and cleanupEligibleAt has passed. Dry-run preview before live deletion.',
      auditRequired: true,
      aiAllowed: false,
    },
    {
      priority: 3,
      trigger: 'Manual admin script via ops runbook',
      owner: 'Ops team (human)',
      condition: 'Lock stuck beyond TTL due to Firestore TTL delay. Must use dry-run preview. Must log auditTrailId.',
      auditRequired: true,
      aiAllowed: false,
    },
  ] as const;
}

// ─── Service Guard Entrance Contract ─────────────────────────────────────────

export interface ServiceGuardEntranceInput {
  callerType: 'human' | 'ai' | string;
  callerUserId: string | null | undefined;
  tenantId: string | null | undefined;
  hasApproval: boolean;
  isServiceAccount?: boolean;
  isAdminSdk?: boolean;
}

export interface ServiceGuardEntranceResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Service guard entrance contract.
 *
 * This guard must run before any transaction body.
 * Admin SDK and Service Account do NOT bypass this guard.
 * AI callers are blocked regardless of credential type.
 *
 * Invariants:
 *  1. Tenant must be present
 *  2. AI caller is always blocked
 *  3. Service account alone is insufficient — human userId still required
 *  4. Admin SDK does not bypass business guard
 *  5. Human userId must be present
 *  6. Approval must be present
 */
export function validateServiceGuardEntrance(input: ServiceGuardEntranceInput): ServiceGuardEntranceResult {
  const blocked: BlockedReason[] = [];

  // 1. Tenant hard guard — first
  if (!input.tenantId || (input.tenantId as string).trim() === '') {
    blocked.push('REAL_APPLY_TENANT_MISMATCH');
    return { allowed: false, blockedReasons: blocked };
  }

  // 2. AI caller always blocked — not bypassable via Admin SDK / Service Account
  if (input.callerType === 'ai') {
    blocked.push('REAL_APPLY_AI_CALLER_BLOCKED');
  }

  // 3. Service account alone is insufficient
  // (isAdminSdk / isServiceAccount does not grant permission without human userId)
  if ((input.isServiceAccount || input.isAdminSdk) && !input.callerUserId) {
    blocked.push('REAL_APPLY_MISSING_HUMAN_APPROVER');
  }

  // 4. Human userId must be present
  if (!input.callerUserId || (input.callerUserId as string).trim() === '') {
    blocked.push('REAL_APPLY_MISSING_HUMAN_APPROVER');
  }

  // 5. Approval must be present
  if (!input.hasApproval) {
    blocked.push('REAL_APPLY_APPROVAL_NOT_APPROVED');
  }

  return { allowed: blocked.length === 0, blockedReasons: blocked };
}
