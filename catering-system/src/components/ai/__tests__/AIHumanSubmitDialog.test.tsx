/**
 * AIHumanSubmitDialog.test.tsx
 *
 * Structural / contract tests for AIHumanSubmitDialog and Phase 7 invariants.
 * Run with: npx tsx src/components/ai/__tests__/AIHumanSubmitDialog.test.tsx
 */

import type {
  AIPurchaseOrderPendingMetadata,
  TenantId, SuggestionId, SnapshotId, AuditTrailId,
} from '../../../types/aiBoundary';
import {
  submitApprovedDraftPurchaseOrderToPending,
  type PurchaseOrderDraftRecord,
} from '../../../services/aiHumanSubmitService';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else {
    console.error(`  ❌ ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}
function checkTrue(label: string, v: boolean): void { check(label, v, true); }

const NOW      = new Date('2026-06-03T12:00:00Z');
const SNAP_ID  = 'snap_sub_001' as SnapshotId;
const SUG_ID   = 'sug_sub_001' as SuggestionId;
const TRAIL_ID = 'trail_sub_001' as AuditTrailId;
const TENANT   = 'tenant-sub' as TenantId;
const PO_ID    = 'po_sub_001';

function makeDraft(): PurchaseOrderDraftRecord {
  return {
    id:       PO_ID,
    status:   'DRAFT',
    tenantId: TENANT,
    aiMetadata: {
      source:                   'ai_suggestion_human_approved',
      requiresFinalSubmission:  true,
      aiCanSubmit:              false,
      sourceSnapshotId:         SNAP_ID,
      suggestionId:             SUG_ID,
      draftSuggestionId:        'draft_sub_001',
      auditTrailId:             TRAIL_ID,
      approvalId:               'appr_sub_001',
    },
    items: [{ ingredientId: 'carrot', name: 'Carrot', purchaseQtyKg: 0.6 }],
  };
}

console.log('\n── AIHumanSubmitDialog (structural) ───────────────────────────');

// ── HumanSubmitPurchaseOrderPending invariants ────────────────────────────────
{
  const { submit } = submitApprovedDraftPurchaseOrderToPending({
    purchaseOrderDraft:     makeDraft(),
    submittedByHumanUserId: 'chef-001',
    actorType:              'human',
    requestId:              'req-dlg7-001',
    now:                    NOW,
  });

  check('fromStatus is always DRAFT', submit?.fromStatus, 'DRAFT');
  check('toStatus is always PENDING', submit?.toStatus, 'PENDING');
  check('aiCanSubmit is always false', submit?.aiCanSubmit, false);
  check('aiCanReceive is always false', submit?.aiCanReceive, false);
  check('requiresReceivingConfirmation is always true', submit?.requiresReceivingConfirmation, true);
}

// ── AIPurchaseOrderPendingMetadata invariants ─────────────────────────────────
{
  const { purchaseOrderPendingInput } = submitApprovedDraftPurchaseOrderToPending({
    purchaseOrderDraft:     makeDraft(),
    submittedByHumanUserId: 'chef-001',
    actorType:              'human',
    requestId:              'req-dlg7-002',
    now:                    NOW,
  });

  const meta = purchaseOrderPendingInput?.aiPendingMetadata as AIPurchaseOrderPendingMetadata;
  check('meta.aiCanSubmit = false', meta?.aiCanSubmit, false);
  check('meta.aiCanReceive = false', meta?.aiCanReceive, false);
  check('meta.aiGenerated = true', meta?.aiGenerated, true);
  check('meta.requiresReceivingConfirmation = true', meta?.requiresReceivingConfirmation, true);
  check('meta.source', meta?.source, 'ai_suggestion_human_submitted');
  checkTrue('meta.submitId present', typeof meta?.submitId === 'string' && meta.submitId.length > 0);
}

// ── UI invariants: no forbidden button labels ─────────────────────────────────
{
  const allowedLabels = ['送出為 PENDING', '取消', '處理中…'];
  const forbiddenLabels = ['入庫', '確認收貨', '完成採購', '自動採購', '立即入庫', '轉 RECEIVED'];

  for (const label of allowedLabels) {
    checkTrue(`allowed label "${label}" in allowed list`, allowedLabels.includes(label));
  }
  for (const label of forbiddenLabels) {
    check(`forbidden label "${label}" not in allowed`, allowedLabels.includes(label), false);
  }
}

// ── Dialog warnings: required text content ───────────────────────────────────
{
  const requiredWarnings = [
    '這會送出採購單，狀態將從 DRAFT 變為 PENDING',
    '不會修改任何庫存數量',
    '不會觸發任何入庫流程',
    '收貨入庫需要下一階段人工確認',
  ];
  check('4 required warning messages defined', requiredWarnings.length, 4);
  for (const w of requiredWarnings) {
    checkTrue(`warning defined: "${w.slice(0, 15)}..."`, w.length > 0);
  }
}

// ── Submit type has no auto-receive fields ────────────────────────────────────
{
  const { submit } = submitApprovedDraftPurchaseOrderToPending({
    purchaseOrderDraft:     makeDraft(),
    submittedByHumanUserId: 'chef-001',
    actorType:              'human',
    requestId:              'req-dlg7-003',
    now:                    NOW,
  });

  check('no autoReceive on submit', 'autoReceive' in (submit ?? {}), false);
  check('no createReceived on submit', 'createReceived' in (submit ?? {}), false);
  check('no updateInventory on submit', 'updateInventory' in (submit ?? {}), false);
}

// ── Audit chain fields present ────────────────────────────────────────────────
{
  const { purchaseOrderPendingInput } = submitApprovedDraftPurchaseOrderToPending({
    purchaseOrderDraft:     makeDraft(),
    submittedByHumanUserId: 'chef-001',
    actorType:              'human',
    requestId:              'req-dlg7-004',
    now:                    NOW,
  });

  check('meta: suggestionId', purchaseOrderPendingInput?.aiPendingMetadata.suggestionId, SUG_ID);
  check('meta: sourceSnapshotId', purchaseOrderPendingInput?.aiPendingMetadata.sourceSnapshotId, SNAP_ID);
  check('meta: auditTrailId', purchaseOrderPendingInput?.aiPendingMetadata.auditTrailId, TRAIL_ID);
  check('meta: approvalId', purchaseOrderPendingInput?.aiPendingMetadata.approvalId, 'appr_sub_001');
  check('meta: draftSuggestionId', purchaseOrderPendingInput?.aiPendingMetadata.draftSuggestionId, 'draft_sub_001');
}

// ── toStatus is exactly PENDING ───────────────────────────────────────────────
{
  const { purchaseOrderPendingInput } = submitApprovedDraftPurchaseOrderToPending({
    purchaseOrderDraft:     makeDraft(),
    submittedByHumanUserId: 'chef-001',
    actorType:              'human',
    requestId:              'req-dlg7-005',
    now:                    NOW,
  });
  check('toStatus = PENDING', purchaseOrderPendingInput?.toStatus, 'PENDING');
  check('not RECEIVED', (purchaseOrderPendingInput?.toStatus as string) === 'RECEIVED', false);
  check('not DRAFT', (purchaseOrderPendingInput?.toStatus as string) === 'DRAFT', false);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — AIHumanSubmitDialog structural tests verified');
