/**
 * realModelConfigApplyDryRunToRealComparer.ts
 *
 * Feature 009 Phase 5B: Dry-Run-to-Real Write-Set Comparer
 *
 * Compares a dry-run write-set intent against the real write-set intent
 * across every binding identity/version/hash field. ANY mismatch BLOCKS
 * with a specific reason; an exact match passes.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction, no I/O
 *  - Pure synchronous — default-deny on missing input
 */

import type { BlockedReason, TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId, ModelConfigRecommendationId,
} from '../types/modelConfigApply';

export interface WriteSetIntent {
  readonly _kind: 'f009_phase5b_write_set_intent';
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  sourceRecommendationId: ModelConfigRecommendationId;
  auditTrailId: AuditTrailId;
  expectedCurrentVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  applyToken: ApplyToken;
  payloadHash: DiffHash;
}

export interface DryRunToRealComparisonResult {
  readonly _kind: 'f009_phase5b_dry_run_to_real_comparison_result';
  matches: boolean;
  blockedReasons: BlockedReason[];
  mismatchedFields: string[];
}

interface FieldCheck {
  field: string;
  reason: BlockedReason;
  pick: (i: WriteSetIntent) => string;
}

const FIELD_CHECKS: FieldCheck[] = [
  { field: 'tenantId', reason: 'F009_PHASE5B_DRYRUN_TENANT_MISMATCH', pick: i => String(i.tenantId) },
  { field: 'approvalId', reason: 'F009_PHASE5B_DRYRUN_APPROVAL_MISMATCH', pick: i => String(i.approvalId) },
  { field: 'sourceRecommendationId', reason: 'F009_PHASE5B_DRYRUN_RECOMMENDATION_MISMATCH', pick: i => String(i.sourceRecommendationId) },
  { field: 'auditTrailId', reason: 'F009_PHASE5B_DRYRUN_AUDIT_TRAIL_MISMATCH', pick: i => String(i.auditTrailId) },
  { field: 'expectedCurrentVersion', reason: 'F009_PHASE5B_DRYRUN_VERSION_MISMATCH', pick: i => String(i.expectedCurrentVersion) },
  { field: 'configBeforeHash', reason: 'F009_PHASE5B_DRYRUN_BEFORE_HASH_MISMATCH', pick: i => String(i.configBeforeHash) },
  { field: 'configAfterHash', reason: 'F009_PHASE5B_DRYRUN_AFTER_HASH_MISMATCH', pick: i => String(i.configAfterHash) },
  { field: 'diffHash', reason: 'F009_PHASE5B_DRYRUN_DIFF_HASH_MISMATCH', pick: i => String(i.diffHash) },
  { field: 'applyToken', reason: 'F009_PHASE5B_DRYRUN_APPLY_TOKEN_MISMATCH', pick: i => String(i.applyToken) },
  { field: 'payloadHash', reason: 'F009_PHASE5B_DRYRUN_PAYLOAD_HASH_MISMATCH', pick: i => String(i.payloadHash) },
];

/**
 * Compares a dry-run write-set intent to the real write-set intent across
 * tenantId, approvalId, sourceRecommendationId, auditTrailId,
 * expectedCurrentVersion, configBeforeHash, configAfterHash, diffHash,
 * applyToken, payloadHash. Collects ALL mismatches (not short-circuited).
 */
export function compareDryRunToReal(
  dryRun: WriteSetIntent | null | undefined,
  real: WriteSetIntent | null | undefined,
): DryRunToRealComparisonResult {
  if (!dryRun || !real) {
    const reasons: BlockedReason[] = FIELD_CHECKS.map(c => c.reason);
    return {
      _kind: 'f009_phase5b_dry_run_to_real_comparison_result',
      matches: false,
      blockedReasons: reasons,
      mismatchedFields: FIELD_CHECKS.map(c => c.field),
    };
  }

  const blocked: BlockedReason[] = [];
  const mismatched: string[] = [];

  for (const check of FIELD_CHECKS) {
    if (check.pick(dryRun) !== check.pick(real)) {
      blocked.push(check.reason);
      mismatched.push(check.field);
    }
  }

  return {
    _kind: 'f009_phase5b_dry_run_to_real_comparison_result',
    matches: blocked.length === 0,
    blockedReasons: blocked,
    mismatchedFields: mismatched,
  };
}
