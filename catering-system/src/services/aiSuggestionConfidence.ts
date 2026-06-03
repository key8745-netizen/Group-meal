/**
 * aiSuggestionConfidence.ts
 *
 * Computes a confidence level for each AI-generated purchase suggestion.
 * Works with any object that satisfies ConfidenceInput — both SuggestionItem
 * (intelligence hook) and PurchaseLineItem (purchaseService) qualify.
 *
 * Hard rule: BLOCKED suggestions must NOT produce DRAFT purchase orders.
 */

import type { InventorySummary, PurchaseHistorySummary, AISystemSettings } from './aiContextService';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';

export interface SuggestionConfidence {
  level: ConfidenceLevel;
  /** Short human-readable labels explaining the level */
  reasons: string[];
  /** Non-empty only when level === 'BLOCKED' */
  blockReason: string | null;
  /** Whether a DRAFT purchase order may be created for this suggestion */
  canCreateDraft: boolean;
}

/** Minimal shape required by computeConfidence — satisfied by both SuggestionItem and PurchaseLineItem */
export interface ConfidenceInput {
  ingredientId: string;
  suggestedQtyKg: number;
  currentStockKg: number;
  safetyLevelKg: number;
  orderDemandKg: number;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Purchase history depth that qualifies as "sufficient" */
const HISTORY_THRESHOLD = 2;

/** Multiplier above which a suggestion qty is considered anomalously large */
const DEFAULT_MAX_MULTIPLIER = 5;

// ─── computeConfidence ────────────────────────────────────────────────────────

/**
 * Evaluates a purchase suggestion against inventory and history snapshots.
 *
 * Evaluation order (first BLOCKED check wins; otherwise build up positive signals):
 *  BLOCKED → LOW → MEDIUM → HIGH
 *
 * @param item        Any object satisfying ConfidenceInput (SuggestionItem or PurchaseLineItem)
 * @param inventoryMap Map of ingredientId → InventorySummary from aiContextService
 * @param historyMap  Map of ingredientId → PurchaseHistorySummary from aiContextService
 * @param settings    AI system settings (maxSuggestionMultiplier)
 */
export function computeConfidence(
  item: ConfidenceInput,
  inventoryMap: Map<string, InventorySummary>,
  historyMap: Map<string, PurchaseHistorySummary>,
  settings?: Partial<AISystemSettings>,
): SuggestionConfidence {
  const reasons: string[] = [];
  const maxMultiplier = settings?.maxSuggestionMultiplier ?? DEFAULT_MAX_MULTIPLIER;

  const inv = inventoryMap.get(item.ingredientId);
  const hist = historyMap.get(item.ingredientId);

  // ── BLOCKED checks (order matters — most data-critical first) ────────────

  if (!item.ingredientId) {
    return blocked('食材 ID 缺失，無法對應庫存紀錄');
  }

  if (!inv) {
    return blocked('庫存記錄不存在，可能為新增食材尚未建檔');
  }

  if (inv.negativeStock) {
    return blocked(
      `庫存為負數（${inv.currentStockKg.toFixed(3)} kg），資料異常，請先盤點修正`,
    );
  }

  if (!Number.isFinite(item.suggestedQtyKg) || item.suggestedQtyKg < 0) {
    return blocked('建議採購量計算結果無效（非有限數或負值）');
  }

  // Qty overflow guard: block when suggestion exceeds N× the larger of safety/demand
  const safeMax = Math.max(item.safetyLevelKg, item.orderDemandKg) * maxMultiplier;
  if (safeMax > 0 && item.suggestedQtyKg > safeMax) {
    return blocked(
      `建議採購量 ${item.suggestedQtyKg.toFixed(2)} kg 超過安全上限 ` +
      `${safeMax.toFixed(2)} kg（${maxMultiplier}×），請人工確認`,
    );
  }

  // ── Positive signal collection ────────────────────────────────────────────

  const hasHistory = (hist?.receivedOrderCount ?? 0) >= HISTORY_THRESHOLD;
  const hasCostData = inv.hasCostData;
  const hasOrderDemand = item.orderDemandKg > 0;

  reasons.push(
    hasHistory
      ? `近 90 天有 ${hist!.receivedOrderCount} 筆採購紀錄`
      : '近 90 天採購紀錄不足（少於 2 筆）',
  );

  reasons.push(
    hasCostData ? '食材單價資料完整' : '食材單價缺失，成本估算僅供參考',
  );

  reasons.push(
    hasOrderDemand
      ? `訂單需求 ${item.orderDemandKg.toFixed(2)} kg`
      : '無對應訂單需求，建議來自安全庫存判斷',
  );

  reasons.push(
    `現有庫存 ${item.currentStockKg.toFixed(2)} kg，` +
    `安全庫存 ${item.safetyLevelKg.toFixed(2)} kg`,
  );

  // ── Level determination ───────────────────────────────────────────────────

  if (hasHistory && hasCostData) {
    return { level: 'HIGH', reasons, blockReason: null, canCreateDraft: true };
  }

  if (hasHistory || hasCostData) {
    return { level: 'MEDIUM', reasons, blockReason: null, canCreateDraft: true };
  }

  return { level: 'LOW', reasons, blockReason: null, canCreateDraft: true };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function blocked(reason: string): SuggestionConfidence {
  return {
    level: 'BLOCKED',
    reasons: [],
    blockReason: reason,
    canCreateDraft: false,
  };
}

// ─── buildConfidenceMaps ──────────────────────────────────────────────────────

/**
 * Converts aiContextService arrays into lookup maps for fast per-item evaluation.
 */
export function buildConfidenceMaps(
  inventory: InventorySummary[],
  purchaseHistory: PurchaseHistorySummary[],
): {
  inventoryMap: Map<string, InventorySummary>;
  historyMap: Map<string, PurchaseHistorySummary>;
} {
  return {
    inventoryMap: new Map(inventory.map((inv) => [inv.ingredientId, inv])),
    historyMap:   new Map(purchaseHistory.map((h) => [h.ingredientId, h])),
  };
}
