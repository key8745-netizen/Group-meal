/**
 * receivingTransactionService.ts
 *
 * Feature 002 Phase 2: Real Receiving Transaction Implementation.
 *
 * HARD RULES (enforced both structurally and at runtime):
 *  1. ALL six writes (receiving lock, inventoryTransaction, inventory.currentStock,
 *     purchaseOrder.status=RECEIVED, audit event, ai_performance_metrics) must
 *     happen inside ONE Firestore runTransaction callback.
 *  2. AI callers are unconditionally blocked before the transaction is opened.
 *  3. Idempotency lock is read AND created inside the same transaction.
 *  4. Duplicate receiving (CONSUMED lock / already RECEIVED) is blocked.
 *  5. DRAFT → RECEIVED is blocked — only PENDING → RECEIVED is allowed.
 *  6. Delta > 15% without receivingNote causes transaction rollback.
 *  7. inventory.currentStock is updated with atomic increment() only.
 *  8. performanceLogs / finalizedPerformanceLogs / operationalReports are
 *     NEVER written — only ai_performance_metrics is produced.
 *  9. aiCanMutateRules is always false on every output type.
 *
 * The exported pure functions (validateReceivingBeforeWrite,
 * buildReceivingWritePayloads) are testable without Firestore.
 * receivePurchaseOrderWithTransaction() wraps the actual Firestore call.
 */

import {
  runTransaction,
  increment,
  serverTimestamp,
  type Firestore,
  type DocumentReference,
} from 'firebase/firestore';
import type {
  BlockedReason, AuditEvent, Grams, TenantId, AuditTrailId,
  SuggestionId, SnapshotId,
} from '@/types/aiBoundary';
import type {
  ReceivingConfirmationRequest,
  PurchaseOrderStatus,
} from '@/types/receivingBoundary';
import {
  RECEIVING_CONSUMED_LOCK_RETENTION_MS,
} from '@/types/receivingBoundary';
import { validateReceivingConfirmation } from './receivingBoundaryService';
import { validatePurchaseOrderStatusTransition } from './purchaseOrderStatusGuard';
import { validateReceivingIdempotencyLock } from './receivingIdempotencyService';
import { createAuditEvent } from './aiAuditTrailHelper';

// ─── Constants ────────────────────────────────────────────────────────────────

const GRAMS_PER_KG = 1000;

// ─── Internal Firestore document shapes ──────────────────────────────────────

/** Subset of a purchaseOrder document that the transaction needs to read */
export interface POSnapshotData {
  status: string;
  receivedAt?: unknown;
  inventoryTransactionId?: string;
  aiPendingMetadata?: {
    suggestionId?: string;
    sourceSnapshotId?: string;
    auditTrailId?: string;
  };
}

/** Subset of an inventory document */
export interface InventorySnapshotData {
  currentStock?: number;       // kg — existing schema
  currentStockGrams?: number;  // grams — new field stamped by this service
  ingredientId?: string;
  ingredientName?: string;
}

/** Subset of a receiving_locks document */
export interface LockSnapshotData {
  status?: string;
  expiresAt?: { toDate(): Date };
}

// ─── Transaction input / result ───────────────────────────────────────────────

export interface ReceivingTransactionInput {
  request: ReceivingConfirmationRequest;
  db: Firestore;
  /** Ref to purchaseOrders/{purchaseOrderId} */
  purchaseOrderRef: DocumentReference;
  /** Ref to inventory/{ingredientId} */
  inventoryRef: DocumentReference;
  /** Ref to receiving_locks/{purchaseOrderId}_{receivingToken} */
  receivingLockRef: DocumentReference;
  /** Pre-generated ref for the new inventory/{id}/transactions/{autoId} doc */
  inventoryTransactionRef: DocumentReference;
  /** Ref to ai_audit_trails/{auditTrailId}/events/{autoId} for the new event */
  auditTrailRef: DocumentReference;
  /** Pre-generated ref for the new ai_performance_metrics/{autoId} doc */
  aiPerformanceMetricRef: DocumentReference;
  now: Date;
  /** From the purchaseOrder's aiPendingMetadata (optional, for metric) */
  suggestionId?: SuggestionId;
  sourceSnapshotId?: SnapshotId;
}

