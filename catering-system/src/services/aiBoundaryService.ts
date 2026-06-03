/**
 * aiBoundaryService.ts
 *
 * Enforces the AI Decision Boundary (Feature 001 v1.3).
 *
 * This service is the authoritative gate that decides whether an AI-initiated
 * Firestore operation is permitted.  Every AI write must be pre-validated here.
 *
 * Phase 1 scope:
 *  - Define forbidden/allowed collection lists (const, never runtime-configurable)
 *  - Implement validateOperation() — pure validation, no Firestore calls
 *  - No Netlify Function wiring
 *  - No Admin SDK
 *  - No UI integration
 *  - No connection to existing purchase flow
 *
 * The constants below are 'as const' so TypeScript infers literal tuple types,
 * making exhaustiveness checks possible in future switch statements.
 */

import type {
  AIOperationRequest,
  AIOperationValidationResult,
  BlockedReason,
  CallerType,
} from '@/types/aiBoundary';

// ─── Permission tables ────────────────────────────────────────────────────────

/**
 * Collections that AI callers (callerType === 'ai') may never write.
 * Any write attempt to these collections is an immediate hard block.
 */
export const AI_FORBIDDEN_COLLECTIONS = [
  'inventory',
  'settings',
  'confirmedMenus',
  'confirmedBOM',
  'inventoryTransactions',
] as const;

export type AIForbiddenCollection = typeof AI_FORBIDDEN_COLLECTIONS[number];

/**
 * Field-level patterns that AI callers may never write, regardless of collection.
 * Checked against the keys in AIOperationRequest.payloadSummary.
 *
 * Pattern matching is substring-based: if payloadSummary contains a key that
 * includes any of these strings, the operation is blocked.
 */
export const AI_FORBIDDEN_FIELD_PATTERNS = [
  'currentStockGrams',
  'currentStockKg',     // legacy field also forbidden
  'status.RECEIVED',    // AI must never finalise an order
  'finalized',          // performanceLogs.finalized
] as const;

export type AIForbiddenFieldPattern = typeof AI_FORBIDDEN_FIELD_PATTERNS[number];

/**
 * The only collections where AI callers (callerType === 'ai') may create documents.
 * All other write operations are forbidden for AI.
 */
export const AI_ALLOWED_WRITE_COLLECTIONS = [
  'ai_suggestions',
  'ai_suggestion_feedback',
  'draft_purchase_suggestions',
  'ai_audit_trails',
] as const;

export type AIAllowedWriteCollection = typeof AI_ALLOWED_WRITE_COLLECTIONS[number];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isForbiddenCollection(collection: string): collection is AIForbiddenCollection {
  return (AI_FORBIDDEN_COLLECTIONS as readonly string[]).includes(collection);
}

function isAllowedWriteCollection(collection: string): collection is AIAllowedWriteCollection {
  return (AI_ALLOWED_WRITE_COLLECTIONS as readonly string[]).includes(collection);
}

/**
 * Returns any forbidden field patterns found in the payload summary keys.
 * Checks for both exact key match and substring inclusion.
 */
function findForbiddenFields(
  payloadSummary: Record<string, unknown>,
): string[] {
  const payloadKeys = Object.keys(payloadSummary);
  const found: string[] = [];

  for (const pattern of AI_FORBIDDEN_FIELD_PATTERNS) {
    for (const key of payloadKeys) {
      if (key === pattern || key.includes(pattern)) {
        found.push(key);
      }
    }
  }
  return found;
}

// ─── validateOperation ────────────────────────────────────────────────────────

/**
 * Validates whether an AI-initiated Firestore operation is permitted.
 *
 * Validation is PURE — no Firestore reads or writes occur here.
 * Call this before every AI write; never skip it.
 *
 * Rules enforced:
 *  Identity:
 *   - tenantId must be present
 *   - callerType must be present and a valid CallerType
 *   - callerId must be present and non-empty
 *   - requestId must be present and non-empty
 *
 *  When callerType === 'ai':
 *   - targetCollection must not be in AI_FORBIDDEN_COLLECTIONS
 *   - action 'update' or 'delete' on any forbidden field → blocked
 *   - action 'create' must target an AI_ALLOWED_WRITE_COLLECTIONS
 *   - sourceSnapshotId required for all write actions (except creating audit trail)
 *   - auditTrailId required for all write actions (except creating the audit trail itself)
 *   - payloadSummary must not contain forbidden fields
 *
 *  Tenant consistency:
 *   - If payloadSummary.tenantId exists, it must match the request tenantId
 *
 *  All rejections include at least one BlockedReason.
 *  Silent failures are forbidden.
 */
