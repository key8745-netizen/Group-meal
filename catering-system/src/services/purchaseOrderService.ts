import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import { restockIngredient } from './inventoryService';
import { logOrderFulfillment } from './performanceService';
import { configService } from './configService';
import { invalidateSnapshotCache } from './aiContextService';
import { resolveReceivedQuantities } from './receivedQuantityPlanner';
import { createReceiptBatch } from './inventoryBatchService';
import type { IngredientMaster } from './types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PurchaseOrderStatus = 'DRAFT' | 'PENDING' | 'RECEIVED' | 'CANCELLED';

/** Subset of FeasibilityItem that createOrder needs */
export interface PurchaseOrderItem {
  ingredientId:  string;
  name:          string;
  /** Quantity to purchase in kg (AI-suggested or manually entered) */
  purchaseQtyKg: number;
  /** purchaseQtyKg converted to 台斤 for display */
  purchaseTaijin: number;
  /** Original AI-recommended qty (kg). Set by createDraftOrder; null for manual orders. */
  recommendedQtyKg?: number | null;
}

/** AI confidence metadata stored on DRAFT purchase orders for audit */
export interface DraftOrderMeta {
  /** true when created by the AI suggestion engine */
  aiGenerated: boolean;
  /** Worst (lowest) confidence level across all line items */
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  /** Per-item confidence reasons for human review */
  confidenceReasons: string[];
}

export interface PurchaseOrder {
  id?:         string;
  status:      PurchaseOrderStatus;
  items:       PurchaseOrderItem[];
  createdAt:   Timestamp;
  receivedAt?: Timestamp;
  notes?:      string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentUser(): string {
  return auth.currentUser?.email ?? auth.currentUser?.uid ?? 'system';
}

async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const snap = await getDoc(doc(db, 'purchaseOrders', id));
  if (!snap.exists()) {
    throw new Error(`purchaseOrderService: order "${id}" not found`);
  }
  return { id: snap.id, ...snap.data() } as PurchaseOrder;
}

// ─── purchaseOrderService ─────────────────────────────────────────────────────

