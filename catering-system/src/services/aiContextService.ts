/**
 * aiContextService.ts
 *
 * Provides a sanitised, read-only snapshot of operational data for AI analysis.
 * This is the ONLY gateway through which AI functions receive Firestore data.
 *
 * Hard rules:
 *  - Never expose Firebase credentials, auth tokens, or raw secrets
 *  - Never expose unauthenticated user PII
 *  - All fields are plain serialisable values (no Firestore DocumentReferences)
 */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { configService } from './configService';
import type { Ingredient, InventoryDoc, Menu } from './types';

// ─── Snapshot sub-types ───────────────────────────────────────────────────────

export interface MenuSummary {
  id: string;
  name: string;
  category: string;
  ingredientCount: number;
  /** true when all BOM items have a valid ingredientId and quantity > 0 */
  bomComplete: boolean;
}

export interface InventorySummary {
  ingredientId: string;
  ingredientName: string;
  currentStockKg: number;
  safetyLevelKg: number;
  /** true when currentStockKg < safetyLevelKg */
  belowSafety: boolean;
  /** true when currentStockKg < 0 — indicates a data anomaly */
  negativeStock: boolean;
  wasteFactor: number;
  /** false when unitCost is 0 or missing */
  hasCostData: boolean;
}

export interface PurchaseHistorySummary {
  ingredientId: string;
  /** number of RECEIVED purchase orders containing this ingredient in last 90 days */
  receivedOrderCount: number;
}

/**
 * Flattened view of AIAutomationSettings used by aiSuggestionConfidence.
 * Sourced from configService.SystemSettings.aiAutomation.
 */
export interface AISystemSettings {
  lowMarginThreshold: number;
  wasteFactorWarning: number;
  purchaseSuggestionEnabled: boolean;
  autoDraftEnabled: boolean;
  maxSuggestionMultiplier: number;
  requireHumanApproval: boolean;
}

// ─── Main snapshot ────────────────────────────────────────────────────────────

export interface AIContextSnapshot {
  menus: MenuSummary[];
  inventory: InventorySummary[];
  purchaseHistory: PurchaseHistorySummary[];
  settings: AISystemSettings;
  generatedAt: Date;
}

// ─── buildAIContextSnapshot ───────────────────────────────────────────────────

/**
 * Collects a sanitised operational snapshot for AI consumption.
 * Reads menus, ingredients, inventory, and 90-day purchase history in parallel.
 *
 * @param db        Firestore instance
 * @param tenantId  Used to load tenant-level settings thresholds
 */
export async function buildAIContextSnapshot(
  db: Firestore,
  tenantId: string,
): Promise<AIContextSnapshot> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [menuSnaps, ingredientSnaps, inventorySnaps, receivedOrderSnaps, tenantSettings] =
    await Promise.all([
      getDocs(collection(db, 'menus')),
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'inventory')),
      getDocs(
        query(
          collection(db, 'purchaseOrders'),
          where('status', '==', 'RECEIVED'),
          where('receivedAt', '>=', Timestamp.fromDate(ninetyDaysAgo)),
          orderBy('receivedAt', 'desc'),
          limit(200),
        ),
      ),
      configService.getSettings(tenantId).catch(() => null),
    ]);

  // ── Menu summaries ───────────────────────────────────────────────────────
  const menus: MenuSummary[] = menuSnaps.docs.map((snap) => {
    const data = snap.data() as Menu;
    const bom = data.ingredients ?? [];
    const bomComplete =
      bom.length > 0 &&
      bom.every((item) => !!item.ingredientId && item.quantity > 0);
    return {
      id: snap.id,
      name: data.name,
      category: data.category,
      ingredientCount: bom.length,
      bomComplete,
    };
  });

  // ── Ingredient master lookup ─────────────────────────────────────────────
  const ingredientMap = new Map<string, Ingredient>();
  ingredientSnaps.forEach((snap) => {
    if (snap.exists()) ingredientMap.set(snap.id, { id: snap.id, ...snap.data() } as Ingredient);
  });

  // ── Inventory summaries ──────────────────────────────────────────────────
  const inventory: InventorySummary[] = inventorySnaps.docs.map((snap) => {
    const inv = snap.data() as InventoryDoc;
    const ingredient = ingredientMap.get(snap.id);
    const safetyLevelKg = ingredient?.minStockLevel ?? 0;
    const unitCost = ingredient?.unitCost ?? 0;
    return {
      ingredientId:   snap.id,
      ingredientName: inv.ingredientName,
      currentStockKg: inv.currentStock,
      safetyLevelKg,
      belowSafety:   inv.currentStock < safetyLevelKg,
      negativeStock: inv.currentStock < 0,
      wasteFactor:   ingredient?.wasteFactor ?? 0,
      hasCostData:   unitCost > 0,
    };
  });

  // ── Purchase history: count RECEIVED orders per ingredient (last 90 days) ─
  const receivedCountMap = new Map<string, number>();
  receivedOrderSnaps.forEach((snap) => {
    const data = snap.data() as { items?: Array<{ ingredientId: string }> };
    for (const item of data.items ?? []) {
      receivedCountMap.set(
        item.ingredientId,
        (receivedCountMap.get(item.ingredientId) ?? 0) + 1,
      );
    }
  });

  const purchaseHistory: PurchaseHistorySummary[] = Array.from(
    receivedCountMap.entries(),
  ).map(([ingredientId, receivedOrderCount]) => ({ ingredientId, receivedOrderCount }));

  // ── Settings — map SystemSettings → AISystemSettings ─────────────────────
  const s = tenantSettings;
  const ai = s?.aiAutomation;
  const settings: AISystemSettings = {
    lowMarginThreshold:        s?.profitMarginThreshold      ?? 0.20,
    wasteFactorWarning:        s?.wasteFactorWarning          ?? 0.30,
    purchaseSuggestionEnabled: ai?.purchaseSuggestionEnabled  ?? true,
    autoDraftEnabled:          ai?.autoDraftEnabled            ?? true,
    maxSuggestionMultiplier:   ai?.maxSuggestionMultiplier     ?? 5,
    requireHumanApproval:      ai?.requireHumanApproval        ?? true,
  };

  return { menus, inventory, purchaseHistory, settings, generatedAt: new Date() };
}
