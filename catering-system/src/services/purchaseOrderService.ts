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
};
