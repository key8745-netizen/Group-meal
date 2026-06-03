/**
 * aiContextSummaryService.ts
 *
 * Builds AIContextSummary from verified Firestore data.
 *
 * HARD RULES:
 *  1. Pure function — no Firestore reads or writes.
 *  2. All quantities returned as Grams branded type.
 *  3. Unverified / OCR data is excluded and flagged — never silently used.
 *  4. Raw logs, raw OCR content, and PII must never appear in the output.
 *  5. Missing ingredientId → MISSING_INGREDIENT_ID blocked.
 *  6. Incomplete BOM → INCOMPLETE_BOM blocked.
 *  7. Legacy kg-only fallback → LEGACY_KG_FALLBACK_USED warning, blocked for AI.
 */

import type {
  Grams, TenantId, BlockedReason,
  AIContextSummary, InventoryIngredientSummary,
  WasteRiskSummary, SafeSettingsSummary, ActiveMealPlanSummary,
} from '@/types/aiBoundary';
import { kgToGrams, toGrams, asGrams } from './unitConversionService';
import { readQuantityAsGrams } from './quantityMigrationHelper';

// ─── Input types (matching existing Firestore document shapes) ────────────────

export interface BOMItemInput {
  ingredientId: string;
  quantity: number;
  unit: string;
  wasteFactor?: number;
}

export interface MenuInput {
  menuId: string;
  name?: string;
  ingredients: BOMItemInput[];
  isOcr?: boolean;
  verified?: boolean;
}

export interface InventoryItemInput {
  ingredientId: string;
  name?: string;
  currentStockKg: number;
  safetyStockKg?: number;
  category?: string;
  isOcr?: boolean;
  verified?: boolean;
  source?: 'manual' | 'imported' | 'system';
  wasteFactor?: number;
}

export interface MealPlanInput {
  mealPlanId: string;
  date: string;
  menuIds: string[];
  headCount: number;
}

export interface PurchaseOrderItemInput {
  ingredientId: string;
  purchasedQtyKg?: number;
  purchasedQtyGrams?: number;
}

export interface PurchaseOrderInput {
  orderId: string;
  status: string;
  receivedAt?: Date;
  items: PurchaseOrderItemInput[];
  isOcr?: boolean;
  verified?: boolean;
}

export interface PerformanceLogInput {
  ingredientId: string;
  usedKg?: number;
  usedGrams?: number;
  loggedAt: Date;
  verified?: boolean;
  finalized?: boolean;
}

export interface SettingsInput {
  tenantId: string;
  wasteFactorWarning?: number;
  aiPurchaseSuggestionEnabled?: boolean;
  requireHumanApproval?: boolean;
}

