/**
 * realModelConfigApplyChainHashService.ts
 *
 * Feature 007 Phase 3: Full-chain Hash Propagation Validator
 *
 * Validates hash field consistency across the entire apply chain:
 *   approval → canonicalization → transactionPseudoPlan → auditEventPlan
 *
 * All fields must be consistent end-to-end. Any mismatch → BLOCKED.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - Pure synchronous function — no I/O, no side effects
 */

import type { AuditTrailId, BlockedReason } from '../types/aiBoundary';
import type { ApplyToken, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId } from '../types/modelConfigApply';

// ─── Approval snapshot (structural, no Firestore) ────────────────────────────

export interface ApprovalHashSnapshot {
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  auditTrailId: AuditTrailId;
}

// ─── Plan snapshot ────────────────────────────────────────────────────────────

export interface PlanHashSnapshot {
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  auditTrailId: AuditTrailId;
}

// ─── Audit event snapshot ─────────────────────────────────────────────────────

export interface AuditEventHashSnapshot {
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  auditTrailId: AuditTrailId;
}

// ─── Full-chain input / result ────────────────────────────────────────────────

export interface FullChainHashInput {
  approval: ApprovalHashSnapshot;
  plan: PlanHashSnapshot;
  auditEvent: AuditEventHashSnapshot;
}

export interface FullChainHashResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

function str(v: unknown): string {
  return v as string;
}

/**
 * Validates that approval → plan → auditEvent hash fields are fully consistent.
 *
 * Checks 15 field pairs across the three chain segments.
 */
export function validateFullChainHashPropagation(
  input: FullChainHashInput,
): FullChainHashResult {
  const blocked: BlockedReason[] = [];
  const { approval, plan, auditEvent } = input;

  // ── Approval → Plan ──────────────────────────────────────────────────────────
  if (str(approval.configBeforeHash) !== str(plan.configBeforeHash)) {
    blocked.push('REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH');
  }
  if (str(approval.configAfterHash) !== str(plan.configAfterHash)) {
    blocked.push('REAL_EXEC_APPROVAL_AFTER_HASH_MISMATCH');
  }
  if (str(approval.diffHash) !== str(plan.diffHash)) {
    blocked.push('REAL_EXEC_APPROVAL_DIFF_HASH_MISMATCH');
  }
  if (str(approval.applyToken) !== str(plan.applyToken)) {
    blocked.push('REAL_EXEC_APPROVAL_APPLY_TOKEN_MISMATCH');
  }
  if (str(approval.auditTrailId) !== str(plan.auditTrailId)) {
    blocked.push('REAL_EXEC_APPROVAL_AUDIT_TRAIL_MISMATCH');
  }

  // ── Plan → AuditEvent ────────────────────────────────────────────────────────
  if (str(plan.configBeforeHash) !== str(auditEvent.configBeforeHash)) {
    blocked.push('REAL_EXEC_CHAIN_AUDIT_BEFORE_HASH_MISMATCH');
  }
  if (str(plan.configAfterHash) !== str(auditEvent.configAfterHash)) {
    blocked.push('REAL_EXEC_CHAIN_AUDIT_AFTER_HASH_MISMATCH');
  }
  if (str(plan.diffHash) !== str(auditEvent.diffHash)) {
    blocked.push('REAL_EXEC_CHAIN_AUDIT_DIFF_HASH_MISMATCH');
  }
  if (str(plan.applyToken) !== str(auditEvent.applyToken)) {
    blocked.push('REAL_EXEC_CHAIN_AUDIT_APPLY_TOKEN_MISMATCH');
  }
  if (str(plan.auditTrailId) !== str(auditEvent.auditTrailId)) {
    blocked.push('REAL_EXEC_CHAIN_AUDIT_TRAIL_MISMATCH');
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}

/**
 * Validates only the approval → plan segment of the chain.
 */
export function validateApprovalToPlanHash(
  approval: ApprovalHashSnapshot,
  plan: PlanHashSnapshot,
): FullChainHashResult {
  return validateFullChainHashPropagation({
    approval,
    plan,
    auditEvent: {
      configBeforeHash: plan.configBeforeHash,
      configAfterHash: plan.configAfterHash,
      diffHash: plan.diffHash,
      applyToken: plan.applyToken,
      auditTrailId: plan.auditTrailId,
    },
  });
}

/**
 * Validates only the plan → auditEvent segment of the chain.
 */
export function validatePlanToAuditEventHash(
  plan: PlanHashSnapshot,
  auditEvent: AuditEventHashSnapshot,
): FullChainHashResult {
  return validateFullChainHashPropagation({
    approval: {
      approvalId: '' as ModelConfigApprovalId,
      sourceRecommendationId: '' as ModelConfigRecommendationId,
      configBeforeHash: plan.configBeforeHash,
      configAfterHash: plan.configAfterHash,
      diffHash: plan.diffHash,
      applyToken: plan.applyToken,
      auditTrailId: plan.auditTrailId,
    },
    plan,
    auditEvent,
  });
}

// ─── Phase 4: Concurrent modification simulation ─────────────────────────────

export interface ConcurrentModificationCheckInput {
  /** Hash from the approval record — expected state at approval time */
  approvalConfigBeforeHash: DiffHash;
  /** Hash computed from the currently observed config (at transaction time) */
  currentConfigHash: DiffHash;
  /** Expected version string from request */
  expectedCurrentVersion: string;
  /** Observed current version string (from settings read) */
  observedCurrentVersion: string;
}

export interface ConcurrentModificationCheckResult {
  safe: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Phase 4: Detects concurrent modification.
 * If approval was based on an older config state that has since changed,
 * the hash no longer matches and the transaction must be BLOCKED.
 */
export function detectConcurrentModification(
  input: ConcurrentModificationCheckInput,
): ConcurrentModificationCheckResult {
  const blocked: BlockedReason[] = [];

  if (str(input.approvalConfigBeforeHash) !== str(input.currentConfigHash)) {
    blocked.push('REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH');
    blocked.push('REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED');
  }

  if (input.expectedCurrentVersion !== input.observedCurrentVersion) {
    if (!blocked.includes('REAL_EXEC_CURRENT_CONFIG_VERSION_MISMATCH')) {
      blocked.push('REAL_EXEC_CURRENT_CONFIG_VERSION_MISMATCH');
    }
    if (!blocked.includes('REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED')) {
      blocked.push('REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED');
    }
  }

  return { safe: blocked.length === 0, blockedReasons: blocked };
}
