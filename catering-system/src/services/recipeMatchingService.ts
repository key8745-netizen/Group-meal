/**
 * recipeMatchingService.ts
 *
 * Calculates per-ingredient requirements for a recipe and checks whether
 * current inventory is sufficient to fulfil a given headcount.
 *
 * Firestore layout assumed:
 *   menus/{recipeId}            — recipe document (BOM via Menu.ingredients[])
 *   ingredients/{ingredientId}  — master data including wasteFactor
 *   inventory/{ingredientId}    — live stock (InventoryDoc.currentStock in kg)
 *
 * The wasteFactor read from `ingredients` takes precedence over the value
 * embedded in the BOM, allowing kitchen staff to tune waste rates centrally
 * without editing every recipe.
 *
 * Waste formula (per user spec):
 *   requiredKg = (qtyPerServingKg × headCount) × (1 + wasteFactor)
 *
 * Note: the existing orderService uses the mathematically equivalent gross-up
 * formula `qty / (1 − wasteFactor)`.  This service uses the additive form
 * requested by the product spec.
 */

import { doc, getDoc, type Firestore } from 'firebase/firestore';
import type { Ingredient, InventoryDoc, Menu } from './types';
import { UnitConverter } from './unitConverter';
import { toTaijin } from '@/utils/unitConverter';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ─── Return types ─────────────────────────────────────────────────────────────

export interface RequiredIngredient {
  ingredientId:   string;
  name:           string;
  requiredKg:     number;
  /** requiredKg converted to 台斤 via utils/unitConverter.toTaijin */
  requiredTaijin: number;
}

export interface FeasibilityItem {
  ingredientId:   string;
  name:           string;
  requiredKg:     number;
  currentStockKg: number;
  isShortage:     boolean;
  /** kg deficit; 0 when stock is sufficient */
  shortageKg:     number;
  /** shortageKg converted to 台斤; 0 when stock is sufficient */
  shortageTaijin: number;
}

export interface FeasibilityResult {
  /** true only when every ingredient has sufficient stock */
  isFeasible: boolean;
  items:      FeasibilityItem[];
}

// ─── calculateRequiredIngredients ─────────────────────────────────────────────

/**
 * Returns the total kg (and 台斤) of each ingredient required to produce
 * `headCount` servings of `recipeId`.
 *
 * Steps:
 *  1. Read the recipe from `menus/{recipeId}`.
 *  2. Batch-fetch ingredient master data to obtain ingredient-level wasteFactor.
 *  3. For each BOM line: convert BOM qty to kg, apply waste, multiply by headCount.
 */
export async function calculateRequiredIngredients(
  db:        Firestore,
  recipeId:  string,
  headCount: number,
): Promise<RequiredIngredient[]> {
  if (headCount <= 0) return [];

  // ── Step 1: Read recipe ──────────────────────────────────────────────────
  const menuSnap = await getDoc(doc(db, 'menus', recipeId));
  if (!menuSnap.exists()) {
    throw new Error(`recipeMatchingService: recipe "${recipeId}" not found`);
  }
  const menu = { id: menuSnap.id, ...menuSnap.data() } as Menu;

  // ── Step 2: Fetch ingredient master data (for wasteFactor) ───────────────
  const ingredientIds = [...new Set(menu.ingredients.map((b) => b.ingredientId))];

  const ingredientSnaps = await Promise.all(
    ingredientIds.map((id) => getDoc(doc(db, 'ingredients', id))),
  );

  const ingredientMap = new Map<string, Ingredient>();
  ingredientSnaps.forEach((snap) => {
    if (snap.exists()) {
      ingredientMap.set(snap.id, { id: snap.id, ...snap.data() } as Ingredient);
    }
  });

  // ── Step 3: Calculate per-ingredient requirements ────────────────────────
  return menu.ingredients.map((bom) => {
    const master = ingredientMap.get(bom.ingredientId);

    // Ingredient-level wasteFactor takes precedence; fall back to BOM value
    const wasteFactor = master?.wasteFactor ?? bom.wasteFactor;

    // Normalise BOM quantity to kg (handles g, 台斤, L, piece, kg)
    const qtyPerServingKg = UnitConverter.toKg(bom.quantity, bom.unit);

    // requiredKg = (qtyPerServing × headCount) × (1 + wasteFactor)
    const requiredKg = r3(qtyPerServingKg * headCount * (1 + wasteFactor));

    return {
      ingredientId:   bom.ingredientId,
      name:           bom.ingredientName,
      requiredKg,
      requiredTaijin: toTaijin(requiredKg),
    };
  });
}

// ─── checkInventoryFeasibility ────────────────────────────────────────────────

/**
 * Checks whether current inventory can cover the ingredients needed to produce
 * `headCount` servings of `recipeId`.
 *
 * Steps:
 *  1. Call calculateRequiredIngredients to get demand totals.
 *  2. Batch-read `inventory/{id}` for each required ingredient.
 *  3. Compare currentStock vs requiredKg and flag shortages.
 */
export async function checkInventoryFeasibility(
  db:        Firestore,
  recipeId:  string,
  headCount: number,
): Promise<FeasibilityResult> {
  const required = await calculateRequiredIngredients(db, recipeId, headCount);

  if (required.length === 0) {
    return { isFeasible: true, items: [] };
  }

  // Batch-fetch inventory docs
  const inventorySnaps = await Promise.all(
    required.map((r) => getDoc(doc(db, 'inventory', r.ingredientId))),
  );

  const items: FeasibilityItem[] = required.map((req, i) => {
    const snap           = inventorySnaps[i];
    const currentStockKg = snap.exists()
      ? (snap.data() as InventoryDoc).currentStock
      : 0;

    const shortageKg = r3(Math.max(0, req.requiredKg - currentStockKg));

    return {
      ingredientId:   req.ingredientId,
      name:           req.name,
      requiredKg:     req.requiredKg,
      currentStockKg,
      isShortage:     currentStockKg < req.requiredKg,
      shortageKg,
      shortageTaijin: toTaijin(shortageKg),
    };
  });

  return {
    isFeasible: items.every((item) => !item.isShortage),
    items,
  };
}
