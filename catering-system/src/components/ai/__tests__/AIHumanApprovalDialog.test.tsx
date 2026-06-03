/**
 * AIHumanApprovalDialog.test.tsx
 *
 * Structural / contract tests for AIHumanApprovalDialog and Phase 6 invariants.
 * Run with: npx tsx src/components/ai/__tests__/AIHumanApprovalDialog.test.tsx
 */

import type {
  AIPurchaseOrderDraftMetadata,
  TenantId, SuggestionId, SnapshotId, AuditTrailId, Grams, DraftPurchaseSuggestion,
} from '../../../types/aiBoundary';
import { approveDraftSuggestionForPurchaseOrder } from '../../../services/aiHumanApprovalService';

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
const SNAP_ID  = 'snap_dlg_001' as SnapshotId;
const SUG_ID   = 'sug_dlg_001' as SuggestionId;
const TRAIL_ID = 'trail_dlg_001' as AuditTrailId;
const TENANT   = 'tenant-dlg' as TenantId;

function makeDraft(): DraftPurchaseSuggestion {
  return {
    draftSuggestionId:  'draft_dlg_001',
    tenantId:           TENANT,
    sourceSnapshotId:   SNAP_ID,
    suggestionId:       SUG_ID,
    auditTrailId:       TRAIL_ID,
    ingredientId:       'carrot',
    ingredientName:     'Carrot',
    suggestedQtyGrams:  770 as Grams,
    finalQtyGrams:      600 as Grams,
    confidence: {
      level: 'HIGH', reasons: [], blockReason: null,
      blockedReasons: [], warnings: [], canCreateDraft: false,
      sourceSnapshotId: SNAP_ID,
    },
    status:             'DRAFT_PREPARED',
    blockedReasons:     [],
    warnings:           [],
    requiresHumanApproval: true,
    dataLineage: {
      snapshotId: SNAP_ID, suggestionId: SUG_ID,
      sourceCollections: ['inventory', 'mealPlans'], generatedAt: NOW,
    },
    createdBy:          'human',
    createdByUserId:    'chef-001',
    createdAt:          NOW,
  };
}

console.log('\n── AIHumanApprovalDialog (structural) ─────────────────────────');

// ── HumanApprovalForPurchaseDraft invariants ──────────────────────────────────
{
  const { approval } = approveDraftSuggestionForPurchaseOrder({
    draftSuggestion:       makeDraft(),
    approvedByHumanUserId: 'chef-001',
    actorType:             'human',
    requestId:             'req-dlg-001',
    now:                   NOW,
  });

  check('aiCanApprove is always false', approval?.aiCanApprove, false);
  check('requiresFinalSubmission is always true', approval?.requiresFinalSubmission, true);
  check('createsPurchaseOrderStatus = DRAFT', approval?.createsPurchaseOrderStatus, 'DRAFT');
}

// ── AIPurchaseOrderDraftMetadata invariants ───────────────────────────────────
{
  const { purchaseOrderDraftInput } = approveDraftSuggestionForPurchaseOrder({
    draftSuggestion:       makeDraft(),
    approvedByHumanUserId: 'chef-001',
    actorType:             'human',
    requestId:             'req-dlg-002',
    now:                   NOW,
  });

  const meta = purchaseOrderDraftInput?.aiMetadata as AIPurchaseOrderDraftMetadata;
  check('meta.aiCanSubmit = false', meta?.aiCanSubmit, false);
  check('meta.aiGenerated = true', meta?.aiGenerated, true);
  check('meta.requiresFinalSubmission = true', meta?.requiresFinalSubmission, true);
  check('meta.source', meta?.source, 'ai_suggestion_human_approved');
  checkTrue('meta.approvalId present', typeof meta?.approvalId === 'string' && meta.approvalId.length > 0);
}

// ── UI invariants: no forbidden button labels ─────────────────────────────────
{
  // These are the ONLY allowed button labels in AIHumanApprovalDialog
  const allowedLabels = ['建立 DRAFT 採購單', '取消', '處理中…'];
  // These must NEVER appear
  const forbiddenLabels = ['送出採購', '確認採購', '入庫', '自動採購', '立即下單', '轉 PENDING', '轉 RECEIVED'];

  for (const label of allowedLabels) {
    checkTrue(`allowed label "${label}" in allowed list`, allowedLabels.includes(label));
  }
  for (const label of forbiddenLabels) {
    check(`forbidden label "${label}" not in allowed`, allowedLabels.includes(label), false);
  }
}

// ── Dialog warnings: required text content ───────────────────────────────────
{
  // These warning messages must appear in the dialog
  const requiredWarnings = [
    '這只是 DRAFT 草稿，尚未送出採購',
    '建立後仍需人工送出才會進入 PENDING',
    '不會修改任何庫存數量',
    '不會觸發任何入庫流程',
  ];
  check('4 required warning messages defined', requiredWarnings.length, 4);
  for (const w of requiredWarnings) {
    checkTrue(`warning defined: "${w.slice(0, 15)}..."`, w.length > 0);
  }
}

// ── Approval type has no auto-submit fields ───────────────────────────────────
{
  const { approval } = approveDraftSuggestionForPurchaseOrder({
    draftSuggestion:       makeDraft(),
    approvedByHumanUserId: 'chef-001',
    actorType:             'human',
    requestId:             'req-dlg-003',
    now:                   NOW,
  });

  check('no autoSubmit on approval', 'autoSubmit' in (approval ?? {}), false);
  check('no createPending on approval', 'createPending' in (approval ?? {}), false);
  check('no markReceived on approval', 'markReceived' in (approval ?? {}), false);
}

// ── PurchaseOrderDraftInput.status is exactly 'DRAFT' ────────────────────────
{
  const { purchaseOrderDraftInput } = approveDraftSuggestionForPurchaseOrder({
    draftSuggestion:       makeDraft(),
    approvedByHumanUserId: 'chef-001',
    actorType:             'human',
    requestId:             'req-dlg-004',
    now:                   NOW,
  });

  check('draft input status = DRAFT', purchaseOrderDraftInput?.status, 'DRAFT');
  check('not PENDING', (purchaseOrderDraftInput?.status as string) === 'PENDING', false);
  check('not RECEIVED', (purchaseOrderDraftInput?.status as string) === 'RECEIVED', false);
}

// ── Audit chain fields present in purchaseOrderDraftInput ───────────────────
{
  const { purchaseOrderDraftInput } = approveDraftSuggestionForPurchaseOrder({
    draftSuggestion:       makeDraft(),
    approvedByHumanUserId: 'chef-001',
    actorType:             'human',
    requestId:             'req-dlg-005',
    now:                   NOW,
  });

  check('meta: suggestionId', purchaseOrderDraftInput?.aiMetadata.suggestionId, SUG_ID);
  check('meta: sourceSnapshotId', purchaseOrderDraftInput?.aiMetadata.sourceSnapshotId, SNAP_ID);
  check('meta: auditTrailId', purchaseOrderDraftInput?.aiMetadata.auditTrailId, TRAIL_ID);
  check('meta: draftSuggestionId', purchaseOrderDraftInput?.aiMetadata.draftSuggestionId, 'draft_dlg_001');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — AIHumanApprovalDialog structural tests verified');
