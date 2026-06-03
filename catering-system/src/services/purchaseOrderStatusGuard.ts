/**
 * purchaseOrderStatusGuard.ts
 *
 * Pure guard for purchase order status transitions.
 *
 * HARD RULES:
 *  - Only the defined allowed transitions are valid
 *  - AI callers cannot trigger RECEIVED
 *  - Cancelled orders cannot transition to any other status
 *  - No Firestore reads or writes
 *  - No inventoryService calls
 */

import type { BlockedReason, CallerType } from '@/types/aiBoundary';
import type { PurchaseOrderStatus } from '@/types/receivingBoundary';

// ─── Allowed transitions ──────────────────────────────────────────────────────

/**
 * Valid status transitions for purchase orders.
 * Key = fromStatus, Value = allowed toStatus values.
 *
 * DRAFT → PENDING: human-only
 * PENDING → RECEIVED: human-only (AI_RECEIVING_FORBIDDEN enforced separately)
 * PENDING → CANCELLED: human-only
 * All others are forbidden.
 */
const ALLOWED_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT:      ['PENDING'],
  PENDING:    ['RECEIVED', 'CANCELLED'],
  RECEIVED:   [],
  CANCELLED:  [],
};

/** Transitions that require callerType === 'human' */
const HUMAN_ONLY_TRANSITIONS: Array<{ from: PurchaseOrderStatus; to: PurchaseOrderStatus }> = [
  { from: 'DRAFT',    to: 'PENDING'   },
  { from: 'PENDING',  to: 'RECEIVED'  },
  { from: 'PENDING',  to: 'CANCELLED' },
];

// ─── validatePurchaseOrderStatusTransition ────────────────────────────────────

export interface StatusTransitionRequest {
  purchaseOrderId: string;
  fromStatus: PurchaseOrderStatus;
  toStatus: PurchaseOrderStatus;
  callerType: CallerType;
}

export interface StatusTransitionValidationResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Validates a proposed purchase order status transition.
 * Pure function — no Firestore reads or writes.
 *
 * Blocks when:
 *  - Transition is not in the allowed set
 *  - AI or system caller attempts a human-only transition
 *  - Specifically blocks AI → RECEIVED with AI_RECEIVING_FORBIDDEN
 */
export function validatePurchaseOrderStatusTransition(
  request: StatusTransitionRequest,
): StatusTransitionValidationResult {
  const { fromStatus, toStatus, callerType } = request;
  const blocked: BlockedReason[] = [];

  const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];

  if (!allowed.includes(toStatus)) {
    if (fromStatus === toStatus) {
      blocked.push('PURCHASE_ORDER_STATUS_TRANSITION_INVALID');
    } else if (fromStatus === 'RECEIVED') {
      blocked.push('PURCHASE_ORDER_ALREADY_RECEIVED');
    } else if (fromStatus === 'PENDING' && toStatus === 'DRAFT') {
      blocked.push('PURCHASE_ORDER_STATUS_TRANSITION_INVALID');
    } else if (fromStatus === 'DRAFT' && toStatus === 'RECEIVED') {
      blocked.push('PURCHASE_ORDER_STATUS_TRANSITION_INVALID');
      blocked.push('AI_RECEIVING_FORBIDDEN');
    } else {
      blocked.push('PURCHASE_ORDER_STATUS_TRANSITION_INVALID');
    }
  }

  // Enforce human-only transitions
  const isHumanOnly = HUMAN_ONLY_TRANSITIONS.some(
    (t) => t.from === fromStatus && t.to === toStatus,
  );

  if (isHumanOnly && callerType !== 'human') {
    if (toStatus === 'RECEIVED') {
      blocked.push('AI_RECEIVING_FORBIDDEN');
    } else {
      blocked.push('AI_PURCHASE_SUBMIT_FORBIDDEN');
    }
  }

  // fromStatus === PENDING is required for RECEIVED transitions
  if (toStatus === 'RECEIVED' && fromStatus !== 'PENDING') {
    if (!blocked.includes('PURCHASE_ORDER_NOT_PENDING')) {
      blocked.push('PURCHASE_ORDER_NOT_PENDING');
    }
  }

  return {
    allowed: blocked.length === 0,
    blockedReasons: [...new Set(blocked)] as BlockedReason[],
  };
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Returns true only when a PENDING → RECEIVED transition by a human is valid */
export function canReceivePurchaseOrder(
  fromStatus: PurchaseOrderStatus,
  callerType: CallerType,
): boolean {
  const result = validatePurchaseOrderStatusTransition({
    purchaseOrderId: '',
    fromStatus,
    toStatus: 'RECEIVED',
    callerType,
  });
  return result.allowed;
}
