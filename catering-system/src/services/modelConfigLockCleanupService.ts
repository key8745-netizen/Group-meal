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

// ─── Phase 3: Lock Cleanup Dry-run Plan ──────────────────────────────────────

export type CleanupDecision =
  | 'KEEP_ACTIVE'
  | 'KEEP_GRACE_PERIOD'
  | 'KEEP_CONSUMED'
  | 'CLEANUP_ELIGIBLE_STALE_ACTIVE'
  | 'CLEANUP_ELIGIBLE_CONSUMED'
  | 'CLEANUP_ELIGIBLE_EXPIRED'
  | 'CLEANUP_ELIGIBLE_ABANDONED_PLAN'
  | 'BLOCKED_INVALID_OWNER'
  | 'BLOCKED_INVALID_LOCK_METADATA';

export type CleanupOwner = 'HUMAN_SERVICE' | 'SYSTEM_MAINTENANCE';

export interface MaintenanceAuditEventPlan {
  readonly _kind: 'maintenance_audit_event_plan';
  readonly executable: false;
  readonly aiCanExecute: false;
  lockId: string;
  tenantId: string;
  decision: CleanupDecision;
  cleanupOwner: CleanupOwner;
  readonly aiCanOwnCleanup: false;
  plannedAt: Date;
  note: string;
}

export interface LockCleanupDryRunPlan {
  readonly _kind: 'model_config_lock_cleanup_dry_run_plan';
  readonly executable: false;
  readonly aiCanExecute: false;
  readonly dryRunOnly: true;
  readonly aiCanTrigger: false;
  lockId: string;
  lockStatus: LockLifecycleStatus;
  cleanupOwner: CleanupOwner;
  readonly aiCanOwnLock: false;
  now: Date;
  expiresAt: Date;
  cleanupEligibleAt: Date;
  cleanupDecision: CleanupDecision;
  cleanupReason: string;
  maintenanceAuditEventPlan: MaintenanceAuditEventPlan;
}

export interface BuildLockCleanupDryRunPlanInput {
  lock: LockLifecycleDocument;
  now?: Date;
}

/**
 * Builds a dry-run cleanup plan for a lock document using the 9 decision rules.
 *
 * Rules (evaluated in order):
 *  1. lockOwner === AI → BLOCKED_INVALID_OWNER
 *  2. missing expiresAt / cleanupEligibleAt → BLOCKED_INVALID_LOCK_METADATA
 *  3. ACTIVE before expiresAt → KEEP_ACTIVE
 *  4. ACTIVE after expiresAt but before cleanupEligibleAt → KEEP_GRACE_PERIOD
 *  5. ACTIVE after cleanupEligibleAt → CLEANUP_ELIGIBLE_STALE_ACTIVE
 *  6. CONSUMED before cleanupEligibleAt → KEEP_CONSUMED
 *  7. CONSUMED after cleanupEligibleAt → CLEANUP_ELIGIBLE_CONSUMED
 *  8. EXPIRED after cleanupEligibleAt → CLEANUP_ELIGIBLE_EXPIRED
 *  9. PLANNED older than TTL (expiresAt passed) → CLEANUP_ELIGIBLE_ABANDONED_PLAN
 *
 * Phase 3: dry-run only — no Firestore deletion.
 * Phase 4 (future): a real cleanup job executes plans where decision is CLEANUP_ELIGIBLE_*.
 */
