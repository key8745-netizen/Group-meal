/**
 * receivingTransactionPlanService.ts
 *
 * Builds a dry-run transaction plan for purchase order receiving (Feature 002).
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. No inventoryService calls.
 *  3. No runTransaction execution.
 *  4. AI callers are unconditionally blocked.
 *  5. Only produces a plan; execution is delegated to purchaseOrderService.
 *  6. When blockedReasons is non-empty, steps is [].
 *  7. Includes CREATE_AI_PERFORMANCE_METRIC step always (human confirm triggers it,
 *     but AI cannot mutate the resulting record).
 */

import type { BlockedReason } from '@/types/aiBoundary';
import type {
  ReceivingConfirmationRequest,
  ReceivingTransactionDryRunPlan,
  ReceivingTransactionStep,
} from '@/types/receivingBoundary';
import { validateReceivingConfirmation } from './receivingBoundaryService';

// ─── Full ordered step sequence ───────────────────────────────────────────────

const ALL_STEPS: ReceivingTransactionStep[] = [
  'READ_PURCHASE_ORDER',
  'READ_INVENTORY',
  'READ_IDEMPOTENCY_LOCK',
  'VALIDATE_PURCHASE_ORDER_PENDING',
  'VALIDATE_HUMAN_RECEIVER',
  'VALIDATE_IDEMPOTENCY',
  'VALIDATE_RECEIVED_QTY',
  'CREATE_RECEIVING_LOCK',
  'CREATE_INVENTORY_TRANSACTION',
  'INCREMENT_INVENTORY_CURRENT_STOCK_GRAMS',
  'UPDATE_PURCHASE_ORDER_RECEIVED',
  'APPEND_AUDIT_EVENT',
  'CREATE_AI_PERFORMANCE_METRIC',
];

// ─── buildReceivingTransactionDryRunPlan ──────────────────────────────────────

/**
 * Validates a ReceivingConfirmationRequest and returns a dry-run plan
 * describing what steps would be executed on confirmation.
 *
 * Never throws. When validation fails, returns plan with empty steps and
 * non-empty blockedReasons.
 */
export function buildReceivingTransactionDryRunPlan(
  request: ReceivingConfirmationRequest,
): ReceivingTransactionDryRunPlan {
  const validation = validateReceivingConfirmation(request);

  if (!validation.allowed) {
    return {
      purchaseOrderId: request.purchaseOrderId,
      tenantId:        request.tenantId,
      receivingToken:  request.receivingToken,
      requestId:       request.requestId,
      steps:           [],
      blockedReasons:  validation.blockedReasons,
      warnings:        validation.warnings,
    };
  }

  return {
    purchaseOrderId: request.purchaseOrderId,
    tenantId:        request.tenantId,
    receivingToken:  request.receivingToken,
    requestId:       request.requestId,
    steps:           ALL_STEPS,
    blockedReasons:  [],
    warnings:        validation.warnings,
  };
}

// ─── planContainsStep ─────────────────────────────────────────────────────────

/** Checks whether a step appears in a plan's step list */
export function planContainsStep(
  plan: ReceivingTransactionDryRunPlan,
  step: ReceivingTransactionStep,
): boolean {
  return plan.steps.includes(step);
}

// ─── isExecutablePlan ─────────────────────────────────────────────────────────

/** Returns true when the plan has no blocked reasons and contains all required steps */
export function isExecutablePlan(plan: ReceivingTransactionDryRunPlan): boolean {
  return plan.blockedReasons.length === 0 && plan.steps.length === ALL_STEPS.length;
}

// ─── Re-export for test convenience ──────────────────────────────────────────

export { ALL_STEPS };

// ─── BlockedReason type re-export ─────────────────────────────────────────────

export type { BlockedReason };
