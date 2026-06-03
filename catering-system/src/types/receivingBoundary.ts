/**
 * receivingBoundary.ts
 *
 * Type definitions for Feature 002: Receiving Boundary.
 *
 * HARD RULES:
 *  - AI cannot trigger RECEIVED transition
 *  - AI cannot write inventory/{id}.currentStock
 *  - All quantities in Grams (branded type)
 *  - Idempotency locks prevent duplicate receiving attempts
 *  - Delta >15% requires a receivingNote
 *  - Transaction steps are planned (dry-run) before execution
 *
 * No Firestore imports — pure TypeScript.
 */

import type {
  Grams, TenantId, SnapshotId, SuggestionId, AuditTrailId,
  BlockedReason, CallerType,
} from './aiBoundary';

// ─── Re-exports for convenience ───────────────────────────────────────────────

export type { Grams, TenantId, SnapshotId, SuggestionId, AuditTrailId, BlockedReason, CallerType };

// ─── Purchase order status ────────────────────────────────────────────────────

export type PurchaseOrderStatus = 'DRAFT' | 'PENDING' | 'RECEIVED' | 'CANCELLED';

// ─── Receiving confirmation request ──────────────────────────────────────────

/**
 * Input submitted by a human to confirm receipt of a PENDING purchase order.
 * callerType must always be 'human' — AI callers are unconditionally blocked.
 */
export interface ReceivingConfirmationRequest {
  requestId: string;
  receivingToken: string;
  tenantId: TenantId;
  purchaseOrderId: string;
  auditTrailId: AuditTrailId;
  humanReceiverId: string;
  callerType: CallerType;
  orderedQtyGrams: Grams;
  receivedQtyGrams: Grams;
  receivingNote?: string;
  receivedAt: Date;
}

// ─── Receiving validation result ──────────────────────────────────────────────

/**
 * Result of validateReceivingConfirmation().
 * allowed === true only when blockedReasons is empty.
 */
export interface ReceivingValidationResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  /** Signed delta: receivedQtyGrams − orderedQtyGrams */
  deltaQtyGrams?: Grams;
  /** Percentage deviation from ordered qty (absolute value × 100) */
  deltaPercent?: number;
}

// ─── Idempotency lock ─────────────────────────────────────────────────────────

/**
 * A short-lived lock created before executing a receiving transaction.
 * Prevents duplicate receiving attempts for the same purchase order.
 *
 * status transitions: ACTIVE → CONSUMED (on success) | EXPIRED (on TTL expiry)
 */
export interface ReceivingIdempotencyLock {
  lockId: string;
  tenantId: TenantId;
  purchaseOrderId: string;
  receivingToken: string;
  requestId: string;
  createdAt: Date;
  /** Default TTL: createdAt + 10 minutes */
  expiresAt: Date;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
}

// ─── Inventory transaction draft ──────────────────────────────────────────────

/**
 * A planned (not yet executed) inventory transaction for PURCHASE_RECEIVING.
 * Built by buildReceivingTransactionDryRunPlan() before any Firestore write.
 *
 * HARD RULE: this draft must never be written to inventory directly.
 * It is passed to inventoryService.restockIngredient() at execution time.
 */
export interface InventoryTransactionDraft {
  inventoryTransactionId: string;
  tenantId: TenantId;
  purchaseOrderId: string;
  auditTrailId: AuditTrailId;
  humanReceiverId: string;
  orderedQtyGrams: Grams;
  receivedQtyGrams: Grams;
  /** receivedQtyGrams − orderedQtyGrams (signed) */
  deltaQtyGrams: Grams;
  transactionType: 'PURCHASE_RECEIVING';
  createdAt: Date;
}

// ─── AI performance metric ────────────────────────────────────────────────────

/**
 * Isolated performance metric for AI suggestion accuracy.
 * Written to ai_performance_metrics — NOT to performanceLogs.
 *
 * HARD RULES:
 *  - aiCanMutateRules is always false (invariant — AI cannot adjust its own rules)
 *  - createdBy is always 'system' (human confirmation triggers, system records)
 *  - This document must never be finalized or mutated by AI
 */
export interface AIPerformanceMetric {
  metricId: string;
  tenantId: TenantId;
  purchaseOrderId: string;
  suggestionId?: SuggestionId;
  sourceSnapshotId?: SnapshotId;
  auditTrailId: AuditTrailId;
  orderedQtyGrams: Grams;
  receivedQtyGrams: Grams;
  /** receivedQtyGrams − orderedQtyGrams (signed) */
  deltaQtyGrams: Grams;
  /** Absolute percentage deviation from ordered qty */
  deltaPercent: number;
  /** Human-provided note when delta exceeds 15% */
  reason?: string;
  createdAt: Date;
  createdBy: 'system';
  /** Invariant: AI can never mutate its own performance rules */
  aiCanMutateRules: false;
}

// ─── Transaction step labels ──────────────────────────────────────────────────

/**
 * Ordered steps in a receiving transaction.
 * Used in ReceivingTransactionDryRunPlan to enumerate what will happen.
 * Execution is performed by purchaseOrderService.receiveAIPurchaseOrder() — NOT here.
 */
export type ReceivingTransactionStep =
  | 'READ_PURCHASE_ORDER'
  | 'READ_INVENTORY'
  | 'READ_IDEMPOTENCY_LOCK'
  | 'VALIDATE_PURCHASE_ORDER_PENDING'
  | 'VALIDATE_HUMAN_RECEIVER'
  | 'VALIDATE_IDEMPOTENCY'
  | 'VALIDATE_RECEIVED_QTY'
  | 'CREATE_RECEIVING_LOCK'
  | 'CREATE_INVENTORY_TRANSACTION'
  | 'INCREMENT_INVENTORY_CURRENT_STOCK_GRAMS'
  | 'UPDATE_PURCHASE_ORDER_RECEIVED'
  | 'APPEND_AUDIT_EVENT'
  | 'CREATE_AI_PERFORMANCE_METRIC';

// ─── Transaction dry-run plan ─────────────────────────────────────────────────

/**
 * A planned sequence of transaction steps for receiving confirmation.
 * Built by buildReceivingTransactionDryRunPlan() — no Firestore operations.
 *
 * blockedReasons is non-empty when the plan cannot proceed.
 * When blockedReasons is empty, steps contains the full ordered execution plan.
 */
export interface ReceivingTransactionDryRunPlan {
  purchaseOrderId: string;
  tenantId: TenantId;
  receivingToken: string;
  requestId: string;
  /** Ordered execution steps — empty when blockedReasons is non-empty */
  steps: ReceivingTransactionStep[];
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

// ─── Delta threshold constants ────────────────────────────────────────────────

/** Receiving delta above this fraction (absolute) requires a receivingNote */
export const RECEIVING_DELTA_NOTE_THRESHOLD = 0.15;

/** Default TTL for idempotency locks in milliseconds (10 minutes) */
export const RECEIVING_LOCK_TTL_MS = 10 * 60 * 1000;
