/**
 * draftToPurchaseOrderService — Feature 047: 採購需求草稿一鍵轉正式採購單
 *
 * Converts a purchase-demand draft (Feature 014, g/ml/pcs demand lines,
 * netted against inventory by Feature 046) into a formal purchase order on
 * the existing `purchaseOrders` collection via
 * `purchaseOrderService.createOrder()` — the same path as a manually entered
 * order, so the order lands as PENDING and「收貨」(completeOrder) will
 * restock inventory automatically, closing the stock loop.
 *
 * Conversion rules (pure, previewable):
 *  - demandQuantity <= 0 → skipped（庫存足夠或數量為 0）
 *  - baseUnit 'pcs'      → skipped（採購單以公斤計量，個數品項請手動建單）
 *  - g / ml              → kg（÷1000，四捨五入到 3 位小數；1 ml ≈ 1 g）
 *
 * After a successful conversion the draft's workflowStatus is set to 'sent'
 * through the existing `updateDraftWorkflowStatus` path. Drafts already
 * 'sent' or 'completed' are refused to prevent double ordering.
 */

import type { Firestore } from 'firebase/firestore';
import {
  getPurchaseDemandDraft,
  updateDraftWorkflowStatus,
} from './purchaseDemandDraftService';
import { purchaseOrderService } from './purchaseOrderService';
import { planDraftConversion, type DraftConversionSkip } from './draftToPurchaseOrderPlanner';

export { planDraftConversion } from './draftToPurchaseOrderPlanner';
export type { DraftConversionPlan, DraftConversionSkip } from './draftToPurchaseOrderPlanner';

export interface DraftConversionResult {
  orderId: string;
  lineCount: number;
  skipped: DraftConversionSkip[];
}

/**
 * Executes the conversion: creates one PENDING purchase order from the
 * draft's convertible lines, then marks the draft workflowStatus = 'sent'.
 */
export async function convertDraftToPurchaseOrder(
  db: Firestore,
  draftId: string,
  uid: string,
): Promise<DraftConversionResult> {
  const draft = await getPurchaseDemandDraft(db, draftId);

  const workflowStatus = draft.workflowStatus ?? 'draft';
  if (workflowStatus === 'sent' || workflowStatus === 'completed') {
    throw new Error(`此草稿已${workflowStatus === 'sent' ? '送採購' : '完成'}，不可重複轉單`);
  }

  const plan = planDraftConversion(draft);
  if (plan.lines.length === 0) {
    throw new Error('沒有可轉換的品項（淨需求皆為 0，或皆為個數單位）');
  }

  const orderId = await purchaseOrderService.createOrder(plan.lines);
  await updateDraftWorkflowStatus(db, draftId, 'sent', uid);

  return { orderId, lineCount: plan.lines.length, skipped: plan.skipped };
}