export interface ReceivingTransactionResult {
  success: boolean;
  inventoryTransactionId?: string;
  auditEvent?: AuditEvent;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

// ─── Pure pre-transaction validation ─────────────────────────────────────────

export interface PreTransactionValidationInput {
  request: ReceivingConfirmationRequest;
  /** null when the document does not exist */
  poData: POSnapshotData | null;
  /** null when no lock document exists — this is the expected happy-path state */
  lockData: LockSnapshotData | null;
  now: Date;
}

export interface PreTransactionValidationResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  /** receivedQtyGrams − orderedQtyGrams (signed) */
  deltaQtyGrams: Grams;
  /** Absolute percentage deviation (0–100) */
  deltaPercent: number;
}

/**
 * Pure validation of a receiving request against the current document state.
 *
 * Called inside runTransaction after all reads, before any writes.
 * Also exported for unit testing without Firestore.
 *
 * Blocks on:
 *  - AI / system caller
 *  - Missing identifiers
 *  - PO not PENDING (includes DRAFT → RECEIVED guard)
 *  - Already-received indicators on the PO
 *  - Existing idempotency lock (CONSUMED or ACTIVE)
 *  - Invalid / missing receivedQtyGrams
 *  - Delta > 15% without receivingNote
 */
export function validateReceivingBeforeWrite(
  input: PreTransactionValidationInput,
): PreTransactionValidationResult {
  const { request, poData, lockData, now } = input;
  const allBlocked: BlockedReason[] = [];
  const allWarnings: BlockedReason[] = [];

  // ── 1. Boundary validation: AI guard, qty, delta, identifiers ─────────────
  const boundaryResult = validateReceivingConfirmation(request);
  allBlocked.push(...boundaryResult.blockedReasons);
  allWarnings.push(...boundaryResult.warnings);

  // ── 2. Purchase order state ────────────────────────────────────────────────
  if (poData === null) {
    allBlocked.push('PURCHASE_ORDER_NOT_PENDING');
  } else {
    // Status transition guard — only PENDING → RECEIVED allowed
    const statusResult = validatePurchaseOrderStatusTransition({
      purchaseOrderId: request.purchaseOrderId,
      fromStatus:      poData.status as PurchaseOrderStatus,
      toStatus:        'RECEIVED',
      callerType:      request.callerType,
    });
    if (!statusResult.allowed) {
      allBlocked.push(...statusResult.blockedReasons);
    }

    // Double-check: already-received markers on the document
    if (poData.receivedAt) {
      if (!allBlocked.includes('PURCHASE_ORDER_ALREADY_RECEIVED')) {
        allBlocked.push('PURCHASE_ORDER_ALREADY_RECEIVED');
      }
    }
    if (poData.inventoryTransactionId) {
      if (!allBlocked.includes('DUPLICATE_RECEIVING_ATTEMPT')) {
        allBlocked.push('DUPLICATE_RECEIVING_ATTEMPT');
      }
    }
  }

  // ── 3. Idempotency lock check ──────────────────────────────────────────────
  const lockObj = lockData?.status
    ? {
        lockId:          '',
        tenantId:        request.tenantId,
        purchaseOrderId: request.purchaseOrderId,
        receivingToken:  request.receivingToken,
        requestId:       request.requestId,
        createdAt:       now,
        expiresAt:       lockData.expiresAt?.toDate() ?? new Date(0),
        status:          lockData.status as 'ACTIVE' | 'CONSUMED' | 'EXPIRED',
      }
    : null;

  const lockResult = validateReceivingIdempotencyLock(lockObj, now);
  if (!lockResult.canProceed) {
    allBlocked.push(...lockResult.blockedReasons);
  }

  // ── Compute delta (always, even if blocked — needed in metadata) ──────────
  const deltaQtyGrams = (request.receivedQtyGrams - request.orderedQtyGrams) as Grams;
  const deltaPercent =
    request.orderedQtyGrams > 0
      ? Math.round((Math.abs(deltaQtyGrams) / request.orderedQtyGrams) * 10000) / 100
      : 0;

  return {
    allowed:         allBlocked.length === 0,
    blockedReasons:  [...new Set(allBlocked)] as BlockedReason[],
    warnings:        [...new Set(allWarnings)] as BlockedReason[],
    deltaQtyGrams,
    deltaPercent,
  };
}

// ─── Receiving write payloads ─────────────────────────────────────────────────