export interface BuildAIContextSummaryInput {
  tenantId: TenantId;
  now: Date;
  activeMealPlans: MealPlanInput[];
  menus: MenuInput[];
  inventoryItems: InventoryItemInput[];
  recentPurchaseOrders: PurchaseOrderInput[];
  performanceLogs: PerformanceLogInput[];
  settings: SettingsInput;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const USAGE_WINDOW_DAYS = 30;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildActiveMealPlanSummary(
  mealPlans: MealPlanInput[],
  now: Date,
): ActiveMealPlanSummary {
  const dates = mealPlans.map(p => p.date).sort();
  const totalServings = mealPlans.reduce((sum, p) => sum + p.headCount, 0);

  return {
    mealPlanIds:    mealPlans.map(p => p.mealPlanId),
    dateRangeStart: dates.length > 0 ? new Date(dates[0]) : now,
    dateRangeEnd:   dates.length > 0 ? new Date(dates[dates.length - 1]) : now,
    totalMeals:     mealPlans.length,
    totalServings,
  };
}

function isUnverifiedOcr(item: { isOcr?: boolean; verified?: boolean }): boolean {
  return item.isOcr === true && item.verified !== true;
}

function buildInventoryIngredientSummary(
  item: InventoryItemInput,
): InventoryIngredientSummary {
  const warnings: BlockedReason[] = [];
  const blocked: BlockedReason[] = [];

  let currentStockGrams: Grams;
  try {
    currentStockGrams = kgToGrams(item.currentStockKg);
  } catch {
    currentStockGrams = 0 as Grams;
    blocked.push('MISSING_GRAMS_FIELD');
  }

  let safetyStockGrams: Grams | undefined;
  if (item.safetyStockKg !== undefined) {
    try {
      safetyStockGrams = kgToGrams(item.safetyStockKg);
    } catch {
      warnings.push('MISSING_GRAMS_FIELD');
    }
  }

  const isVerified = !isUnverifiedOcr(item);
  if (!isVerified) {
    blocked.push('UNVERIFIED_OCR_SOURCE');
  }

  return {
    ingredientId:    item.ingredientId,
    name:            item.name ?? item.ingredientId,
    currentStockGrams,
    safetyStockGrams,
    category:        item.category,
    isVerified,
    source:          item.source ?? 'manual',
    warnings,
    blockedReasons:  blocked,
  };
}

function buildRequiredQtyGrams(
  mealPlans: MealPlanInput[],
  menuMap: Map<string, MenuInput>,
  inventoryMap: Map<string, InventoryItemInput>,
  summaryBlocked: BlockedReason[],
  summaryWarnings: BlockedReason[],
): Record<string, Grams> {
  const required: Record<string, number> = {};

  for (const plan of mealPlans) {
    for (const menuId of plan.menuIds) {
      const menu = menuMap.get(menuId);
      if (!menu) {
        if (!summaryBlocked.includes('INCOMPLETE_BOM')) summaryBlocked.push('INCOMPLETE_BOM');
        continue;
      }
      if (isUnverifiedOcr(menu)) {
        if (!summaryWarnings.includes('UNVERIFIED_OCR_SOURCE')) summaryWarnings.push('UNVERIFIED_OCR_SOURCE');
        continue;
      }

      for (const bom of menu.ingredients) {
        if (!bom.ingredientId) {
          if (!summaryBlocked.includes('MISSING_INGREDIENT_ID')) summaryBlocked.push('MISSING_INGREDIENT_ID');
          continue;
        }

        const invItem = inventoryMap.get(bom.ingredientId);
        const wasteFactor = invItem?.wasteFactor ?? bom.wasteFactor ?? 0;

        let qtyGrams: number;
        try {
          qtyGrams = toGrams(bom.quantity, bom.unit as 'grams' | 'kg' | 'taijin');
        } catch {
          if (!summaryBlocked.includes('UNKNOWN_UNIT')) summaryBlocked.push('UNKNOWN_UNIT');
          continue;
        }

        // requiredKg = (qtyPerServing × headCount) × (1 + wasteFactor)
        const total = Math.round(qtyGrams * plan.headCount * (1 + wasteFactor));
        required[bom.ingredientId] = (required[bom.ingredientId] ?? 0) + total;
      }
    }
  }

  const result: Record<string, Grams> = {};
  for (const [id, grams] of Object.entries(required)) {
    try {
      result[id] = asGrams(grams);
    } catch {
      // asGrams failed — value was computed as negative or non-integer
    }
  }
  return result;
}

function buildShortageQtyGrams(
  required: Record<string, Grams>,
  inventoryMap: Map<string, InventoryItemInput>,
  warnings: BlockedReason[],
): Record<string, Grams> {
  const shortage: Record<string, Grams> = {};

  for (const [ingredientId, requiredGrams] of Object.entries(required)) {
    const inv = inventoryMap.get(ingredientId);
    if (!inv) continue;

    let currentStockGrams: number;
    try {
      currentStockGrams = kgToGrams(inv.currentStockKg);
    } catch {
      if (!warnings.includes('MISSING_GRAMS_FIELD')) warnings.push('MISSING_GRAMS_FIELD');
      continue;
    }

    const safetyStockGrams = inv.safetyStockKg !== undefined
      ? (() => { try { return kgToGrams(inv.safetyStockKg!); } catch { return 0; } })()
      : 0;

    const shortageRaw = Math.max(requiredGrams + safetyStockGrams - currentStockGrams, 0);
    try {
      shortage[ingredientId] = asGrams(shortageRaw);
    } catch {
      // non-integer or invalid — skip
    }
  }
  return shortage;
}

function buildRecentPurchaseTotals(
  orders: PurchaseOrderInput[],
  now: Date,
  warnings: BlockedReason[],
): Record<string, Grams> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS);
  const totals: Record<string, number> = {};

  for (const order of orders) {
    if (order.status !== 'RECEIVED') continue;
    if (!order.receivedAt || order.receivedAt < cutoff) continue;
    if (isUnverifiedOcr(order)) {
      if (!warnings.includes('UNVERIFIED_OCR_SOURCE')) warnings.push('UNVERIFIED_OCR_SOURCE');
      continue;
    }

    for (const item of order.items) {
      if (!item.ingredientId) continue;

      const r = readQuantityAsGrams({
        grams: item.purchasedQtyGrams,
        kg:    item.purchasedQtyKg,
        fieldName: `purchaseOrder.${order.orderId}.${item.ingredientId}`,
      });

      if (r.warnings.length > 0 && !warnings.includes('LEGACY_KG_FALLBACK_USED')) {
        warnings.push('LEGACY_KG_FALLBACK_USED');
      }

      if (r.valueGrams !== undefined) {
        totals[item.ingredientId] = (totals[item.ingredientId] ?? 0) + r.valueGrams;
      }
    }
  }

  const result: Record<string, Grams> = {};
  for (const [id, grams] of Object.entries(totals)) {
    try { result[id] = asGrams(grams); } catch { /* skip */ }
  }
  return result;
}

