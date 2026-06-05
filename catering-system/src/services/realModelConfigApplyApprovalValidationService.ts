/**
 * realModelConfigApplyApprovalValidationService.ts
 *
 * Feature 009 Phase 1: Persisted Model Config Approval Validator
 *
 * Validates a persisted approval record against the real apply request.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason, TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId,
} from '../types/modelConfigApply';
import type {
  PersistedModelConfigApproval, VerifiedHumanCallerContext, F009ValidationResult,
} from '../types/realModelConfigApplyTransaction';

export interface ApprovalValidationInput {
  approval: PersistedModelConfigApproval | null | undefined;
  requestTenantId: TenantId;
  requestApprovalId: ModelConfigApprovalId;
  requestSourceRecommendationId: ModelConfigRecommendationId;
  requestAuditTrailId: AuditTrailId;
  requestApplyToken: ApplyToken;
  requestExpectedCurrentVersion: ConfigVersion;
  requestNewVersion: ConfigVersion;
  requestConfigBeforeHash: DiffHash;
  requestConfigAfterHash: DiffHash;
  requestDiffHash: DiffHash;
  callerContext: VerifiedHumanCallerContext;
  strictCallerMatch?: boolean;
  now: string;
}

function str(v: unknown): string { return v as string; }

export function validateRealApplyApproval(input: ApprovalValidationInput): F009ValidationResult {
  const blocked: BlockedReason[] = [];

  if (!input.approval) {
    return { valid: false, blockedReasons: ['F009_APPROVAL_MISSING'] };
  }

  const a = input.approval;

  if ((a as { _kind?: string })._kind !== 'persisted_model_config_approval') {
    return { valid: false, blockedReasons: ['F009_APPROVAL_MISSING'] };
  }

  // tenant must match (first)
  if (str(a.tenantId) !== str(input.requestTenantId)) {
    blocked.push('F009_APPROVAL_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked };
  }

  // status must be APPROVED
  if (a.status !== 'APPROVED') {
    blocked.push('F009_APPROVAL_NOT_APPROVED');
    if (a.status === 'CONSUMED') blocked.push('F009_APPROVAL_ALREADY_CONSUMED');
  }

  // not expired
  if (a.expiresAt && input.now > a.expiresAt) blocked.push('F009_APPROVAL_EXPIRED');

  // hash fields must be present
  if (!a.configBeforeHash || !str(a.configBeforeHash).trim() ||
      !a.configAfterHash || !str(a.configAfterHash).trim() ||
      !a.diffHash || !str(a.diffHash).trim()) {
    blocked.push('F009_APPROVAL_MISSING_HASH_FIELDS');
  }

  // applyToken must be present
  if (!a.applyToken || !str(a.applyToken).trim()) blocked.push('F009_APPROVAL_MISSING_APPLY_TOKEN');

  // expectedCurrentVersion must be present
  if (!a.expectedCurrentVersion || !str(a.expectedCurrentVersion).trim()) {
    blocked.push('F009_APPROVAL_MISSING_VERSION');
  }

  // sourceRecommendationId must match
  if (str(a.sourceRecommendationId) !== str(input.requestSourceRecommendationId)) {
    blocked.push('F009_APPROVAL_SOURCE_REC_MISMATCH');
  }

  // auditTrailId must match
  if (str(a.auditTrailId) !== str(input.requestAuditTrailId)) {
    blocked.push('F009_APPROVAL_AUDIT_TRAIL_MISMATCH');
  }

  // applyToken must match
  if (str(a.applyToken) !== str(input.requestApplyToken)) {
    blocked.push('F008_APPROVAL_APPLY_TOKEN_MISMATCH');
  }

  // version fields must match
  if (str(a.expectedCurrentVersion) !== str(input.requestExpectedCurrentVersion)) {
    blocked.push('F008_APPROVAL_VERSION_MISMATCH');
  }
  if (str(a.newVersion) !== str(input.requestNewVersion)) {
    blocked.push('F008_APPROVAL_VERSION_MISMATCH');
  }

  // hash fields must match request
  if (
    str(a.configBeforeHash) !== str(input.requestConfigBeforeHash) ||
    str(a.configAfterHash) !== str(input.requestConfigAfterHash) ||
    str(a.diffHash) !== str(input.requestDiffHash)
  ) {
    blocked.push('F008_APPROVAL_HASH_MISMATCH');
  }

  // optional strict caller match
  if (input.strictCallerMatch !== false && a.approvedByUserId !== input.callerContext.callerUserId) {
    blocked.push('F009_APPROVAL_APPROVED_BY_MISMATCH');
  }

  const unique = [...new Set(blocked)] as BlockedReason[];
  return { valid: unique.length === 0, blockedReasons: unique };
}
