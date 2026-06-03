/**
 * aiSnapshotValidationService.ts
 *
 * Validates an AIContextSnapshot before it is used to generate AI suggestions.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. Any single failing check → allowed: false with at least one BlockedReason.
 *  3. Never throw a silent error — always return blockedReasons.
 *  4. debug snapshots are always blocked for suggestion use.
 *  5. expired snapshots are always blocked.
 *  6. contaminated snapshots are always blocked.
 *  7. summary-mode record limit: 500. debug-mode: 2000.
 */

import type {
  AIContextSnapshot, AIOperationValidationResult, BlockedReason, CallerType,
} from '@/types/aiBoundary';
import { SUMMARY_MODE_RECORD_LIMIT, DEBUG_MODE_RECORD_LIMIT, totalRecordCount } from './aiContextSnapshotService';

/**
 * Validates that a snapshot is safe to use for generating an AI suggestion.
 *
 * Checks (in order):
 *  1. tenantId present → MISSING_TENANT_ID
 *  2. snapshotId present → MISSING_SNAPSHOT_ID
 *  3. mode === 'summary' → SNAPSHOT_DEBUG_NOT_ALLOWED
 *  4. expiresAt > now → EXPIRED_SNAPSHOT
 *  5. contaminationDetected === false → UNVERIFIED_OR_CONTAMINATED_SOURCE
 *  6. totalRecordCount ≤ limit → SNAPSHOT_TOO_LARGE
 *  7. summary exists → INCOMPLETE_BOM
 *  8. summary.tenantId === snapshot.tenantId → TENANT_MISMATCH
 *  9. summary.blockedReasons empty → propagated from summary
 */
export function validateSnapshotForSuggestion(
  snapshot: AIContextSnapshot,
  now: Date,
): AIOperationValidationResult {
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  if (!snapshot.tenantId) {
    blocked.push('MISSING_TENANT_ID');
  }

  if (!snapshot.snapshotId) {
    blocked.push('MISSING_SNAPSHOT_ID');
  }

  if (snapshot.mode === 'debug') {
    blocked.push('SNAPSHOT_DEBUG_NOT_ALLOWED');
  }

  if (snapshot.expiresAt <= now) {
    blocked.push('EXPIRED_SNAPSHOT');
  }

  if (snapshot.contaminationDetected) {
    blocked.push('UNVERIFIED_OR_CONTAMINATED_SOURCE');
  }

  const recordLimit = snapshot.mode === 'debug'
    ? DEBUG_MODE_RECORD_LIMIT
    : SUMMARY_MODE_RECORD_LIMIT;

  if (totalRecordCount(snapshot.recordCounts) > recordLimit) {
    blocked.push('SNAPSHOT_TOO_LARGE');
  }

  if (!snapshot.summary) {
    blocked.push('INCOMPLETE_BOM');
  } else {
    // Tenant consistency: summary must belong to the same tenant as the snapshot
    if (snapshot.tenantId && snapshot.summary.tenantId !== snapshot.tenantId) {
      blocked.push('TENANT_MISMATCH');
    }

    for (const r of snapshot.summary.blockedReasons) {
      if (!blocked.includes(r)) blocked.push(r);
    }
    for (const w of snapshot.summary.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }

  return {
    allowed:        blocked.length === 0,
    blockedReasons: blocked,
    warnings,
  };
}

// ─── requireDebugModePermission ───────────────────────────────────────────────

/**
 * Returns allowed: true only when the caller has explicit admin permission to
 * create a debug-mode snapshot.
 *
 * Rules:
 *  - AI callers (callerType === 'ai') are always blocked from debug mode.
 *  - Human callers without admin permission are also blocked.
 *  - Debug snapshots created under this check still cannot be used for suggestions
 *    (validateSnapshotForSuggestion will return SNAPSHOT_DEBUG_NOT_ALLOWED).
 */
export function requireDebugModePermission(input: {
  callerType: CallerType;
  hasAdminPermission?: boolean;
}): AIOperationValidationResult {
  const blocked: BlockedReason[] = [];

  if (input.callerType === 'ai') {
    blocked.push('SNAPSHOT_DEBUG_NOT_ALLOWED');
  } else if (!input.hasAdminPermission) {
    blocked.push('SNAPSHOT_DEBUG_NOT_ALLOWED');
  }

  return {
    allowed:        blocked.length === 0,
    blockedReasons: blocked,
    warnings:       [],
  };
}
