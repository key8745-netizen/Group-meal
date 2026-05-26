import { doc, getDoc, type Firestore } from 'firebase/firestore';
import type { Menu, OrderItem, RequirementItem } from './types';
import { UnitConverter } from './unitConverter';

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
