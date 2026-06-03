import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import type {
  Ingredient,
  InventoryDoc,
  Order,
  OrderItem,
  Purchase,
  PurchaseDraft,
  PurchaseLineItem,
  SupplierGroup,
} from './types';
import { calculateOrderRequirements } from './orderService';
import { UnitConverter } from './unitConverter';
import { buildAIContextSnapshot } from './aiContextService';
import { computeConfidence, buildConfidenceMaps } from './aiSuggestionConfidence';
import { configService } from './configService';

/** Round to 3 decimal places to avoid floating-point drift */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ─── ConcurrencyError ─────────────────────────────────────────────────────────

/**
 * Thrown by updatePurchaseDraft when the document's version in Firestore no
 * longer matches the caller's expected version, indicating a concurrent write.
 */
export class ConcurrencyError extends Error {
  constructor() {
    super('資料已被他人修改，請刷新頁面');
    this.name = 'ConcurrencyError';
  }
}

// ─── generatePurchaseSuggestion ───────────────────────────────────────────────

/**
 * Calculates a purchase suggestion by combining two signals:
 *   1. Safety stock: ingredients where currentStock < minStockLevel
 *   2. Order demand: BOM-expanded requirements from pending orders
 *
 * Formula per ingredient:
 *   suggestedQty = max(0, safetyLevelKg + orderDemandKg − currentStockKg)
 *
 * Each line item carries a `confidence` evaluation (HIGH/MEDIUM/LOW/BLOCKED).
 * Ingredients with suggestedQty ≤ 0 are excluded from the result.
 * Returns empty draft when `aiAutomation.purchaseSuggestionEnabled` is false.
 *
 * @param db       Firestore instance
 * @param orderIds Specific order IDs to include. When omitted, all orders
 *                 with status 'confirmed' or 'in-production' are used.
 * @param tenantId Used to load AI automation settings (kill switch + multiplier)
 */