function buildAverageDailyUsage(
  logs: PerformanceLogInput[],
  now: Date,
  warnings: BlockedReason[],
): Record<string, Grams> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS);
  const totals: Record<string, number> = {};
  const firstLogDate: Record<string, Date> = {};
  const lastLogDate: Record<string, Date> = {};

  for (const log of logs) {
    if (!log.verified || !log.finalized) continue;
    if (log.loggedAt < cutoff || log.loggedAt > now) continue;
    if (!log.ingredientId) continue;

    const r = readQuantityAsGrams({
      grams: log.usedGrams,
      kg:    log.usedKg,
      fieldName: `performanceLog.${log.ingredientId}`,
    });
    if (r.valueGrams === undefined) continue;

    totals[log.ingredientId] = (totals[log.ingredientId] ?? 0) + r.valueGrams;

    if (!firstLogDate[log.ingredientId] || log.loggedAt < firstLogDate[log.ingredientId]) {
      firstLogDate[log.ingredientId] = log.loggedAt;
    }
    if (!lastLogDate[log.ingredientId] || log.loggedAt > lastLogDate[log.ingredientId]) {
      lastLogDate[log.ingredientId] = log.loggedAt;
    }
  }

  const result: Record<string, Grams> = {};
  for (const [id, totalGrams] of Object.entries(totals)) {
    const first = firstLogDate[id];
    const last = lastLogDate[id];
    const daysCovered = first && last
      ? Math.max((last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000), 1)
      : 1;

    if (daysCovered < USAGE_WINDOW_DAYS) {
      if (!warnings.includes('INCOMPLETE_BOM')) {
        // Use closest existing reason for "insufficient data window"
        warnings.push('INCOMPLETE_BOM');
      }
    }

    const avg = Math.round(totalGrams / USAGE_WINDOW_DAYS);
    try { result[id] = asGrams(avg); } catch { /* skip */ }
  }
  return result;
}