/** All data objects that will be written in the transaction */
export interface ReceivingWritePayloads {
  /** Written to receiving_locks/{purchaseOrderId}_{receivingToken} */
  receivingLock: {
    lockId: string;
    tenantId: TenantId;
    purchaseOrderId: string;
    receivingToken: string;
    requestId: string;
    createdAt: Date;
    expiresAt: Date;
    /** CONSUMED immediately — this transaction IS the successful receive */
    status: 'CONSUMED';
  };
  /** Written to inventory/{ingredientId}/transactions/{autoId} */
  inventoryTransaction: {
    type: 'restock';
    /** Received quantity in kg — existing schema unit */
    quantity: number;
    receivedQtyGrams: Grams;
    orderedQtyGrams: Grams;
    deltaQtyGrams: Grams;
    referenceId: string;
    reason: string;
    performedBy: string;
    purchaseOrderId: string;
    auditTrailId: AuditTrailId;
    receivingToken: string;
    requestId: string;
    tenantId: TenantId;
  };
  /** Increment value (kg) for inventory.currentStock */
  inventoryIncrementKg: number;
  /** Written to purchaseOrders/{id} (update) */
  purchaseOrderUpdate: {
    status: 'RECEIVED';
    receivedAt: Date;
    receivedByHumanUserId: string;
    receivingToken: string;
    requestId: string;
    inventoryTransactionId: string;
    aiReceivingMetadata: {
      orderedQtyGrams: Grams;
      receivedQtyGrams: Grams;
      deltaQtyGrams: Grams;
      deltaPercent: number;
      receivingNote?: string;
      auditTrailId: AuditTrailId;
    };
  };
  /** Written to ai_performance_metrics/{metricId} — NEVER to performanceLogs */
  aiPerformanceMetric: {
    metricId: string;
    tenantId: TenantId;
    purchaseOrderId: string;
    suggestionId?: SuggestionId;
    sourceSnapshotId?: SnapshotId;
    auditTrailId: AuditTrailId;
    orderedQtyGrams: Grams;
    receivedQtyGrams: Grams;
    deltaQtyGrams: Grams;
    deltaPercent: number;
    reason?: string;
    createdAt: Date;
    createdBy: 'system';
    /** Invariant: AI cannot adjust its own rules based on this metric */
    aiCanMutateRules: false;
  };
  auditEvent: AuditEvent;
}

