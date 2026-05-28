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
  },

  /**
   * Persists a new DRAFT purchase order from AI-generated shortage items.
   * DRAFT orders are pending human review before becoming PENDING.
   *
   * @returns The Firestore document ID of the new order.
   */
  async createDraftOrder(
    shortageItems: PurchaseOrderItem[],
    notes = 'AI 智能建議自動產生',
  ): Promise<string> {
    const items = shortageItems.filter((i) => i.purchaseQtyKg > 0);

    if (items.length === 0) {
      throw new Error('purchaseOrderService: no shortage items to order');
    }

    // Use runTransaction to establish atomic write pattern.
    // Future iterations will extend this transaction to update inventory
    // and write audit records atomically.
    const orderRef = doc(collection(db, 'purchaseOrders'));

    await runTransaction(db, async (t) => {
      t.set(orderRef, {
        status: 'DRAFT',
        items,
        notes,
        createdAt: serverTimestamp(),
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