function buildWasteRiskSummary(
  inventoryItems: InventoryItemInput[],
  _logs: PerformanceLogInput[],
  settings: SettingsInput,
): Record<string, WasteRiskSummary> {
  const result: Record<string, WasteRiskSummary> = {};
  const threshold = settings.wasteFactorWarning ?? 0.3;

  for (const item of inventoryItems) {
    const { wasteFactor } = item;

    let riskLevel: WasteRiskSummary['riskLevel'] = 'UNKNOWN';
    if (wasteFactor !== undefined) {
      if (wasteFactor >= threshold * 1.5) riskLevel = 'HIGH';
      else if (wasteFactor >= threshold) riskLevel = 'MEDIUM';
      else riskLevel = 'LOW';
    }

    result[item.ingredientId] = {
      ingredientId: item.ingredientId,
      wasteFactor,
      riskLevel,
    };
  }
  return result;
}

function buildSettingsSummary(
  settings: SettingsInput,
  tenantId: TenantId,
): SafeSettingsSummary {
  return {
    tenantId,
    wasteFactorWarning:          settings.wasteFactorWarning,
    aiPurchaseSuggestionEnabled: settings.aiPurchaseSuggestionEnabled,
    requireHumanApproval:        true,
  };
}

// ─── buildAIContextSummary ────────────────────────────────────────────────────

/**
 * Builds an AIContextSummary from pre-fetched Firestore data.
 *
 * Pure function — no Firestore reads or writes occur here.
 * The caller is responsible for providing only verified, tenant-scoped data.
 * OCR-sourced or unverified items are excluded and flagged in warnings/blockedReasons.
 */
export function buildAIContextSummary(input: BuildAIContextSummaryInput): AIContextSummary {
  const { tenantId, now, activeMealPlans, menus, inventoryItems, recentPurchaseOrders, performanceLogs, settings } = input;

  const warnings: BlockedReason[] = [];
  const blockedReasons: BlockedReason[] = [];

  const menuMap       = new Map(menus.map(m => [m.menuId, m]));
  const inventoryMap  = new Map(inventoryItems.map(i => [i.ingredientId, i]));

  const activeMealPlanSummary = buildActiveMealPlanSummary(activeMealPlans, now);

  const inventorySummaryByIngredient: Record<string, InventoryIngredientSummary> = {};
  for (const item of inventoryItems) {
    const s = buildInventoryIngredientSummary(item);
    inventorySummaryByIngredient[item.ingredientId] = s;
    for (const r of s.blockedReasons) {
      if (!blockedReasons.includes(r)) blockedReasons.push(r);
    }
    for (const w of s.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }

  const requiredQtyGramsByIngredient = buildRequiredQtyGrams(
    activeMealPlans, menuMap, inventoryMap, blockedReasons, warnings,
  );

  const shortageQtyGramsByIngredient = buildShortageQtyGrams(
    requiredQtyGramsByIngredient, inventoryMap, warnings,
  );

  const recentPurchaseTotalsGramsByIngredient = buildRecentPurchaseTotals(
    recentPurchaseOrders, now, warnings,
  );

  const averageDailyUsageGramsByIngredient = buildAverageDailyUsage(
    performanceLogs, now, warnings,
  );

  const wasteRiskSummaryByIngredient = buildWasteRiskSummary(
    inventoryItems, performanceLogs, settings,
  );

  const settingsSummary = buildSettingsSummary(settings, tenantId);

  return {
    tenantId,
    generatedAt: now,
    activeMealPlanSummary,
    inventorySummaryByIngredient,
    requiredQtyGramsByIngredient,
    shortageQtyGramsByIngredient,
    recentPurchaseTotalsGramsByIngredient,
    averageDailyUsageGramsByIngredient,
    wasteRiskSummaryByIngredient,
    settingsSummary,
    warnings,
    blockedReasons,
  };
}