function generateMetricId(): string {
  return `metric_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Builds all write payload objects for the receiving transaction.
 * Pure function — no Firestore calls.
 *
 * @param opts.inventoryTransactionId  ID from the pre-generated ref (set before tx)
 */
export function buildReceivingWritePayloads(opts: {
  request: ReceivingConfirmationRequest;
  inventoryTransactionId: string;
  deltaQtyGrams: Grams;
  deltaPercent: number;
  suggestionId?: SuggestionId;
  sourceSnapshotId?: SnapshotId;
  now: Date;
}): ReceivingWritePayloads {
  const {
    request, inventoryTransactionId, deltaQtyGrams, deltaPercent,
    suggestionId, sourceSnapshotId, now,
  } = opts;

  const receivedQtyKg = request.receivedQtyGrams / GRAMS_PER_KG;

  // Idempotency lock — CONSUMED immediately because this IS the successful receive.
  // Retention TTL = 30 minutes (see RECEIVING_CONSUMED_LOCK_RETENTION_MS).
  const receivingLock = {
    lockId:          inventoryTransactionId,
    tenantId:        request.tenantId,
    purchaseOrderId: request.purchaseOrderId,
    receivingToken:  request.receivingToken,
    requestId:       request.requestId,
    createdAt:       now,
    expiresAt:       new Date(now.getTime() + RECEIVING_CONSUMED_LOCK_RETENTION_MS),
    status:          'CONSUMED' as const,
  };

  const inventoryTransaction = {
    type:              'restock'  as const,
    quantity:          receivedQtyKg,
    receivedQtyGrams:  request.receivedQtyGrams,
    orderedQtyGrams:   request.orderedQtyGrams,
    deltaQtyGrams,
    referenceId:       request.purchaseOrderId,
    reason:            `AI-sourced purchase order received (token: ${request.receivingToken})`,
    performedBy:       request.humanReceiverId,
    purchaseOrderId:   request.purchaseOrderId,
    auditTrailId:      request.auditTrailId,
    receivingToken:    request.receivingToken,
    requestId:         request.requestId,
    tenantId:          request.tenantId,
  };

  const purchaseOrderUpdate = {
    status:                  'RECEIVED' as const,
    receivedAt:              now,
    receivedByHumanUserId:   request.humanReceiverId,
    receivingToken:          request.receivingToken,
    requestId:               request.requestId,
    inventoryTransactionId,
    aiReceivingMetadata: {
      orderedQtyGrams:   request.orderedQtyGrams,
      receivedQtyGrams:  request.receivedQtyGrams,
      deltaQtyGrams,
      deltaPercent,
      receivingNote:     request.receivingNote,
      auditTrailId:      request.auditTrailId,
    },
  };

  const metricId = generateMetricId();
  const aiPerformanceMetric = {
    metricId,
    tenantId:          request.tenantId,
    purchaseOrderId:   request.purchaseOrderId,
    suggestionId,
    sourceSnapshotId,
    auditTrailId:      request.auditTrailId,
    orderedQtyGrams:   request.orderedQtyGrams,
    receivedQtyGrams:  request.receivedQtyGrams,
    deltaQtyGrams,
    deltaPercent,
    reason:            request.receivingNote,
    createdAt:         now,
    createdBy:         'system'  as const,
    aiCanMutateRules:  false     as const,
  };

  const auditEvent = createAuditEvent({
    eventType:    'PURCHASE_ORDER_RECEIVED',
    actorType:    'human',
    actorId:      request.humanReceiverId,
    at:           now,
    fromState:    'PENDING',
    toState:      'RECEIVED',
    eventVersion: 1,
    metadata: {
      purchaseOrderId:        request.purchaseOrderId,
      inventoryTransactionId,
      auditTrailId:           request.auditTrailId,
      humanReceiverId:        request.humanReceiverId,
      orderedQtyGrams:        request.orderedQtyGrams,
      receivedQtyGrams:       request.receivedQtyGrams,
      deltaQtyGrams,
      deltaPercent,
      receivingToken:         request.receivingToken,
      requestId:              request.requestId,
      // Invariant evidence in audit record
      aiCanMutateRules:       false,
      performanceLogsWritten: false,
    },
  });

  return {
    receivingLock,
    inventoryTransaction,
    inventoryIncrementKg: receivedQtyKg,
    purchaseOrderUpdate,
    aiPerformanceMetric,
    auditEvent,
  };
}

// ─── Blocked audit event builder ──────────────────────────────────────────────

export function buildBlockedReceivingAuditEvent(
  request: ReceivingConfirmationRequest,
  blockedReasons: BlockedReason[],
  now: Date,
): AuditEvent {
  return createAuditEvent({
    eventType:    'RECEIVING_BLOCKED',
    actorType:    request.callerType,
    actorId:      request.humanReceiverId || 'unknown',
    at:           now,
    toState:      'BLOCKED',
    eventVersion: 1,
    metadata: {
      purchaseOrderId: request.purchaseOrderId,
      auditTrailId:    request.auditTrailId,
      humanReceiverId: request.humanReceiverId,
      requestId:       request.requestId,
      receivingToken:  request.receivingToken,
      blockedReasons,
    },
  });
}

// ─── Main transaction ─────────────────────────────────────────────────────────

/**
 * Executes the full PENDING → RECEIVED receiving transaction.
 *
 * STRUCTURE GUARANTEE:
 * All six writes happen inside the same runTransaction callback:
 *   1. Create receiving lock (CONSUMED)
 *   2. Create inventoryTransaction record
 *   3. Increment inventory.currentStock (atomic increment)
 *   4. Update purchaseOrder.status = RECEIVED
 *   5. Append audit event
 *   6. Create ai_performance_metrics
 *
 * No writes to performanceLogs / finalizedPerformanceLogs / operationalReports.
 *
 * On validation failure the transaction throws, causing Firestore to roll back
 * all writes — none of the six writes can partially succeed.
 */
export async function receivePurchaseOrderWithTransaction(
  input: ReceivingTransactionInput,
): Promise<ReceivingTransactionResult> {
  const {
    request, db,
    purchaseOrderRef, inventoryRef, receivingLockRef,
    inventoryTransactionRef, auditTrailRef, aiPerformanceMetricRef,
    now, suggestionId, sourceSnapshotId,
  } = input;

  // Pre-flight AI guard — fail fast before opening a transaction
  if (request.callerType !== 'human') {
    const blockedReasons: BlockedReason[] = [
      'AI_RECEIVING_FORBIDDEN',
      'AI_INVENTORY_UPDATE_FORBIDDEN',
    ];
    return { success: false, blockedReasons, warnings: [] };
  }

  const inventoryTransactionId = inventoryTransactionRef.id;

  try {
    let resultAuditEvent: AuditEvent | undefined;

    await runTransaction(db, async (tx) => {
      // ── READS — all reads must precede writes in Firestore transactions ────

      const [poSnap, inventorySnap, lockSnap] = await Promise.all([
        tx.get(purchaseOrderRef),
        tx.get(inventoryRef),
        tx.get(receivingLockRef),
      ]);

      const poData: POSnapshotData | null = poSnap.exists()
        ? (poSnap.data() as POSnapshotData)
        : null;
      const inventoryData: InventorySnapshotData = inventorySnap.exists()
        ? (inventorySnap.data() as InventorySnapshotData)
        : {};
      const lockData: LockSnapshotData | null = lockSnap.exists()
        ? (lockSnap.data() as LockSnapshotData)
        : null;

      // ── VALIDATE ───────────────────────────────────────────────────────────

      const validation = validateReceivingBeforeWrite({ request, poData, lockData, now });

      if (!validation.allowed) {
        // Throwing inside runTransaction causes Firestore to abort all writes
        const err = Object.assign(new Error(
          `[receivingTransactionService] blocked: ${validation.blockedReasons.join(', ')}`,
        ), {
          blockedReasons: validation.blockedReasons,
          warnings:       validation.warnings,
        });
        throw err;
      }

      // ── BUILD PAYLOADS ─────────────────────────────────────────────────────

      const payloads = buildReceivingWritePayloads({
        request,
        inventoryTransactionId,
        deltaQtyGrams:   validation.deltaQtyGrams,
        deltaPercent:    validation.deltaPercent,
        suggestionId,
        sourceSnapshotId,
        now,
      });

      resultAuditEvent = payloads.auditEvent;

      // Stock metadata for inventoryTransaction record
      const currentStockKg = inventoryData.currentStock ?? 0;
      const currentStockBeforeGrams = Math.round(currentStockKg * GRAMS_PER_KG);
      const currentStockAfterGrams  = currentStockBeforeGrams + request.receivedQtyGrams;

      // ── WRITES — all six in the same runTransaction callback ───────────────

      // Write 1: Idempotency lock — CONSUMED; blocks any duplicate attempt
      tx.set(receivingLockRef, {
        ...payloads.receivingLock,
        createdAt: serverTimestamp(),
      });

      // Write 2: Inventory transaction record (audit + restock evidence)
      tx.set(inventoryTransactionRef, {
        ...payloads.inventoryTransaction,
        timestamp:              serverTimestamp(),
        currentStockBeforeGrams,
        currentStockAfterGrams,
      });

      // Write 3: Atomic increment on inventory.currentStock (kg) + grams field
      // increment() is Firestore's transaction-safe atomic increment operator —
      // it does NOT require a read-modify-write, so it is safe under concurrency.
      tx.update(inventoryRef, {
        currentStock:      increment(payloads.inventoryIncrementKg),
        currentStockGrams: increment(request.receivedQtyGrams),
        lastUpdated:       serverTimestamp(),
      });

      // Write 4: purchaseOrder.status = RECEIVED
      tx.update(purchaseOrderRef, {
        ...payloads.purchaseOrderUpdate,
        receivedAt: serverTimestamp(),
      });

      // Write 5: Audit event appended to the AI audit trail
      tx.set(auditTrailRef, {
        ...payloads.auditEvent,
        at: serverTimestamp(),
      });

      // Write 6: AI performance metric — isolated collection, NOT performanceLogs
      // performanceLogs / finalizedPerformanceLogs / operationalReports are NEVER
      // written here (Feature 002 hard rule §十一).
      tx.set(aiPerformanceMetricRef, {
        ...payloads.aiPerformanceMetric,
        createdAt: serverTimestamp(),
      });
    });

    return {
      success:              true,
      inventoryTransactionId,
      auditEvent:           resultAuditEvent,
      blockedReasons:       [],
      warnings:             [],
    };

  } catch (err: unknown) {
    const typedErr = err as Error & {
      blockedReasons?: BlockedReason[];
      warnings?: BlockedReason[];
    };
    return {
      success:       false,
      blockedReasons: typedErr.blockedReasons ?? ['INVENTORY_TRANSACTION_FAILED'],
      warnings:       typedErr.warnings       ?? [],
    };
  }
}