export function buildLockCleanupDryRunPlan(input: BuildLockCleanupDryRunPlanInput): LockCleanupDryRunPlan {
  const now = input.now ?? new Date();
  const { lock } = input;

  let decision: CleanupDecision;
  let cleanupReason: string;

  // Rule 1: invalid owner (AI must never own a lock)
  if ((lock.lockOwner as string) === 'ai' || (lock.lockOwner as string) === 'AI') {
    decision = 'BLOCKED_INVALID_OWNER';
    cleanupReason = 'Lock owner is AI. AI cannot own idempotency locks. This lock is invalid.';
  }
  // Rule 2: missing required timing metadata
  else if (!lock.expiresAt || !lock.cleanupEligibleAt) {
    decision = 'BLOCKED_INVALID_LOCK_METADATA';
    cleanupReason = 'Lock is missing expiresAt or cleanupEligibleAt. Cannot determine cleanup eligibility.';
  }
  // Rules 3–5: ACTIVE locks
  else if (lock.status === 'ACTIVE') {
    if (now < lock.expiresAt) {
      decision = 'KEEP_ACTIVE';
      cleanupReason = 'Lock is ACTIVE and within TTL. Transaction may be in flight. Must not touch.';
    } else if (now < lock.cleanupEligibleAt) {
      decision = 'KEEP_GRACE_PERIOD';
      cleanupReason = 'Lock is ACTIVE but past expiresAt. In grace period — Firestore TTL processing. Must not delete yet.';
    } else {
      decision = 'CLEANUP_ELIGIBLE_STALE_ACTIVE';
      cleanupReason = 'Lock is ACTIVE and past cleanupEligibleAt. Stale active lock — safe to delete after dry-run confirmation. Log auditTrailId.';
    }
  }
  // Rules 6–7: CONSUMED locks
  else if (lock.status === 'CONSUMED') {
    if (now < lock.cleanupEligibleAt) {
      decision = 'KEEP_CONSUMED';
      cleanupReason = 'Lock is CONSUMED but cleanupEligibleAt not yet reached. TTL handling in progress.';
    } else {
      decision = 'CLEANUP_ELIGIBLE_CONSUMED';
      cleanupReason = 'Lock is CONSUMED and past cleanupEligibleAt. Safe to delete. Log auditTrailId.';
    }
  }
  // Rule 8: EXPIRED or CLEANUP_ELIGIBLE
  else if (lock.status === 'EXPIRED' || lock.status === 'CLEANUP_ELIGIBLE') {
    if (now >= lock.cleanupEligibleAt) {
      decision = 'CLEANUP_ELIGIBLE_EXPIRED';
      cleanupReason = 'Lock is EXPIRED and past cleanupEligibleAt. Primary: Firestore TTL. Secondary: scheduled job. Log auditTrailId.';
    } else {
      decision = 'KEEP_GRACE_PERIOD';
      cleanupReason = 'Lock is EXPIRED but cleanupEligibleAt not yet reached. Wait for TTL grace period.';
    }
  }
  // Rule 9: PLANNED lock older than TTL (abandoned plan — never written to Firestore)
  else if (lock.status === 'PLANNED' && now >= lock.expiresAt) {
    decision = 'CLEANUP_ELIGIBLE_ABANDONED_PLAN';
    cleanupReason = 'Lock is PLANNED (never written) and past TTL. Abandoned plan — eligible for GC from in-memory tracking only. No Firestore delete needed.';
  } else {
    decision = 'KEEP_ACTIVE';
    cleanupReason = `Lock status '${lock.status}' before TTL — retain.`;
  }

  const cleanupOwner: CleanupOwner = 'SYSTEM_MAINTENANCE';

  const maintenanceAuditEventPlan: MaintenanceAuditEventPlan = {
    _kind: 'maintenance_audit_event_plan',
    executable: false,
    aiCanExecute: false,
    lockId: lock.lockId,
    tenantId: lock.tenantId as string,
    decision,
    cleanupOwner,
    aiCanOwnCleanup: false,
    plannedAt: now,
    note: `Dry-run cleanup plan for lock ${lock.lockId}. Decision: ${decision}. Owner: ${cleanupOwner}. AI cannot own or execute cleanup.`,
  };

  return {
    _kind: 'model_config_lock_cleanup_dry_run_plan',
    executable: false,
    aiCanExecute: false,
    dryRunOnly: true,
    aiCanTrigger: false,
    lockId: lock.lockId,
    lockStatus: lock.status,
    cleanupOwner,
    aiCanOwnLock: false,
    now,
    expiresAt: lock.expiresAt,
    cleanupEligibleAt: lock.cleanupEligibleAt,
    cleanupDecision: decision,
    cleanupReason,
    maintenanceAuditEventPlan,
  };
}

// ─── Phase 4: Lock Cleanup Query Criteria Plan ────────────────────────────────

export type CleanupTrigger = 'TTL_INDEX' | 'SCHEDULED_JOB' | 'MANUAL_ADMIN';
export type CleanupMode = 'DRY_RUN' | 'LIVE';

export interface LockCleanupQueryCriteriaPlan {
  readonly _kind: 'lock_cleanup_query_criteria_plan';
  readonly dryRunOnly: true;
  readonly executable: false;
  readonly aiCanExecute: false;
  /** Describes the Firestore collection being queried — descriptive only, not an object reference. */
  collectionPath: string;
  tenantId: string;
  eligibleStatuses: LockLifecycleStatus[];
  expiresAtBefore: Date;
  cleanupEligibleAtBefore: Date;
  excludeOwner: 'AI';
  criteriaDescription: string;
  /** No Firestore query object, callback, delete fn, write fn, commit fn, or runTransaction. */
  readonly containsFirestoreQueryObject: false;
  readonly containsDeleteFunction: false;
  readonly containsWriteFunction: false;
  readonly containsCommitFunction: false;
  readonly containsRunTransaction: false;
}

export interface BuildLockCleanupQueryCriteriaPlanInput {
  tenantId: string;
  now?: Date;
}

