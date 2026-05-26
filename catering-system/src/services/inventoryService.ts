import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { InventoryDoc, InventoryTransaction, RequirementItem } from './types';

/** Round to 3 decimal places to avoid floating-point drift */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ─── Custom error ─────────────────────────────────────────────────────────────

export class InsufficientStockError extends Error {
  constructor(public readonly shortages: string[]) {
    super(`缺貨項目：\n${shortages.join('\n')}`);
    this.name = 'InsufficientStockError';
  }
}

// ─── deductStock ──────────────────────────────────────────────────────────────

/**
 * Atomically deducts stock for every ingredient in `requirements`.
 *
 * Inside a single Firestore transaction:
 *  1. Reads all inventory docs.
 *  2. Validates none would go below 0; throws InsufficientStockError listing
 *     every shortage (not just the first) so callers can surface them all.
 *  3. Updates currentStock on each inventory doc.
 *  4. Appends a transaction record to inventory/{id}/transactions.
 *
 * @param db           Firestore instance
 * @param requirements Output of calculateOrderRequirements
 * @param referenceId  The orderId that triggered this deduction
 * @param performedBy  Email / UID of the staff member initiating production
 */
export async function deductStock(
  db: Firestore,
  requirements: Map<string, RequirementItem>,
  referenceId: string,
  performedBy: string,
): Promise<void> {
  if (requirements.size === 0) return;

  const ingredientIds = Array.from(requirements.keys());

  // Pre-generate doc refs for the new transaction records so they can be
  // created inside the transaction via transaction.set() (addDoc is not
  // available inside runTransaction).
  const inventoryRefs = ingredientIds.map((id) => doc(db, 'inventory', id));
  const txRecordRefs = ingredientIds.map((id) =>
    doc(collection(db, 'inventory', id, 'transactions')),
  );

  await runTransaction(db, async (t) => {
    // ── 1. Read ───────────────────────────────────────────────────────────────
    const snaps = await Promise.all(inventoryRefs.map((ref) => t.get(ref)));

    // ── 2. Validate ───────────────────────────────────────────────────────────
    const shortages: string[] = [];

    snaps.forEach((snap, i) => {
      const id = ingredientIds[i];
      const req = requirements.get(id)!;

      if (!snap.exists()) {
        shortages.push(`${req.ingredientName}: 庫存資料不存在`);
        return;
      }

      const { currentStock } = snap.data() as InventoryDoc;
      if (currentStock < req.totalQuantityKg) {
        shortages.push(
          `${req.ingredientName}: 庫存不足（現有 ${currentStock.toFixed(3)} kg，` +
            `需求 ${req.totalQuantityKg.toFixed(3)} kg，` +
            `差額 ${(req.totalQuantityKg - currentStock).toFixed(3)} kg）`,
        );
      }
    });

    if (shortages.length > 0) {
      throw new InsufficientStockError(shortages);
    }

    // ── 3 & 4. Write deductions + audit records ───────────────────────────────
    snaps.forEach((snap, i) => {
      const id = ingredientIds[i];
      const req = requirements.get(id)!;
      const { currentStock } = snap.data() as InventoryDoc;

      t.update(inventoryRefs[i], {
        currentStock: r3(currentStock - req.totalQuantityKg),
        lastUpdated: serverTimestamp(),
      });

      const txRecord: Omit<InventoryTransaction, 'timestamp'> & {
        timestamp: ReturnType<typeof serverTimestamp>;
      } = {
        type: 'deduct',
        quantity: r3(-req.totalQuantityKg),
        referenceId,
        reason: '生產領料',
        performedBy,
        timestamp: serverTimestamp(),
      };

      t.set(txRecordRefs[i], txRecord);
    });
  });
}

// ─── restockIngredient ────────────────────────────────────────────────────────

/**
 * Adds stock for a single ingredient and writes an audit record.
 * Intended for use after a purchase order is marked as received.
 */
export async function restockIngredient(
  db: Firestore,
  ingredientId: string,
  ingredientName: string,
  quantityKg: number,
  referenceId: string,
  performedBy: string,
): Promise<void> {
  const inventoryRef = doc(db, 'inventory', ingredientId);
  const txRecordRef = doc(collection(db, 'inventory', ingredientId, 'transactions'));

  await runTransaction(db, async (t) => {
    const snap = await t.get(inventoryRef);

    const currentStock = snap.exists()
      ? (snap.data() as InventoryDoc).currentStock
      : 0;

    const payload = {
      ingredientId,
      ingredientName,
      currentStock: r3(currentStock + quantityKg),
      unit: 'kg',
      lastUpdated: serverTimestamp(),
    };

    snap.exists() ? t.update(inventoryRef, payload) : t.set(inventoryRef, payload);

    t.set(txRecordRef, {
      type: 'restock',
      quantity: r3(quantityKg),
      referenceId,
      reason: '採購入庫',
      performedBy,
      timestamp: serverTimestamp(),
    } satisfies Omit<InventoryTransaction, 'timestamp'> & {
      timestamp: ReturnType<typeof serverTimestamp>;
    });
  });
}
