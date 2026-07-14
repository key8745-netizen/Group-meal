/**
 * prepPlanStockDeductService — Feature 048: 出餐一鍵扣料
 *
 * Deducts a day's actual ingredient usage from inventory based on that
 * day's prep plan (備料快照), closing the outbound half of the stock loop
 * (the inbound half is purchase-order receiving, Feature 047):
 *
 *   收貨入庫（+）…… purchaseOrderService.completeOrder → restockIngredient
 *   出餐扣料（−）…… THIS SERVICE → inventoryService.deductStock
 *
 * Rules honoured:
 *  - The deduction itself goes strictly through `inventoryService.deductStock`
 *    (the repo's mandated transactional deduct path — pre-validates every
 *    line and writes audit `transactions` records; all-or-nothing).
 *  - Idempotent: a plan carries a set-once `stockDeductedAt/By` marker
 *    (enforced both here and in firestore.rules); a second attempt throws.
 *  - g/ml quantities convert to kg (÷1000, 1 ml ≈ 1 g); pcs items are
 *    skipped with a reason (inventory is kg-denominated).
 *
 * On insufficient stock, `deductStock` throws `InsufficientStockError`
 * listing every shortage and NOTHING is deducted — adjust stock via
 * 庫存盤點 (InventoryAudit) first, then retry.
 */

import {
  doc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { getPrepPlan } from './prepPlanService';
import { deductStock } from './inventoryService';
import type { PrepPlan, RequirementItem } from './types';

export interface DeductionSkip {
  ingredientName: string;
  reason: string;
}

export interface PrepPlanDeductionPlan {
  requirements: Map<string, RequirementItem>;
  skipped: DeductionSkip[];
}

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Pure planning — converts prepItems into kg-denominated deduction
 * requirements, merging duplicate ingredientIds and skipping what cannot be
 * deducted (pcs, non-positive quantities).
 */
export function planPrepPlanDeduction(plan: Pick<PrepPlan, 'prepItems'>): PrepPlanDeductionPlan {
  const requirements = new Map<string, RequirementItem>();
  const skipped: DeductionSkip[] = [];

  for (const item of plan.prepItems ?? []) {
    if (!(item.requiredBaseQuantity > 0)) {
      skipped.push({ ingredientName: item.ingredientNameSnapshot, reason: '數量為 0' });
      continue;
    }
    if (item.baseUnit === 'pcs') {
      skipped.push({
        ingredientName: item.ingredientNameSnapshot,
        reason: '以個數計量，庫存以公斤計，請用庫存盤點手動調整',
      });
      continue;
    }
    const kg = r3(item.requiredBaseQuantity / 1000);
    const existing = requirements.get(item.ingredientId);
    if (existing) {
      existing.totalQuantityKg = r3(existing.totalQuantityKg + kg);
    } else {
      requirements.set(item.ingredientId, {
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientNameSnapshot,
        totalQuantityKg: kg,
      });
    }
  }

  return { requirements, skipped };
}

export interface PrepPlanDeductionResult {
  deductedCount: number;
  skipped: DeductionSkip[];
}

/**
 * Applies user-edited kg overrides onto planned requirements. An override
 * of 0 (or less) removes the line — the owner decided not to deduct it.
 * Returns a NEW map; the input is not mutated.
 */
export function applyDeductionOverrides(
  requirements: Map<string, RequirementItem>,
  overrideKgByIngredientId: Map<string, number>,
): Map<string, RequirementItem> {
  const out = new Map<string, RequirementItem>();
  for (const [id, req] of requirements) {
    const override = overrideKgByIngredientId.get(id);
    if (override === undefined) {
      out.set(id, { ...req });
      continue;
    }
    if (!(override > 0)) continue;
    out.set(id, { ...req, totalQuantityKg: r3(override) });
  }
  return out;
}

/**
 * Executes 出餐扣料 for one prep plan. `overrideKgByIngredientId` carries
 * the owner's manual quantity edits from the confirm dialog (預設為備料量，
 * 可改成實際用量；設 0 表示該項不扣). Throws when the plan is missing,
 * already deducted, has nothing deductible, or stock is insufficient
 * (`InsufficientStockError` — nothing deducted in that case).
 */
export async function deductPrepPlanStock(
  db: Firestore,
  prepPlanId: string,
  uid: string,
  overrideKgByIngredientId?: Map<string, number>,
): Promise<PrepPlanDeductionResult> {
  const plan = await getPrepPlan(db, prepPlanId);
  if (!plan) throw new Error(`找不到備料快照（ID: ${prepPlanId}）`);
  if (plan.stockDeductedAt) {
    throw new Error(`「${plan.name}」已於先前扣料，不可重複扣除`);
  }

  const planned = planPrepPlanDeduction(plan);
  const skipped = planned.skipped;
  const requirements = overrideKgByIngredientId
    ? applyDeductionOverrides(planned.requirements, overrideKgByIngredientId)
    : planned.requirements;
  if (requirements.size === 0) {
    throw new Error('沒有可扣除的品項（皆為個數單位、數量為 0，或全部被手動設為 0）');
  }

  await deductStock(db, requirements, prepPlanId, uid);

  await updateDoc(doc(db, 'prepPlans', prepPlanId), {
    stockDeductedAt: serverTimestamp(),
    stockDeductedBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });

  return { deductedCount: requirements.size, skipped };
}
