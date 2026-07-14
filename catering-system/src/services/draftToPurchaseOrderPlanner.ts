/**
 * draftToPurchaseOrderPlanner — Feature 047 的純規劃層。
 *
 * Split from draftToPurchaseOrderService so it stays importable in tsx test
 * runs: the executor imports `purchaseOrderService`, whose module-level
 * `@/lib/firebase` init reads `import.meta.env` and crashes outside Vite.
 * This module only type-imports, so it is side-effect free.
 *
 * Conversion rules:
 *  - demandQuantity <= 0 → skipped（庫存足夠或數量為 0）
 *  - baseUnit 'pcs'      → skipped（採購單以公斤計量，個數品項請手動建單）
 *  - g / ml              → kg（÷1000，四捨五入到 3 位小數；1 ml ≈ 1 g）
 */

import { toTaijin } from '@/utils/unitConverter';
import { netItemsAgainstStock } from './dayStartService';
import type { PurchaseOrderItem } from './purchaseOrderService';
import type { PurchaseDemandDraft } from './types';

export interface DraftConversionSkip {
  ingredientName: string;
  reason: string;
}

export interface DraftConversionPlan {
  lines: PurchaseOrderItem[];
  skipped: DraftConversionSkip[];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ─── Feature 052: 多日彙總 → 扣庫存 → 採購單行 ──────────────────────────────

export interface RangeOrderLineInput {
  ingredientId: string;
  ingredientName: string;
  /** RangeDemandLine.baseUnit is typed string upstream — validated here. */
  baseUnit: string;
  totalBaseQuantity: number;
}

export interface RangeOrderPlan {
  lines: PurchaseOrderItem[];
  skipped: DraftConversionSkip[];
  /** Lines whose demand was reduced by positive stock. */
  nettedCount: number;
  /** Netted lines fully covered by stock (net 0 → skipped). */
  coveredCount: number;
}

/**
 * Pure planning for「彙總範圍直接建採購單」：先以現有庫存淨化需求
 * （`netItemsAgainstStock`——kg 庫存 ×1000 對 g/ml，pcs 不比對），再套用
 * 與草稿轉單相同的換算規則（g/ml ÷1000 → kg＋台斤；0 與 pcs 略過附原因）。
 */
export function planRangeOrder(
  inputs: RangeOrderLineInput[],
  stockKgByIngredientId: Map<string, number>,
): RangeOrderPlan {
  const valid: { ingredientId: string; baseUnit: 'g' | 'ml' | 'pcs'; demandQuantity: number }[] = [];
  const skipped: DraftConversionSkip[] = [];
  const nameById = new Map<string, string>();

  for (const input of inputs) {
    nameById.set(input.ingredientId, input.ingredientName);
    if (input.baseUnit !== 'g' && input.baseUnit !== 'ml' && input.baseUnit !== 'pcs') {
      skipped.push({ ingredientName: input.ingredientName, reason: `未知單位「${input.baseUnit}」，請手動建單` });
      continue;
    }
    valid.push({
      ingredientId: input.ingredientId,
      baseUnit: input.baseUnit,
      demandQuantity: input.totalBaseQuantity,
    });
  }

  const netted = netItemsAgainstStock(valid, stockKgByIngredientId);

  const lines: PurchaseOrderItem[] = [];
  for (const item of netted.items) {
    const name = nameById.get(item.ingredientId) ?? item.ingredientId;
    if (!(item.demandQuantity > 0)) {
      skipped.push({ ingredientName: name, reason: '淨需求為 0（庫存足夠）' });
      continue;
    }
    if (item.baseUnit === 'pcs') {
      skipped.push({ ingredientName: name, reason: '以個數計量，採購單以公斤計，請手動建單' });
      continue;
    }
    const purchaseQtyKg = round3(item.demandQuantity / 1000);
    if (!(purchaseQtyKg > 0)) {
      skipped.push({ ingredientName: name, reason: '數量過小，換算公斤後為 0' });
      continue;
    }
    lines.push({
      ingredientId: item.ingredientId,
      name,
      purchaseQtyKg,
      purchaseTaijin: toTaijin(purchaseQtyKg),
    });
  }

  return { lines, skipped, nettedCount: netted.nettedCount, coveredCount: netted.coveredCount };
}

/** Pure planning — decides which draft lines become order lines. */
export function planDraftConversion(draft: Pick<PurchaseDemandDraft, 'items'>): DraftConversionPlan {
  const lines: PurchaseOrderItem[] = [];
  const skipped: DraftConversionSkip[] = [];

  for (const item of draft.items ?? []) {
    if (!(item.demandQuantity > 0)) {
      skipped.push({ ingredientName: item.ingredientNameSnapshot, reason: '淨需求為 0（庫存足夠）' });
      continue;
    }
    if (item.baseUnit === 'pcs') {
      skipped.push({
        ingredientName: item.ingredientNameSnapshot,
        reason: '以個數計量，採購單以公斤計，請手動建單',
      });
      continue;
    }
    const purchaseQtyKg = round3(item.demandQuantity / 1000);
    if (!(purchaseQtyKg > 0)) {
      skipped.push({ ingredientName: item.ingredientNameSnapshot, reason: '數量過小，換算公斤後為 0' });
      continue;
    }
    lines.push({
      ingredientId: item.ingredientId,
      name: item.ingredientNameSnapshot,
      purchaseQtyKg,
      purchaseTaijin: toTaijin(purchaseQtyKg),
    });
  }

  return { lines, skipped };
}
