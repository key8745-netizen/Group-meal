import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import type { Ingredient, Menu } from './types';
import { UnitConverter } from './unitConverter';
import { calculateOrderRequirements } from './orderService';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ─── Return types ─────────────────────────────────────────────────────────────

export interface MenuProfitability {
  menuId: string;
  menuName: string;
  sellingPrice: number;
  /** Total ingredient cost per serving (waste-adjusted, in NT$) */
  ingredientCost: number;
  grossProfit: number;
  /** Gross margin as a decimal (0–1). E.g. 0.4 = 40 % */
  profitMargin: number;
  /** True when one or more BOM ingredients have no unitCost or are missing */
  hasIncompleteData: boolean;
  missingIngredients: string[];
}

export interface PeriodPerformance {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  /** Gross margin as a decimal (0–1) */
  profitMargin: number;
  orderCount: number;
  /** True when any ingredient's unitCost was absent — cost figure is understated */
  hasIncompleteData: boolean;
  /** Names of ingredients whose unitCost was absent (empty when hasIncompleteData is false) */
  missingIngredientNames: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a BOM quantity (in bom.unit, waste-adjusted) to the ingredient's
 * native unit, then multiplies by unitCost.
 *
 * Both sides normalise through toKg so mixed units (g / 台斤 / piece) work
 * without an explicit cross-unit lookup table.
 */
function bomLineCost(
  quantity: number,
  bomUnit: string,
  wasteFactor: number,
  ingredient: Ingredient,
): number {
  const adjustedQty = wasteFactor > 0 && wasteFactor < 1
    ? quantity / (1 - wasteFactor)
    : quantity;

  const adjustedKg      = UnitConverter.toKg(adjustedQty, bomUnit);
  const ingredientUnitKg = UnitConverter.toKg(1, ingredient.unit);

  return r3((adjustedKg / ingredientUnitKg) * ingredient.unitCost);
}

// ─── getMenuProfitability ─────────────────────────────────────────────────────

/**
 * Calculates the standard (theoretical) gross profit for a single menu item.
 *
 * Ingredient cost is derived from the menu BOM: each line's quantity is
 * waste-adjusted, unit-converted, and priced at the ingredient's current
 * unitCost. If an ingredient is missing or has no cost data it is treated as
 * zero and the result is flagged with hasIncompleteData.
 */
export async function getMenuProfitability(
  db: Firestore,
  menuId: string,
): Promise<MenuProfitability> {
  const menuSnap = await getDoc(doc(db, 'menus', menuId));
  if (!menuSnap.exists()) {
    throw new Error(`performanceService: menu "${menuId}" not found`);
  }
  const menu = { id: menuSnap.id, ...menuSnap.data() } as Menu;

  // Batch-fetch all ingredients referenced by the BOM
  const bomIngredientIds = [...new Set(menu.ingredients.map((b) => b.ingredientId))];
  const ingredientSnaps  = await Promise.all(
    bomIngredientIds.map((id) => getDoc(doc(db, 'ingredients', id))),
  );

  const ingredientMap = new Map<string, Ingredient>();
  ingredientSnaps.forEach((snap) => {
    if (snap.exists()) {
      ingredientMap.set(snap.id, { id: snap.id, ...snap.data() } as Ingredient);
    }
  });

  // Accumulate per-serving ingredient cost
  let ingredientCost    = 0;
  const missingIngredients: string[] = [];

  for (const bom of menu.ingredients) {
    const ingredient = ingredientMap.get(bom.ingredientId);

    if (!ingredient || ingredient.unitCost == null) {
      missingIngredients.push(bom.ingredientName);
      continue; // treat as 0 — cost will be understated
    }

    ingredientCost += bomLineCost(bom.quantity, bom.unit, bom.wasteFactor, ingredient);
  }

  ingredientCost    = r3(ingredientCost);
  const grossProfit  = r3(menu.unitPrice - ingredientCost);
  const profitMargin = menu.unitPrice > 0 ? r3(grossProfit / menu.unitPrice) : 0;

  return {
    menuId,
    menuName: menu.name,
    sellingPrice: menu.unitPrice,
    ingredientCost,
    grossProfit,
    profitMargin,
    hasIncompleteData: missingIngredients.length > 0,
    missingIngredients,
  };
}

// ─── getPeriodPerformance ─────────────────────────────────────────────────────

/**
 * Summarises gross profit for all non-cancelled orders whose orderDate falls
 * within [startDate, endDate] (inclusive).
 *
 * Revenue  = sum of order.totalAmount
 * Cost     = BOM-expanded ingredient consumption × unitCost for each ingredient
 *            (waste factors applied via calculateOrderRequirements)
 *
 * If any ingredient's unitCost is absent the cost figure is understated and
 * hasIncompleteData is set to true.
 */
export async function getPeriodPerformance(
  db: Firestore,
  startDate: Date,
  endDate: Date,
): Promise<PeriodPerformance> {
  const empty: PeriodPerformance = {
    totalRevenue: 0,
    totalCost: 0,
    grossProfit: 0,
    profitMargin: 0,
    orderCount: 0,
    hasIncompleteData: false,
    missingIngredientNames: [],
  };

  // Firestore range query on orderDate; cancelled orders are filtered in memory
  // to avoid requiring a composite index.
  const q = query(
    collection(db, 'orders'),
    where('orderDate', '>=', Timestamp.fromDate(startDate)),
    where('orderDate', '<=', Timestamp.fromDate(endDate)),
  );

  const snaps  = await getDocs(q);
  const orders = snaps.docs
    .map((d) => d.data())
    .filter((o) => o.status !== 'cancelled');

  if (orders.length === 0) return empty;

  // ── Revenue ──────────────────────────────────────────────────────────────
  const totalRevenue = r3(orders.reduce((sum, o) => sum + (o.totalAmount as number), 0));

  // ── Cost: BOM-expand all order items → ingredient requirements ────────────
  const allItems = orders.flatMap((o) => o.items);

  // calculateOrderRequirements returns Map<ingredientId, { totalQuantityKg }>
  // with waste factors already applied.
  const requirements = await calculateOrderRequirements(db, allItems);

  // Batch-fetch ingredient master data for cost lookup
  const ingredientIds    = Array.from(requirements.keys());
  const ingredientSnaps  = await Promise.all(
    ingredientIds.map((id) => getDoc(doc(db, 'ingredients', id))),
  );

  const ingredientMap = new Map<string, Ingredient>();
  ingredientSnaps.forEach((snap) => {
    if (snap.exists()) {
      ingredientMap.set(snap.id, { id: snap.id, ...snap.data() } as Ingredient);
    }
  });

  let totalCost             = 0;
  let hasIncompleteData     = false;
  const missingIngredientNames: string[] = [];

  for (const [id, req] of requirements) {
    const ingredient = ingredientMap.get(id);

    if (!ingredient || ingredient.unitCost == null) {
      hasIncompleteData = true;
      missingIngredientNames.push(req.ingredientName);
      continue; // count as 0 — flagged above
    }

    // req.totalQuantityKg is already waste-adjusted and normalised to kg.
    // Divide by the ingredient's own unit-in-kg to get back to its native unit
    // before applying unitCost.
    const ingredientUnitKg = UnitConverter.toKg(1, ingredient.unit);
    totalCost += r3((req.totalQuantityKg / ingredientUnitKg) * ingredient.unitCost);
  }

  totalCost = r3(totalCost);
  const grossProfit  = r3(totalRevenue - totalCost);
  const profitMargin = totalRevenue > 0 ? r3(grossProfit / totalRevenue) : 0;

  return {
    totalRevenue,
    totalCost,
    grossProfit,
    profitMargin,
    orderCount: orders.length,
    hasIncompleteData,
    missingIngredientNames,
  };
}
