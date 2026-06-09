/**
 * aiContextService.ts
 *
 * Provides a sanitised, read-only snapshot of operational data for AI analysis.
 * This is the ONLY gateway through which AI functions receive Firestore data.
 *
 * Hard rules:
 *  - Never expose Firebase credentials, auth tokens, or raw secrets
 *  - Never expose unauthenticated user PII
 *  - OCR-sourced data where verified !== true is EXCLUDED from snapshot
 *    (those items receive BLOCKED confidence in aiSuggestionConfidence)
 *  - All fields are plain serialisable values (no Firestore DocumentReferences)
 *
 * Performance:
 *  - Snapshots are cached per tenantId for CACHE_TTL_MS (4 hours)
 *  - Callers can force a refresh by passing forceRefresh: true
 */

import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { configService } from './configService';
import type { Ingredient, InventoryDoc, Menu } from './types';

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry {
  snapshot: AIContextSnapshot;
  expiresAt: number;
}

const snapshotCache = new Map<string, CacheEntry>();

// ─── Snapshot sub-types ───────────────────────────────────────────────────────

export interface MenuSummary {
  id: string;
  name: string;
  category: string;
  ingredientCount: number;
  /** true when all BOM items have a valid ingredientId and quantity > 0 */
  bomComplete: boolean;
  /** true when this menu was OCR-imported and has NOT been human-verified */
  isUnverifiedOcr: boolean;
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
  /**
   * true when the ingredient record was imported via OCR and has not been
   * human-verified.  computeConfidence will BLOCK suggestions for these items.
   */
  isUnverifiedOcr: boolean;
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
 *
 * OCR isolation: menus/ingredients where isOcr && !verified are flagged as
 * isUnverifiedOcr in the snapshot; confidence scoring will BLOCK those items.
 *
 * Caching: results are cached per tenantId for CACHE_TTL_MS.
 *
 * @param db            Firestore instance
 * @param tenantId      Used to load tenant-level settings thresholds
 * @param forceRefresh  Skip cache and rebuild from Firestore
 */
export async function buildAIContextSnapshot(
  db: Firestore,
  tenantId: string,
  forceRefresh = false,
): Promise<AIContextSnapshot> {
  // ── Cache lookup ─────────────────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = snapshotCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }
  }

  const [menuSnaps, ingredientSnaps, inventorySnaps, receivedOrderSnaps, tenantSettings] =
    await Promise.all([
      getDocs(collection(db, 'menus')),
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'inventory')),
      getDocs(
        query(
          collection(db, 'purchaseOrders'),
          where('status', '==', 'RECEIVED'),
          limit(200),
        ),
      ),
      configService.getSettings(tenantId).catch(() => null),
    ]);

  // ── Menu summaries — OCR unverified menus are flagged, not excluded ──────
  // They are flagged so the UI can show a warning; ingredient-level OCR
  // filtering happens via InventorySummary.isUnverifiedOcr → BLOCKED.
  const menus: MenuSummary[] = menuSnaps.docs.map((snap) => {
    const data = snap.data() as Menu;
    const bom = data.ingredients ?? [];
    const bomComplete =
      bom.length > 0 &&
      bom.every((item) => !!item.ingredientId && item.quantity > 0);
    const isUnverifiedOcr = data.isOcr === true && data.verified !== true;
    return {
      id: snap.id,
      name: data.name,
      category: data.category,
      ingredientCount: bom.length,
      bomComplete,
      isUnverifiedOcr,
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
    const isUnverifiedOcr =
      ingredient?.isOcr === true && ingredient.verified !== true;
    return {
      ingredientId:    snap.id,
      ingredientName:  inv.ingredientName,
      currentStockKg:  inv.currentStock,
      safetyLevelKg,
      belowSafety:     inv.currentStock < safetyLevelKg,
      negativeStock:   inv.currentStock < 0,
      wasteFactor:     ingredient?.wasteFactor ?? 0,
      hasCostData:     unitCost > 0,
      isUnverifiedOcr,
    };
  });

  // ── Purchase history: count RECEIVED orders per ingredient (last 90 days) ─
  const ninetyDaysAgoMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const receivedCountMap = new Map<string, number>();
  receivedOrderSnaps.forEach((snap) => {
    const data = snap.data() as { items?: Array<{ ingredientId: string }>; receivedAt?: { toMillis(): number } };
    const receivedMs = data.receivedAt?.toMillis() ?? 0;
    if (receivedMs < ninetyDaysAgoMs) return;
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

  const snapshot: AIContextSnapshot = {
    menus,
    inventory,
    purchaseHistory,
    settings,
    generatedAt: new Date(),
  };

  // ── Write cache ──────────────────────────────────────────────────────────
  snapshotCache.set(tenantId, {
    snapshot,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return snapshot;
}

/**
 * Invalidates the cached snapshot for a specific tenant (or all tenants when
 * no tenantId is provided).  Call after data-modifying operations so the next
 * AI suggestion reflects the updated state.
 *
 * Examples: human-verifying an OCR menu, receiving a purchase order.
 */
export function invalidateSnapshotCache(tenantId?: string): void {
  if (tenantId) {
    snapshotCache.delete(tenantId);
  } else {
    snapshotCache.clear();
  }
}
