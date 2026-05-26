import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { InventoryDoc, InventoryTransaction, Menu, Order, OrderItem, RequirementItem } from './types';
import { UnitConverter } from './unitConverter';
import { InsufficientStockError } from './inventoryService';

/** Round to 3 decimal places to avoid floating-point drift */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Expands order items into a flat ingredient-requirement map using each menu's
 * BOM, adjusted for waste.
 *
 * Formula per BOM row:
 *   adjustedQty = bom.quantity / (1 − bom.wasteFactor)
 *   totalKg     = UnitConverter.toKg(adjustedQty, bom.unit) × orderItem.quantity
 *
 * @param db        Firestore instance
 * @param orderItems Items from an Order document
 * @returns Map keyed by ingredientId → RequirementItem (all quantities in kg)
 * @throws If a menu document is missing or wasteFactor ≥ 1
 */
export async function calculateOrderRequirements(
  db: Firestore,
  orderItems: OrderItem[],
): Promise<Map<string, RequirementItem>> {
  // Deduplicate menu fetches
  const menuIds = [...new Set(orderItems.map((i) => i.menuId))];

  const menuSnaps = await Promise.all(
    menuIds.map((id) => getDoc(doc(db, 'menus', id))),
  );

  const menusById = new Map<string, Menu>();
  menuSnaps.forEach((snap) => {
    if (!snap.exists()) {
      throw new Error(`calculateOrderRequirements: menu "${snap.id}" not found`);
    }
    menusById.set(snap.id, { id: snap.id, ...snap.data() } as Menu);
  });

  const requirements = new Map<string, RequirementItem>();

  for (const orderItem of orderItems) {
    const menu = menusById.get(orderItem.menuId)!;

    for (const bom of menu.ingredients) {
      if (bom.wasteFactor >= 1) {
        throw new Error(
          `BOM row for "${bom.ingredientName}" in menu "${menu.name}" has wasteFactor ≥ 1`,
        );
      }

      const adjustedQtyPerServing = bom.quantity / (1 - bom.wasteFactor);
      const kgPerServing = UnitConverter.toKg(adjustedQtyPerServing, bom.unit);
      const totalKg = r3(kgPerServing * orderItem.quantity);

      const existing = requirements.get(bom.ingredientId);
      if (existing) {
        existing.totalQuantityKg = r3(existing.totalQuantityKg + totalKg);
      } else {
        requirements.set(bom.ingredientId, {
          ingredientId: bom.ingredientId,
          ingredientName: bom.ingredientName,
          totalQuantityKg: totalKg,
        });
      }
    }
  }

  return requirements;
}

// ─── placeOrder ───────────────────────────────────────────────────────────────

/**
 * Atomically creates an order and deducts all required ingredient stock.
 *
 * Single Firestore transaction:
 *  1. Expand order items into ingredient requirements (BOM + custom lines).
 *  2. Read every inventory doc inside the transaction.
 *  3. Validate all stock levels — collect every shortage before throwing.
 *  4. Write the new order document.
 *  5. Update currentStock on each inventory doc.
 *  6. Append a deduction audit record to inventory/{id}/transactions.
 *
 * Custom ingredient items are identified by menuId === '' and carry
 * their ingredientId + unit encoded as "custom:{id}:{unit}" in specialRequests.
 *
 * @param db           Firestore instance
 * @param orderData    Order payload (without id / server timestamps)
 * @param performedBy  Email / UID of the staff member placing the order
 * @returns            The new order document ID
 * @throws InsufficientStockError  When any ingredient is below required level
 */
export async function placeOrder(
  db: Firestore,
  orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
  performedBy: string,
): Promise<string> {

  // ── Step 1: Build ingredient requirements map ─────────────────────────────

  // Menu-based items use the BOM via calculateOrderRequirements.
  // Custom items (menuId === '') encode their data in specialRequests.
  const menuItems   = orderData.items.filter(i => i.menuId !== '');
  const customItems = orderData.items.filter(i => i.menuId === '');

  const requirements: Map<string, RequirementItem> = menuItems.length > 0
    ? await calculateOrderRequirements(db, menuItems)
    : new Map();

  for (const item of customItems) {
    // Expected format: "custom:{ingredientId}:{unit}"
    const parts = item.specialRequests?.split(':') ?? [];
    if (parts[0] !== 'custom' || !parts[1]) continue;

    const [, ingredientId, unit = 'kg'] = parts;
    const kgQty = r3(UnitConverter.toKg(item.quantity, unit));

    const existing = requirements.get(ingredientId);
    if (existing) {
      existing.totalQuantityKg = r3(existing.totalQuantityKg + kgQty);
    } else {
      requirements.set(ingredientId, {
        ingredientId,
        ingredientName: item.menuName, // ingredient name stored in menuName for custom lines
        totalQuantityKg: kgQty,
      });
    }
  }

  // ── Pre-generate doc refs (addDoc cannot be called inside a transaction) ──

  const orderRef      = doc(collection(db, 'orders'));
  const ingredientIds = Array.from(requirements.keys());
  const inventoryRefs = ingredientIds.map(id => doc(db, 'inventory', id));
  const txRecordRefs  = ingredientIds.map(id =>
    doc(collection(db, 'inventory', id, 'transactions')),
  );

  // ── Steps 2–6: Single atomic transaction ──────────────────────────────────

  await runTransaction(db, async (t) => {

    // 2. Read all inventory docs
    const snaps = await Promise.all(inventoryRefs.map(ref => t.get(ref)));

    // 3. Validate — collect all shortages before throwing
    const shortages: string[] = [];

    snaps.forEach((snap, i) => {
      const req = requirements.get(ingredientIds[i])!;
      if (!snap.exists()) {
        shortages.push(`${req.ingredientName}: 庫存資料不存在`);
        return;
      }
      const { currentStock, unit } = snap.data() as InventoryDoc;
      if (currentStock < req.totalQuantityKg) {
        shortages.push(
          `${req.ingredientName}: 庫存不足` +
          `（現有 ${currentStock.toFixed(3)} ${unit}，` +
          `需求 ${req.totalQuantityKg.toFixed(3)} ${unit}，` +
          `差額 ${(req.totalQuantityKg - currentStock).toFixed(3)} ${unit}）`,
        );
      }
    });

    if (shortages.length > 0) throw new InsufficientStockError(shortages);

    // 4. Create order document
    t.set(orderRef, {
      ...orderData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 5 & 6. Deduct stock + write audit records
    snaps.forEach((snap, i) => {
      const req = requirements.get(ingredientIds[i])!;
      const { currentStock } = snap.data() as InventoryDoc;

      t.update(inventoryRefs[i], {
        currentStock: r3(currentStock - req.totalQuantityKg),
        lastUpdated: serverTimestamp(),
      });

      t.set(txRecordRefs[i], {
        type: 'deduct',
        quantity: r3(-req.totalQuantityKg),
        referenceId: orderRef.id,
        reason: '訂單出庫',
        performedBy,
        timestamp: serverTimestamp(),
      } satisfies Omit<InventoryTransaction, 'timestamp'> & {
        timestamp: ReturnType<typeof serverTimestamp>;
      });
    });
  });

  return orderRef.id;
}
