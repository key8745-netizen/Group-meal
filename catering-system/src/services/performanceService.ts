import {
  addDoc,
  collection,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

// VITE_TENANT_ID identifies the tenant for scoped Firestore paths.
// Falls back to project ID for single-tenant deploys.
const TENANT_ID: string =
  (import.meta.env.VITE_TENANT_ID as string | undefined) ??
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ??
  'umas-booking-manager';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Order fulfillment logging ────────────────────────────────────────────────

export interface OrderFulfillmentLogItem {
  ingredientId:             string;
  ingredientName:           string;
  /** Quantity actually purchased / received (kg) */
  purchasedQtyKg:           number;
  /** Original AI-recommended qty (kg); null for manually created orders */
  originalRecommendedQtyKg: number | null;
  /** purchasedQtyKg − originalRecommendedQtyKg; null when no recommendation */
  variance:                 number | null;
}

/**
 * Appends one fulfillment log document per item to
 * `performanceLogs/{tenantId}/orderFulfillments/`.
 *
 * Fire-and-forget: returns void synchronously, never throws.
 * Errors are swallowed so Firestore latency never blocks the UI.
 */
export function logOrderFulfillment(
  db: Firestore,
  orderId: string,
  items: Array<Omit<OrderFulfillmentLogItem, 'variance'>>,
): void {
  void (async () => {
    try {
      const col = collection(db, 'performanceLogs', TENANT_ID, 'orderFulfillments');
      await Promise.all(
        items.map((item) => {
          const variance =
            item.originalRecommendedQtyKg !== null
              ? r2(item.purchasedQtyKg - item.originalRecommendedQtyKg)
              : null;
          return addDoc(col, {
            orderId,
            ingredientId:             item.ingredientId,
            ingredientName:           item.ingredientName,
            purchasedQtyKg:           item.purchasedQtyKg,
            originalRecommendedQtyKg: item.originalRecommendedQtyKg,
            variance,
            tenantId:   TENANT_ID,
            fulfilledAt: serverTimestamp(),
          });
        }),
      );
    } catch (err) {
      // Intentionally swallowed — logging must never block or crash the caller.
      // Surface in dev so issues are visible without affecting production.
      if (import.meta.env.DEV) console.warn('[performanceService] logOrderFulfillment failed:', err);
    }
  })();
}
