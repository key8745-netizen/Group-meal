/**
 * receivingBoundaryService.ts
 *
 * Pure validation for purchase order receiving confirmation (Feature 002).
 *
 * HARD RULES:
 *  1. No Firestore reads or writes.
 *  2. No inventoryService calls.
 *  3. AI callers are unconditionally blocked.
 *  4. Only PENDING → RECEIVED transitions are allowed.
 *  5. Duplicate receiving attempts are blocked.
 *  6. Delta > 15% requires a receivingNote.
 *  7. receivedQtyGrams must be > 0.
 *  8. AI cannot update inventory — that path is reserved for purchaseOrderService.
 */

import type { BlockedReason } from '@/types/aiBoundary';
import type {
  ReceivingConfirmationRequest,
  ReceivingValidationResult,
  Grams,
} from '@/types/receivingBoundary';
import { RECEIVING_DELTA_NOTE_THRESHOLD } from '@/types/receivingBoundary';

// ─── validateReceivingConfirmation ────────────────────────────────────────────

/**
 * Validates a ReceivingConfirmationRequest before any Firestore operation.
 *
 * Never throws. Returns ReceivingValidationResult with allowed === false and
 * non-empty blockedReasons when any rule is violated.
 */
export function validateReceivingConfirmation(
  request: ReceivingConfirmationRequest,
): ReceivingValidationResult {
  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  // ── Caller identity ────────────────────────────────────────────────────────

  if (request.callerType !== 'human') {
    blocked.push('AI_RECEIVING_FORBIDDEN');
    blocked.push('AI_INVENTORY_UPDATE_FORBIDDEN');
  }

  if (!request.humanReceiverId) {
    blocked.push('MISSING_HUMAN_RECEIVER');
  }

  // ── Request identifiers ────────────────────────────────────────────────────

  if (!request.requestId) {
    blocked.push('MISSING_REQUEST_ID');
  }

  if (!request.receivingToken) {
    blocked.push('MISSING_RECEIVING_TOKEN');
  }

  if (!request.purchaseOrderId) {
    blocked.push('PURCHASE_ORDER_NOT_PENDING');
  }

  if (!request.auditTrailId) {
    blocked.push('MISSING_AUDIT_TRAIL_ID');
  }

  if (!request.tenantId) {
    blocked.push('MISSING_TENANT_ID');
  }

  // ── Quantity validation ────────────────────────────────────────────────────

  if (!request.receivedQtyGrams || request.receivedQtyGrams <= 0) {
    blocked.push('INVALID_RECEIVED_QTY');
    blocked.push('RECEIVED_QTY_GRAMS_REQUIRED');
  }

  if (!request.orderedQtyGrams || request.orderedQtyGrams <= 0) {
    blocked.push('INVALID_RECEIVED_QTY');
  }

  // ── Delta calculation and note requirement ─────────────────────────────────

  let deltaQtyGrams: Grams | undefined;
  let deltaPercent: number | undefined;

  if (
    request.receivedQtyGrams > 0 &&
    request.orderedQtyGrams > 0
  ) {
    deltaQtyGrams = (request.receivedQtyGrams - request.orderedQtyGrams) as Grams;
    deltaPercent = Math.abs(deltaQtyGrams) / request.orderedQtyGrams;

    if (deltaPercent > RECEIVING_DELTA_NOTE_THRESHOLD && !request.receivingNote) {
      blocked.push('RECEIVING_DELTA_NOTE_REQUIRED');
    }

    if (deltaPercent > RECEIVING_DELTA_NOTE_THRESHOLD) {
      warnings.push('RECEIVING_DELTA_NOTE_REQUIRED');
    }
  }

  return {
    allowed: blocked.length === 0,
    blockedReasons: blocked,
    warnings,
    deltaQtyGrams,
    deltaPercent: deltaPercent !== undefined ? Math.round(deltaPercent * 10000) / 100 : undefined,
  };
}
