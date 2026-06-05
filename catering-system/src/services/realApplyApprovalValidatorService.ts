/**
 * realApplyApprovalValidatorService.ts
 *
 * Feature 008 Phase 1: Persisted Approval Snapshot Validator
 *
 * Validates a persisted approval snapshot against a real apply request.
 * Phase 1: pure logic contract — does NOT read from Firestore.
 * Phase 2+ will pass the real Firestore-read approval snapshot here.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason, TenantId, AuditTrailId } from '../types/aiBoundary';
import type { ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId } from '../types/modelConfigApply';
import type {
  PersistedApprovalSnapshot,
  ExecutorValidationResult,
} from '../types/realApplyTransactionExecution';

export interface ApprovalValidationInput {
  approval: PersistedApprovalSnapshot | null | undefined;
  /** Request fields to validate the approval against */
  requestTenantId: TenantId;
  requestApprovalId: ModelConfigApprovalId;
  requestSourceRecommendationId: ModelConfigRecommendationId;
  requestApplyToken: ApplyToken;
  requestAuditTrailId: AuditTrailId;
  requestExpectedCurrentVersion: ConfigVersion;
  requestNewVersion: ConfigVersion;
  requestConfigBeforeHash: DiffHash;
  requestConfigAfterHash: DiffHash;
  requestDiffHash: DiffHash;
  /** Caller user id — must match approval.approvedByUserId when strict=true */
  callerUserId: string;
  /** Whether callerUserId must match approvedByUserId */
  strictCallerMatch?: boolean;
  /** ISO 8601 now — used to check approval expiry */
  now: string;
}

function str(v: unknown): string { return v as string; }

/**
 * Validates a persisted approval snapshot.
 * Default-deny: any missing or mismatched field → blocked.
 */
export function validatePersistedApproval(
  input: ApprovalValidationInput,
): ExecutorValidationResult {
  const blocked: BlockedReason[] = [];

  // Approval must be present
  if (!input.approval) {
    blocked.push('F008_APPROVAL_MISSING');
    return { valid: false, blockedReasons: blocked };
  }

  const a = input.approval;

  // Structural kind check
  if ((a as { _kind?: string })._kind !== 'persisted_approval_snapshot') {
    blocked.push('F008_APPROVAL_MALFORMED');
    return { valid: false, blockedReasons: blocked };
  }

  // Hash fields must be present
  if (!a.configBeforeHash || !a.configAfterHash || !a.diffHash) {
    blocked.push('F008_APPROVAL_HASH_MISSING');
  }

  // Status must be APPROVED
  if (a.status !== 'APPROVED') {
    blocked.push('F008_APPROVAL_NOT_APPROVED');
  }

  // Expiry check
  if (a.expiresAt && input.now > a.expiresAt) {
    blocked.push('F008_APPROVAL_EXPIRED');
  }

  // tenantId must match
  if (str(a.tenantId) !== str(input.requestTenantId)) {
    blocked.push('F008_APPROVAL_TENANT_MISMATCH');
  }

  // sourceRecommendationId must match
  if (str(a.sourceRecommendationId) !== str(input.requestSourceRecommendationId)) {
    blocked.push('F008_APPROVAL_SOURCE_REC_MISMATCH');
  }

  // Optional strict caller match
  if (input.strictCallerMatch && a.approvedByUserId !== input.callerUserId) {
    blocked.push('F008_APPROVAL_CALLER_MISMATCH');
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}