export async function generatePurchaseSuggestion(
  db: Firestore,
  orderIds?: string[],
  tenantId?: string,
): Promise<PurchaseDraft> {
  // ── Kill switch: check AI automation settings first ───────────────────────
  if (tenantId) {
    const settings = await configService.getSettings(tenantId).catch(() => null);
    if (settings && !settings.aiAutomation.purchaseSuggestionEnabled) {
      return buildEmptyDraft();
    }
  }

  // ── Step 1: Read full inventory ───────────────────────────────────────────
  const inventorySnaps = await getDocs(collection(db, 'inventory'));

  if (inventorySnaps.empty) {
    return buildEmptyDraft();
  }

  const inventoryMap = new Map<string, InventoryDoc>();
  inventorySnaps.forEach((snap) => {
    inventoryMap.set(snap.id, snap.data() as InventoryDoc);
  });

  // ── Step 2: Ingredient master data + AI context (parallel) ───────────────
  const ingredientIds = Array.from(inventoryMap.keys());
  const [ingredientSnaps, aiContext] = await Promise.all([
    Promise.all(ingredientIds.map((id) => getDoc(doc(db, 'ingredients', id)))),
    tenantId
      ? buildAIContextSnapshot(db, tenantId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const ingredientMap = new Map<string, Ingredient>();
  ingredientSnaps.forEach((snap) => {
    if (snap.exists()) {
      ingredientMap.set(snap.id, { id: snap.id, ...snap.data() } as Ingredient);
    }
  });

  const { inventoryMap: aiInventoryMap, historyMap } = aiContext
    ? buildConfidenceMaps(aiContext.inventory, aiContext.purchaseHistory)
    : { inventoryMap: new Map(), historyMap: new Map() };

  // ── Step 3: Aggregate order demand ────────────────────────────────────────
  const { allOrderItems, resolvedOrderIds } = await collectOrderItems(db, orderIds);

  const orderDemandMap = new Map<string, number>(); // ingredientId → kg
  if (allOrderItems.length > 0) {
    // Single calculateOrderRequirements call over all items avoids duplicate
    // menu fetches that would occur if called per-order.
    const requirements = await calculateOrderRequirements(db, allOrderItems);
    requirements.forEach((item, id) => {
      orderDemandMap.set(id, item.totalQuantityKg);
    });
  }

  // ── Step 4: Build line items with confidence ──────────────────────────────
  const lineItems: PurchaseLineItem[] = [];

  for (const [id, inventory] of inventoryMap) {
    const ingredient = ingredientMap.get(id);
    if (!ingredient) continue; // orphaned inventory doc — skip

    const currentStockKg = inventory.currentStock; // always stored in kg
    const safetyLevelKg = r3(UnitConverter.toKg(ingredient.minStockLevel, ingredient.unit));
    const orderDemandKg = r3(orderDemandMap.get(id) ?? 0);
    const suggestedQtyKg = r3(
      Math.max(0, safetyLevelKg + orderDemandKg - currentStockKg),
    );

    if (suggestedQtyKg <= 0) continue;

    const lineItem: PurchaseLineItem = {
      ingredientId:      id,
      ingredientName:    ingredient.name,
      currentStockKg,
      safetyLevelKg,
      orderDemandKg,
      suggestedQtyKg,
      unitCost:          ingredient.unitCost,
      estimatedCost:     r3(suggestedQtyKg * ingredient.unitCost),
      primarySupplierId: ingredient.supplierIds?.[0] ?? null,
      supplierIds:       ingredient.supplierIds ?? [],
    };

    lineItem.confidence = computeConfidence(
      lineItem,
      aiInventoryMap,
      historyMap,
      aiContext?.settings,
    );

    lineItems.push(lineItem);
  }

  // ── Step 5: Group by primary supplier ─────────────────────────────────────
  const supplierGroups = buildSupplierGroups(lineItems);

  return {
    status: 'draft',
    relatedOrderIds: resolvedOrderIds,
    generatedAt: Timestamp.now(),
    items: lineItems,
    supplierGroups,
    totalEstimatedCost: r3(
      supplierGroups.reduce((sum, g) => sum + g.subtotalCost, 0),
    ),
  };
}

// ─── savePurchaseDraft ────────────────────────────────────────────────────────

/**
 * Persists a PurchaseDraft to the `purchases` collection.
 * Returns the new document ID.
 */
export async function savePurchaseDraft(
  db: Firestore,
  draft: PurchaseDraft,
): Promise<string> {
  const ref = await addDoc(collection(db, 'purchases'), {
    ...draft,
    version: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ─── updatePurchaseDraft ─────────────────────────────────────────────────────

/**
 * Updates an existing purchases/{id} document using optimistic locking.
 *
 * Inside a Firestore transaction:
 *  1. Reads the current document to obtain its stored version.
 *  2. Compares it against `expectedVersion` — throws ConcurrencyError on mismatch.
 *  3. Writes the updated draft with version incremented by 1.
 *
 * @throws ConcurrencyError  When another writer has already incremented the version.
 * @throws Error             When the document does not exist.
 */
export async function updatePurchaseDraft(
  db: Firestore,
  purchaseId: string,
  draft: PurchaseDraft,
  expectedVersion: number,
): Promise<void> {
  const ref = doc(db, 'purchases', purchaseId);

  await runTransaction(db, async (t) => {
    const snap = await t.get(ref);

    if (!snap.exists()) {
      throw new Error(`採購單 "${purchaseId}" 不存在，可能已被刪除。`);
    }

    const storedVersion = (snap.data() as Purchase).version;
    if (storedVersion !== expectedVersion) {
      throw new ConcurrencyError();
    }

    t.update(ref, {
      ...draft,
      version: expectedVersion + 1,
      updatedAt: serverTimestamp(),
    });
  });
}

// ─── markPurchaseOrdered ──────────────────────────────────────────────────────

/**
 * Transitions a purchase from 'draft' → 'ordered' and records the timestamp.
 */
export async function markPurchaseOrdered(
  db: Firestore,
  purchaseId: string,
): Promise<void> {
  await updateDoc(doc(db, 'purchases', purchaseId), {
    status: 'ordered',
    orderedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function collectOrderItems(
  db: Firestore,
  orderIds?: string[],
): Promise<{ allOrderItems: OrderItem[]; resolvedOrderIds: string[] }> {
  const allOrderItems: OrderItem[] = [];
  const resolvedOrderIds: string[] = [];

  if (orderIds && orderIds.length > 0) {
    const snaps = await Promise.all(
      orderIds.map((id) => getDoc(doc(db, 'orders', id))),
    );
    snaps.forEach((snap) => {
      if (!snap.exists()) return;
      resolvedOrderIds.push(snap.id);
      allOrderItems.push(...(snap.data() as Order).items);
    });
  } else {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['confirmed', 'in-production']),
    );
    const snaps = await getDocs(q);
    snaps.forEach((snap) => {
      resolvedOrderIds.push(snap.id);
      allOrderItems.push(...(snap.data() as Order).items);
    });
  }

  return { allOrderItems, resolvedOrderIds };
}

function buildSupplierGroups(lineItems: PurchaseLineItem[]): SupplierGroup[] {
  const groupMap = new Map<string, PurchaseLineItem[]>();

  for (const item of lineItems) {
    const key = item.primarySupplierId ?? 'unassigned';
    const arr = groupMap.get(key) ?? [];
    arr.push(item);
    groupMap.set(key, arr);
  }

  return Array.from(groupMap.entries()).map(([supplierId, items]) => ({
    supplierId,
    items,
    subtotalCost: r3(items.reduce((sum, i) => sum + i.estimatedCost, 0)),
  }));
}

function buildEmptyDraft(): PurchaseDraft {
  return {
    status: 'draft',
    relatedOrderIds: [],
    generatedAt: Timestamp.now(),
    items: [],
    supplierGroups: [],
    totalEstimatedCost: 0,
  };
}
