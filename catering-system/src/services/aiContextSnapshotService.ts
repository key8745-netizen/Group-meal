/**
 * aiContextSnapshotService.ts
 *
 * Builds and caches AIContextSnapshot objects.
 *
 * HARD RULES:
 *  1. createAIContextSnapshot() is pure — no Firestore writes in Phase 2.
 *  2. debug mode snapshots MUST NOT be used for AI suggestions.
 *  3. expiresAt = generatedAt + 4 hours (default, non-configurable).
 *  4. sourceCollections containing 'ocr_staging' or 'pending_menu_imports'
 *     → contaminationDetected = true.
 *  5. recordCounts total > 500 (summary) or > 2000 (debug) → snapshot is
 *     too large and will fail validation.
 *  6. cacheKey must include tenantId + mode + dateRange.
 *  7. Phase 3 will add actual Firestore cache write — interface is stable.
 */

import type {
  AIContextSnapshot, AIContextSummary,
  SnapshotId, TenantId, BlockedReason, CallerType,
} from '@/types/aiBoundary';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default snapshot TTL: 4 hours */
export const SNAPSHOT_TTL_MS = 4 * 60 * 60 * 1000;

/** Max total records for summary-mode snapshots */
export const SUMMARY_MODE_RECORD_LIMIT = 500;

/** Max total records for debug-mode snapshots */
export const DEBUG_MODE_RECORD_LIMIT = 2000;

/** Collections that indicate OCR staging contamination */
const OCR_STAGING_COLLECTIONS = ['ocr_staging', 'pending_menu_imports'] as const;

// ─── createSnapshotCacheKey ───────────────────────────────────────────────────

/**
 * Creates a stable cache key for a snapshot configuration.
 * Format: `{tenantId}:{mode}:{dateRangeStart.toISOString()}:{dateRangeEnd.toISOString()}`
 */
export function createSnapshotCacheKey(input: {
  tenantId: TenantId;
  mode: 'summary' | 'debug';
  dateRangeStart: Date;
  dateRangeEnd: Date;
}): string {
  return [
    input.tenantId,
    input.mode,
    input.dateRangeStart.toISOString(),
    input.dateRangeEnd.toISOString(),
  ].join(':');
}

// ─── generateSnapshotId ───────────────────────────────────────────────────────

function generateSnapshotId(): SnapshotId {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `snap_${ts}_${rand}` as SnapshotId;
}

// ─── createAIContextSnapshot ──────────────────────────────────────────────────

export interface CreateAIContextSnapshotInput {
  tenantId: TenantId;
  mode: 'summary' | 'debug';
  now: Date;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  summary: AIContextSummary;
  sourceCollections: string[];
  recordCounts: Record<string, number>;
  contaminationDetected: boolean;
  contaminationReasons: BlockedReason[];
  createdBy: CallerType;
}

/**
 * Builds an AIContextSnapshot from a pre-computed AIContextSummary.
 *
 * Phase 2: returns the snapshot object; does not write to Firestore.
 * Phase 3: caller should persist the snapshot to ai_context_snapshots/{snapshotId}.
 *
 * Auto-detects OCR staging contamination from sourceCollections.
 * expiresAt is always now + 4 hours.
 */
export function createAIContextSnapshot(
  input: CreateAIContextSnapshotInput,
): AIContextSnapshot {
  const {
    tenantId, mode, now, dateRangeStart, dateRangeEnd,
    summary, sourceCollections, recordCounts,
    createdBy,
  } = input;

  // OCR staging detection — merge with caller-provided contamination
  const ocrContaminated = sourceCollections.some(c =>
    (OCR_STAGING_COLLECTIONS as readonly string[]).includes(c),
  );
  const contaminationDetected = input.contaminationDetected || ocrContaminated;

  const contaminationReasons: BlockedReason[] = [...input.contaminationReasons];
  if (ocrContaminated && !contaminationReasons.includes('UNVERIFIED_OR_CONTAMINATED_SOURCE')) {
    contaminationReasons.push('UNVERIFIED_OR_CONTAMINATED_SOURCE');
  }

  const cacheKey = createSnapshotCacheKey({ tenantId, mode, dateRangeStart, dateRangeEnd });

  return {
    snapshotId:           generateSnapshotId(),
    tenantId,
    mode,
    generatedAt:          now,
    expiresAt:            new Date(now.getTime() + SNAPSHOT_TTL_MS),
    sourceCollections,
    recordCounts,
    contaminationDetected,
    contaminationReasons,
    summary,
    createdBy,
    cacheKey,
  };
}

// ─── totalRecordCount ─────────────────────────────────────────────────────────

/** Returns the sum of all per-collection record counts */
export function totalRecordCount(recordCounts: Record<string, number>): number {
  return Object.values(recordCounts).reduce((sum, n) => sum + n, 0);
}
