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
   */
  async completeOrder(orderId: string): Promise<void> {
    const order = await getPurchaseOrder(orderId);

    if (order.status !== 'PENDING') {
      throw new Error(
        `purchaseOrderService: order "${orderId}" is already ${order.status}`,
      );
    }

    const performedBy = currentUser();

    // Restock each ingredient sequentially so failures are easy to diagnose
    for (const item of order.items) {
      await restockIngredient(
        db as Firestore,
        item.ingredientId,
        item.name,
        item.purchaseQtyKg,
        orderId,
        performedBy,
      );
    }

    await updateDoc(doc(db, 'purchaseOrders', orderId), {
      status:     'RECEIVED',
      receivedAt: serverTimestamp(),
    });

    // Snapshot cache is stale after a RECEIVED — next AI suggestion must re-read
    // purchase history.  tenantId is unavailable here; clear all tenant caches.
    invalidateSnapshotCache();

    // Fire-and-forget: log fulfillment data for performance tracking.
    // Never awaited — must not block the UI or fail the completeOrder call.
    logOrderFulfillment(
      db as Firestore,
      orderId,
      order.items.map((item) => ({
        ingredientId:             item.ingredientId,
        ingredientName:           item.name,
        purchasedQtyKg:           item.purchaseQtyKg,
        originalRecommendedQtyKg: item.recommendedQtyKg ?? null,
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
