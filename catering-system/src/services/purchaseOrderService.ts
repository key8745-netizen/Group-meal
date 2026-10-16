import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import { restockIngredient } from './inventoryService';
import { configService } from './configService';
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

export interface PurchaseOrder {
  id?:         string;
  status:      PurchaseOrderStatus;
  items:       PurchaseOrderItem[];
  createdAt:   Timestamp;
  receivedAt?: Timestamp;
  notes?:      string;
  /**
   * Feature 107: doc id of this order's `publicOrderShares` snapshot, i.e. the
   * token in the supplier-facing `/share/<token>` URL. Absent = never shared.
   * Kept on the order so re-sharing reuses one token and revoking can find it.
   */
  shareToken?: string;
}

/**
 * Feature 107: the supplier-visible snapshot stored at
 * `publicOrderShares/{shareToken}` — deliberately the *minimum* the share page
 * renders, so a leaked link cannot expose anything else on the order.
 */
export interface PublicOrderShare {
  orderId:         string;
  status:          PurchaseOrderStatus;
  items:           PurchaseOrderItem[];
  orderCreatedAt?: Timestamp;
  sharedAt:        Timestamp;
  sharedBy:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentUser(): string {
  return auth.currentUser?.email ?? auth.currentUser?.uid ?? 'system';
}

/**
 * 128-bit URL-safe random token, used as the `publicOrderShares` doc id.
 * Unguessable by design — in this scheme knowing the token *is* the read grant
 * (see the firestore.rules comment on publicOrderShares for why the token has
 * to live in the path rather than in a document field).
 */
function generateShareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
   * Feature 107: creates (or refreshes) the public share snapshot for an order
   * and returns its token — the `<token>` in the `/share/<token>` URL handed to
   * suppliers.
   *
   * Why a snapshot collection instead of opening up `purchaseOrders`:
   * Firestore rules cannot inspect query parameters on a `get`, so a
   * `shareToken` *field* on the order could never gate an unauthenticated read.
   * Putting the token in the document path is the only formulation that works,
   * and copying just the render-visible fields means a leaked link exposes
   * strictly less than the order itself.
   *
   * Re-sharing an already-shared order reuses the existing token (so previously
   * sent links keep working) and rewrites the snapshot, which is also how a
   * stale snapshot gets refreshed after the order is edited.
   */
  async createShareLink(orderId: string): Promise<string> {
    const order = await getPurchaseOrder(orderId);
    const token = order.shareToken ?? generateShareToken();

    const snapshot: Record<string, unknown> = {
      orderId,
      status:   order.status,
      items:    order.items,
      sharedAt: serverTimestamp(),
      sharedBy: currentUser(),
    };
    // Firestore rejects undefined; only include when the order actually has it.
    if (order.createdAt) snapshot.orderCreatedAt = order.createdAt;

    await setDoc(doc(db, 'publicOrderShares', token), snapshot);

    if (order.shareToken !== token) {
      await updateDoc(doc(db, 'purchaseOrders', orderId), { shareToken: token });
    }

    return token;
  },

  /**
   * Feature 107: revokes an order's share link by deleting the public snapshot.
   * Existing `/share/<token>` URLs stop resolving immediately. No-op when the
   * order was never shared.
   */
  async revokeShareLink(orderId: string): Promise<void> {
    const order = await getPurchaseOrder(orderId);
    if (!order.shareToken) return;

    await deleteDoc(doc(db, 'publicOrderShares', order.shareToken));
    await updateDoc(doc(db, 'purchaseOrders', orderId), { shareToken: deleteField() });
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
   *
   * Never call updateDoc({ status: 'PENDING' }) directly — always use this method.
   *
   * @param orderId   Firestore document ID in purchaseOrders collection
   * @param tenantId  Used to check requireHumanApproval setting
   */
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
  },
};