export function validateOperation(
  request: AIOperationRequest,
): AIOperationValidationResult {
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  // ── Identity checks (all caller types) ───────────────────────────────────

  if (!request.tenantId || request.tenantId.trim() === '') {
    blocked.push('MISSING_TENANT_ID');
  }

  if (!request.callerType) {
    blocked.push('MISSING_CALLER_TYPE');
  } else {
    const validTypes: CallerType[] = ['human', 'ai', 'system'];
    if (!validTypes.includes(request.callerType)) {
      blocked.push('MISSING_CALLER_TYPE');
    }
  }

  if (!request.callerId || request.callerId.trim() === '') {
    blocked.push('MISSING_CALLER_ID');
  }

  if (!request.requestId || request.requestId.trim() === '') {
    blocked.push('MISSING_REQUEST_ID');
  }

  // ── Tenant consistency check ──────────────────────────────────────────────

  if (
    request.tenantId &&
    request.payloadSummary.tenantId !== undefined &&
    request.payloadSummary.tenantId !== request.tenantId
  ) {
    blocked.push('TENANT_MISMATCH');
  }

  // ── AI-specific checks ────────────────────────────────────────────────────

  if (request.callerType === 'ai') {
    const isWriteAction =
      request.action === 'create' ||
      request.action === 'update' ||
      request.action === 'delete';

    // 1. Forbidden collections
    if (isForbiddenCollection(request.targetCollection)) {
      blocked.push('AI_FORBIDDEN_WRITE_ATTEMPT');
    }

    // 2. Forbidden field patterns in payload
    const forbiddenFieldsFound = findForbiddenFields(request.payloadSummary);
    if (forbiddenFieldsFound.length > 0) {
      blocked.push('FORBIDDEN_FIELD_IN_PAYLOAD');
    }

    // 3. Write actions must target allowed collections
    if (isWriteAction && !isForbiddenCollection(request.targetCollection)) {
      if (!isAllowedWriteCollection(request.targetCollection)) {
        blocked.push('AI_FORBIDDEN_WRITE_ATTEMPT');
      }
    }

    // 4. Explicit guard: AI cannot set purchaseOrders.status to RECEIVED
    //    (also caught by FORBIDDEN_FIELD_PATTERNS but checked explicitly for clarity)
    const statusValue = request.payloadSummary['status'];
    if (
      request.targetCollection === 'purchaseOrders' &&
      (statusValue === 'RECEIVED' || statusValue === 'received')
    ) {
      blocked.push('AI_FORBIDDEN_WRITE_ATTEMPT');
    }

    // 5. sourceSnapshotId required for write operations
    //    Exception: creating the first event of an audit trail does not yet have a snapshotId
    const isCreatingAuditTrail =
      request.action === 'create' &&
      request.targetCollection === 'ai_audit_trails';

    if (isWriteAction && !isCreatingAuditTrail && !request.sourceSnapshotId) {
      blocked.push('MISSING_AUDIT_TRAIL'); // re-using audit reason; snapshotId is part of audit chain
    }

    // 6. auditTrailId required for write operations (except creating the trail itself)
    if (isWriteAction && !isCreatingAuditTrail && !request.auditTrailId) {
      blocked.push('MISSING_AUDIT_TRAIL');
    }
  }

  // ── Result ────────────────────────────────────────────────────────────────

  const allowed = blocked.length === 0;

  // Guarantee: a rejected result always has at least one blocked reason
  // This assertion documents the invariant for future readers.
  if (!allowed && blocked.length === 0) {
    // Should be unreachable; included as a safety net
    blocked.push('MISSING_CALLER_TYPE');
  }

  return { allowed, blockedReasons: blocked, warnings };
}

// ─── Convenience type guards ──────────────────────────────────────────────────

/** Returns true when the collection is in AI_FORBIDDEN_COLLECTIONS */
export function isAIForbiddenCollection(collection: string): boolean {
  return isForbiddenCollection(collection);
}

/** Returns true when the collection is in AI_ALLOWED_WRITE_COLLECTIONS */
export function isAIAllowedWriteCollection(collection: string): boolean {
  return isAllowedWriteCollection(collection);
}
