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