/**
 * Builds a descriptive dry-run query criteria plan for idempotency lock cleanup.
 *
 * Phase 4: pure descriptive criteria — no Firestore query object, no callbacks,
 * no delete/write/commit functions, no runTransaction.
 *
 * Phase 5 (future): a real Firestore query will be constructed from these criteria
 * by a SYSTEM_MAINTENANCE service account, never by an AI agent.
 */
export function buildLockCleanupQueryCriteriaPlan(
  input: BuildLockCleanupQueryCriteriaPlanInput,
): LockCleanupQueryCriteriaPlan {
  const now = input.now ?? new Date();
  const eligibleStatuses: LockLifecycleStatus[] = ['EXPIRED', 'CLEANUP_ELIGIBLE', 'CONSUMED'];

  return {
    _kind: 'lock_cleanup_query_criteria_plan',
    dryRunOnly: true,
    executable: false,
    aiCanExecute: false,
    collectionPath: 'modelConfigIdempotencyLocks',
    tenantId: input.tenantId,
    eligibleStatuses,
    expiresAtBefore: now,
    cleanupEligibleAtBefore: now,
    excludeOwner: 'AI',
    criteriaDescription:
      `Query modelConfigIdempotencyLocks WHERE ` +
      `tenantId == '${input.tenantId}' AND ` +
      `status IN [${eligibleStatuses.join(', ')}] AND ` +
      `expiresAt < ${now.toISOString()} AND ` +
      `cleanupEligibleAt <= ${now.toISOString()} AND ` +
      `lockOwner != 'AI'. ` +
      `Scope: dry-run preview only. No deletion without SYSTEM_MAINTENANCE confirmation. ` +
      `ACTIVE locks are excluded — never delete in-flight transactions.`,
    containsFirestoreQueryObject: false,
    containsDeleteFunction: false,
    containsWriteFunction: false,
    containsCommitFunction: false,
    containsRunTransaction: false,
  };
}

// ─── Phase 4: Maintenance Audit Event Payload ─────────────────────────────────

export interface LockCleanupMaintenanceAuditEventPlan {
  readonly _kind: 'lock_cleanup_maintenance_audit_event_plan';
  readonly dryRunOnly: true;
  readonly aiCanExecute: false;
  eventType: 'MODEL_CONFIG_LOCK_CLEANUP_MAINTENANCE';
  tenantId: string;
  auditTrailId: string;
  maintenanceRunId: string;
  cleanupOwner: CleanupOwner;
  cleanupTrigger: CleanupTrigger;
  cleanupMode: CleanupMode;
  candidateLockCount: number;
  cleanupEligibleCount: number;
  blockedCount: number;
  criteriaHash: string;
  generatedAt: Date;
  blockedReasons: BlockedReason[];
  note: string;
}

export interface BuildMaintenanceAuditEventPlanInput {
  tenantId: string;
  auditTrailId: string;
  maintenanceRunId: string;
  cleanupTrigger: CleanupTrigger;
  candidateLockCount: number;
  cleanupEligibleCount: number;
  blockedCount: number;
  criteriaHash: string;
  blockedReasons?: BlockedReason[];
  now?: Date;
}

/**
 * Builds a maintenance audit event payload for a lock cleanup run.
 *
 * Phase 4: pure payload — not written to Firestore.
 * Phase 5 (future): persisted to a `maintenanceAudit` collection after real cleanup.
 */
export function buildLockCleanupMaintenanceAuditEventPlan(
  input: BuildMaintenanceAuditEventPlanInput,
): LockCleanupMaintenanceAuditEventPlan {
  const now = input.now ?? new Date();
  return {
    _kind: 'lock_cleanup_maintenance_audit_event_plan',
    dryRunOnly: true,
    aiCanExecute: false,
    eventType: 'MODEL_CONFIG_LOCK_CLEANUP_MAINTENANCE',
    tenantId: input.tenantId,
    auditTrailId: input.auditTrailId,
    maintenanceRunId: input.maintenanceRunId,
    cleanupOwner: 'SYSTEM_MAINTENANCE',
    cleanupTrigger: input.cleanupTrigger,
    cleanupMode: 'DRY_RUN',
    candidateLockCount: input.candidateLockCount,
    cleanupEligibleCount: input.cleanupEligibleCount,
    blockedCount: input.blockedCount,
    criteriaHash: input.criteriaHash,
    generatedAt: now,
    blockedReasons: input.blockedReasons ?? [],
    note:
      `Dry-run maintenance audit event. Run: ${input.maintenanceRunId}. ` +
      `Candidates: ${input.candidateLockCount}, Eligible: ${input.cleanupEligibleCount}, ` +
      `Blocked: ${input.blockedCount}. Owner: SYSTEM_MAINTENANCE. AI cannot execute.`,
  };
}