export const purchaseOrderService = {

  /**
   * Persists a new purchase order from the shortage items produced by
   * ProductionPlanner / checkInventoryFeasibility.
   *
   * Only items where purchaseQtyKg > 0 are written (defensive filter so callers
   * can pass the full FeasibilityItem list without pre-filtering).
   *
   * Manual orders have no AI baseline — recommendedQtyKg is not stamped here.
   * Use createDraftOrder() for AI-suggested orders that require variance tracking.
   *
   * @returns The Firestore document ID of the new order.
   */
  async createOrder(shortageItems: PurchaseOrderItem[]): Promise<string> {
    const items = shortageItems.filter((i) => i.purchaseQtyKg > 0);

    if (items.length === 0) {
      throw new Error('purchaseOrderService: no shortage items to order');
    }

    const ref = await addDoc(collection(db, 'purchaseOrders'), {
      status:    'PENDING',
      items,
      createdAt: serverTimestamp(),
    });

    return ref.id;
  },

  /**
   * Marks a purchase order as received and restocks every ingredient.
   *
   * Steps:
   *  1. Read the order from Firestore and verify it is still PENDING.
   *  2. For each item call inventoryService.restockIngredient (each runs in
   *     its own Firestore transaction so stock and audit records stay atomic).
   *  3. Update order status to RECEIVED with a receivedAt timestamp.
   *
   * If a mid-list restock fails, the successfully restocked items are NOT
   * rolled back (eventual consistency).  The order status remains PENDING so
   * staff can retry after resolving the data issue.
   *
   * Feature 061: `receivedOverridesKg` lets staff record the ACTUAL received
   * quantity per ingredient (keyed by ingredientId, in kg) when delivery
   * differs from the ordered amount. Unspecified items fall back to the ordered
   * qty; an override of 0 means "did not arrive" and is not restocked. Called
   * with no overrides the behaviour is unchanged (restock the ordered qty).
   */
  async completeOrder(
    orderId: string,
    receivedOverridesKg?: Map<string, number>,
  ): Promise<void> {
    const performedBy = currentUser();
    const orderRef = doc(db, 'purchaseOrders', orderId);

    // Atomically claim the order: PENDING → RECEIVED inside one transaction, so
    // a concurrent / double-clicked completeOrder cannot both pass the guard and
    // restock twice. The loser reads a non-PENDING status and aborts here,
    // before any stock is added. Tradeoff vs the previous "status stays PENDING
    // on failure" model: if a later per-ingredient restock fails, the order is
    // already RECEIVED and the shortfall must be reconciled manually via 庫存盤點
    // — strictly safer than silently double-restocking already-received items on
    // a retry.
    const order = await runTransaction(db as Firestore, async (t) => {
      const snap = await t.get(orderRef);
      if (!snap.exists()) {
        throw new Error(`purchaseOrderService: order "${orderId}" not found`);
      }
      const data = { id: snap.id, ...snap.data() } as PurchaseOrder;
      if (data.status !== 'PENDING') {
        throw new Error(`purchaseOrderService: order "${orderId}" is already ${data.status}`);
      }
      t.update(orderRef, { status: 'RECEIVED', receivedAt: serverTimestamp() });
      return data;
    });

    const resolved = resolveReceivedQuantities(order.items, receivedOverridesKg);

    // Restock each ingredient sequentially so failures are easy to diagnose.
    // Items with receivedKg === 0 (did not arrive) are skipped.
    for (const line of resolved) {
      if (!(line.receivedKg > 0)) continue;
      await restockIngredient(
        db as Firestore,
        line.ingredientId,
        line.name,
        line.receivedKg,
        orderId,
        performedBy,
      );
    }

    // Status was already flipped to RECEIVED in the atomic claim above.

    // Feature 071 (Phase 2b, 並存): 收貨額外建立批次供保鮮追蹤。best-effort——
    // 批次建立失敗絕不可影響既有收貨/入庫（currentStock 仍由 restock 維護）。
    for (const line of resolved) {
      if (!(line.receivedKg > 0)) continue;
      try {
        const ingSnap = await getDoc(doc(db, 'ingredients', line.ingredientId));
        if (ingSnap.exists()) {
          await createReceiptBatch(
            db as Firestore,
            { id: ingSnap.id, ...ingSnap.data() } as IngredientMaster,
            line.receivedKg,
          );
        }
      } catch {
        // 並存期批次為附加資料，靜默略過，不阻斷收貨
      }
    }

    // Snapshot cache is stale after a RECEIVED — next AI suggestion must re-read
    // purchase history.  tenantId is unavailable here; clear all tenant caches.
    invalidateSnapshotCache();

    // Fire-and-forget: log fulfillment data for performance tracking.
    // Never awaited — must not block the UI or fail the completeOrder call.
    // Logs the ACTUAL received qty (incl. 0) so fulfillment data is honest.
    logOrderFulfillment(
      db as Firestore,
      orderId,
      resolved.map((line) => ({
        ingredientId:             line.ingredientId,
        ingredientName:           line.name,
        purchasedQtyKg:           line.receivedKg,
        originalRecommendedQtyKg:
          order.items.find((i) => i.ingredientId === line.ingredientId)?.recommendedQtyKg ?? null,
      })),
    );
  },

  /**
   * Persists a new DRAFT purchase order from AI-generated shortage items.
   * DRAFT orders are pending human review before becoming PENDING.
   *
   * Hard rule: items where meta.confidenceLevel === 'BLOCKED' are excluded;
   * if ALL items are BLOCKED the call throws rather than writing an empty order.
   *
   * @returns The Firestore document ID of the new order.
   */
  async createDraftOrder(
    shortageItems: PurchaseOrderItem[],
    notes = 'AI 智能建議自動產生',
    meta?: DraftOrderMeta,
  ): Promise<string> {
    // Stamp recommendedQtyKg = purchaseQtyKg at creation time so variance can
    // be computed later even if staff edits the qty before receiving.
    const items = shortageItems
      .filter((i) => i.purchaseQtyKg > 0)
      .map((i) => ({ ...i, recommendedQtyKg: i.recommendedQtyKg ?? i.purchaseQtyKg }));

    if (items.length === 0) {
      throw new Error('purchaseOrderService: no shortage items to order');
    }

    const orderRef = doc(collection(db, 'purchaseOrders'));

    await runTransaction(db, async (t) => {
      t.set(orderRef, {
        status: 'DRAFT',
        items,
        notes,
        createdAt: serverTimestamp(),
        // AI metadata — recorded for audit trail per AI_DECISION_BOUNDARY.md
        ...(meta && {
          aiGenerated:       meta.aiGenerated,
          confidenceLevel:   meta.confidenceLevel,
          confidenceReasons: meta.confidenceReasons,
        }),
      });
    });

    return orderRef.id;
  },

  /**
   * Cancels a PENDING order without touching inventory.
   */
  async cancelOrder(orderId: string): Promise<void> {
    const order = await getPurchaseOrder(orderId);

    if (order.status !== 'PENDING') {
      throw new Error(
        `purchaseOrderService: cannot cancel — order "${orderId}" is ${order.status}`,
      );
    }

    await updateDoc(doc(db, 'purchaseOrders', orderId), {
      status: 'CANCELLED',
    });
  },

  /**
   * The ONLY authorised path for DRAFT → PENDING transition.
   *
   * Guard rails enforced here:
   *  1. Order must be in DRAFT status.
   *  2. When aiGenerated is true and requireHumanApproval is enabled in settings,
   *     the caller's identity is stamped as the approver — this makes the human
   *     action explicit and auditable.
   *  3. After transition, the AI context snapshot cache is invalidated so the
   *     next suggestion reflects current state.
   *
   * Never call updateDoc({ status: 'PENDING' }) directly — always use this method.
   *
   * @param orderId   Firestore document ID in purchaseOrders collection
   * @param tenantId  Used to check requireHumanApproval setting
   */
  /**
   * DRAFT-only helper for AI-origin purchase orders (Phase 6).
   *
   * Converts a human-approved PurchaseOrderDraftInput into a Firestore
   * purchaseOrders document with status === 'DRAFT'.
   *
   * HARD RULES:
   *  - Input must have status === 'DRAFT' (validated by validatePurchaseOrderDraftInput)
   *  - approvedByHumanUserId must be present
   *  - aiMetadata.aiCanSubmit must be false
   *  - aiMetadata.requiresFinalSubmission must be true
   *  - Does NOT modify inventory
   *  - Does NOT transition to PENDING or RECEIVED
   *
   * @throws Error when input validation fails (never silently ignores)
   */
  async createDraftPurchaseOrderFromApprovedSuggestion(
    input: import('./aiHumanApprovalService').PurchaseOrderDraftInput,
  ): Promise<string> {
    const { validatePurchaseOrderDraftInput } = await import('./aiHumanApprovalService');
    const validationErrors = validatePurchaseOrderDraftInput(input);
    if (validationErrors.length > 0) {
      throw new Error(
        `purchaseOrderService.createDraftPurchaseOrderFromApprovedSuggestion: ` +
        `validation failed: ${validationErrors.join(', ')}`,
      );
    }

    // Convert grams to kg for storage (existing PurchaseOrder schema uses kg)
    const purchaseQtyKg = input.approvedQtyGrams / 1000;

    const orderRef = doc(collection(db, 'purchaseOrders'));

    await runTransaction(db, async (t) => {
      t.set(orderRef, {
        status:        'DRAFT',
        items: [{
          ingredientId:       input.ingredientId,
          name:               input.ingredientName ?? input.ingredientId,
          purchaseQtyKg,
          purchaseTaijin:     Math.round((purchaseQtyKg / 0.6) * 100) / 100,
          recommendedQtyKg:   purchaseQtyKg,
        }],
        notes:         input.notes,
        createdAt:     serverTimestamp(),
        // Full AI audit chain — stamped for human review
        aiGenerated:         true,
        aiCanSubmit:         false,
        requiresFinalSubmission: true,
        aiMetadata:    input.aiMetadata,
      });
    });

    return orderRef.id;
  },

  /**
   * Human-only DRAFT→PENDING transition for AI-origin purchase orders (Phase 7).
   *
   * HARD RULES:
   *  - Only transitions DRAFT → PENDING (validated by validatePurchaseOrderPendingInput)
   *  - submittedByHumanUserId must be present
   *  - aiPendingMetadata.aiCanSubmit must be false
   *  - Does NOT modify inventory
   *  - Does NOT transition to RECEIVED
   *  - Does NOT call inventoryService
   *
   * @throws Error when input validation fails
   */
  async submitAIDraftPurchaseOrderToPending(
    input: import('./aiHumanSubmitService').PurchaseOrderPendingInput,
  ): Promise<void> {
    const { validatePurchaseOrderPendingInput } = await import('./aiHumanSubmitService');
    const validationErrors = validatePurchaseOrderPendingInput(input);
    if (validationErrors.length > 0) {
      throw new Error(
        `purchaseOrderService.submitAIDraftPurchaseOrderToPending: ` +
        `validation failed: ${validationErrors.join(', ')}`,
      );
    }

    const order = await getPurchaseOrder(input.purchaseOrderId);
    if (order.status !== 'DRAFT') {
      throw new Error(
        `purchaseOrderService.submitAIDraftPurchaseOrderToPending: ` +
        `order "${input.purchaseOrderId}" is ${order.status}, expected DRAFT`,
      );
    }

    await updateDoc(doc(db, 'purchaseOrders', input.purchaseOrderId), {
      status:                 'PENDING',
      submittedBy:            input.submittedByHumanUserId,
      submittedAt:            serverTimestamp(),
      submitNote:             input.submitNote ?? null,
      // Extended AI audit chain — receiving confirmation still required
      aiPendingMetadata:      input.aiPendingMetadata,
      requiresReceivingConfirmation: true,
      aiCanReceive:           false,
    });

    // Invalidate AI snapshot so next suggestion reflects submitted state
    if (input.aiPendingMetadata.tenantId) {
      invalidateSnapshotCache(input.aiPendingMetadata.tenantId);
    }
  },

  /**
   * Human-only PENDING → RECEIVED transition for AI-sourced purchase orders (Phase 2).
   *
   * HARD RULES:
   *  - callerType must be 'human' — AI callers are blocked before the transaction opens
   *  - All six writes (lock, inventoryTransaction, inventory, PO status, audit, metric)
   *    execute inside ONE Firestore runTransaction callback
   *  - Duplicate receiving is blocked via idempotency lock
   *  - Does NOT write performanceLogs / finalizedPerformanceLogs / operationalReports
   *  - inventoryService.restockIngredient() is NOT called — increment() is used directly
   *
   * @param purchaseOrderId  The PENDING purchase order to receive
   * @param ingredientId     The single ingredient on this AI-sourced order
   * @param request          Human-supplied receiving confirmation
   */
  async receiveAISourcedPurchaseOrder(
    purchaseOrderId: string,
    ingredientId: string,
    request: import('./receivingTransactionService').ReceivingTransactionInput['request'],
  ): Promise<import('./receivingTransactionService').ReceivingTransactionResult> {
    const {
      receivePurchaseOrderWithTransaction,
    } = await import('./receivingTransactionService');

    const { collection: fsCollection } = await import('firebase/firestore');

    const purchaseOrderRef = doc(db, 'purchaseOrders', purchaseOrderId);
    const inventoryRef     = doc(db, 'inventory', ingredientId);
    const receivingLockRef = doc(
      db, 'receiving_locks', `${purchaseOrderId}_${request.receivingToken}`,
    );
    const inventoryTransactionRef = doc(
      fsCollection(db, 'inventory', ingredientId, 'transactions'),
    );
    const auditTrailRef = doc(
      fsCollection(db, 'ai_audit_trails', request.auditTrailId, 'events'),
    );
    const aiPerformanceMetricRef = doc(
      fsCollection(db, 'ai_performance_metrics'),
    );

    const result = await receivePurchaseOrderWithTransaction({
      request,
      db:                      db as import('firebase/firestore').Firestore,
      purchaseOrderRef,
      inventoryRef,
      receivingLockRef,
      inventoryTransactionRef,
      auditTrailRef,
      aiPerformanceMetricRef,
      now: new Date(),
    });

    if (result.success) {
      // Invalidate AI snapshot so next suggestion reflects current stock
      invalidateSnapshotCache(request.tenantId);
    }

    return result;
  },

  async approveDraftOrder(orderId: string, tenantId: string): Promise<void> {
    const order = await getPurchaseOrder(orderId);

    if (order.status !== 'DRAFT') {
      throw new Error(
        `purchaseOrderService: cannot approve — order "${orderId}" is ${order.status}, expected DRAFT`,
      );
    }

    const settings = await configService.getSettings(tenantId).catch(() => null);
    const requireApproval = settings?.aiAutomation.requireHumanApproval ?? true;

    const approvedBy = currentUser();
    if (requireApproval && approvedBy === 'system') {
      throw new Error(
        'purchaseOrderService: requireHumanApproval is enabled — ' +
        'approveDraftOrder must be called by an authenticated user, not by an automated system',
      );
    }

    await updateDoc(doc(db, 'purchaseOrders', orderId), {
      status:     'PENDING',
      approvedBy,
      approvedAt: serverTimestamp(),
    });

    // Invalidate AI snapshot so next suggestion reflects the approved state
    invalidateSnapshotCache(tenantId);
  },
};
