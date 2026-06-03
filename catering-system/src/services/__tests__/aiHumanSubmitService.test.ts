/**
 * aiHumanSubmitService.test.ts
 *
 * Validation tests for submitApprovedDraftPurchaseOrderToPending()
 * and validatePurchaseOrderPendingInput().
 * Run with: npx tsx src/services/__tests__/aiHumanSubmitService.test.ts
 */

import {
  submitApprovedDraftPurchaseOrderToPending,
  validatePurchaseOrderPendingInput,
  type PurchaseOrderDraftRecord,
  type PurchaseOrderPendingInput,
} from '../aiHumanSubmitService';
import type {
  TenantId, SuggestionId, SnapshotId, AuditTrailId,
} from '../../types/aiBoundary';

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

const TENANT    = 'tenant-p7' as TenantId;
const SUG_ID    = 'sug_p7_001' as SuggestionId;
const SNAP_ID   = 'snap_p7_001' as SnapshotId;
const TRAIL_ID  = 'trail_p7_001' as AuditTrailId;
const NOW       = new Date('2026-06-03T12:00:00Z');
const PO_ID     = 'po_p7_001';

function makeDraftRecord(overrides: Partial<PurchaseOrderDraftRecord> = {}): PurchaseOrderDraftRecord {
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
      draftSuggestionId:        'draft_p7_001',
      auditTrailId:             TRAIL_ID,
      approvalId:               'appr_p7_001',
    },
    items: [{ ingredientId: 'carrot', name: 'Carrot', purchaseQtyKg: 0.6 }],
    ...overrides,
  };
}

const BASE = { actorType: 'human' as const, requestId: 'req-p7-001', now: NOW };

console.log('\n── aiHumanSubmitService ───────────────────────────────────────');

// ── Happy path ────────────────────────────────────────────────────────────────
{
  const { submit, purchaseOrderPendingInput, auditEvent, blockedReasons } =
    submitApprovedDraftPurchaseOrderToPending({
      ...BASE,
      purchaseOrderDraft:     makeDraftRecord(),
      submittedByHumanUserId: 'chef-001',
    });

  check('happy: no blocked', blockedReasons, []);
  checkTrue('happy: submit present', !!submit);
  check('happy: fromStatus = DRAFT', submit?.fromStatus, 'DRAFT');
  check('happy: toStatus = PENDING', submit?.toStatus, 'PENDING');
  check('happy: aiCanSubmit = false', submit?.aiCanSubmit, false);
  check('happy: aiCanReceive = false', submit?.aiCanReceive, false);
  check('happy: requiresReceivingConfirmation = true', submit?.requiresReceivingConfirmation, true);
  check('happy: submittedByHumanUserId', submit?.submittedByHumanUserId, 'chef-001');
  checkTrue('happy: submitId present', (submit?.submitId ?? '').length > 0);
  check('happy: purchaseOrderId', submit?.purchaseOrderId, PO_ID);
  check('happy: suggestionId', submit?.suggestionId, SUG_ID);
  check('happy: sourceSnapshotId', submit?.sourceSnapshotId, SNAP_ID);
  check('happy: auditTrailId', submit?.auditTrailId, TRAIL_ID);
  check('happy: auditEvent type', auditEvent.eventType, 'PURCHASE_ORDER_PENDING_SUBMITTED');
  check('happy: auditEvent actorType', auditEvent.actorType, 'human');

  // pendingInput
  check('pending input: fromStatus DRAFT', purchaseOrderPendingInput?.fromStatus, 'DRAFT');
  check('pending input: toStatus PENDING', purchaseOrderPendingInput?.toStatus, 'PENDING');
  check('pending input: aiCanSubmit false', purchaseOrderPendingInput?.aiPendingMetadata.aiCanSubmit, false);
  check('pending input: aiCanReceive false', purchaseOrderPendingInput?.aiPendingMetadata.aiCanReceive, false);
  check('pending input: requiresReceiving true', purchaseOrderPendingInput?.aiPendingMetadata.requiresReceivingConfirmation, true);
  check('pending input: source', purchaseOrderPendingInput?.aiPendingMetadata.source, 'ai_suggestion_human_submitted');
  check('pending input: aiGenerated true', purchaseOrderPendingInput?.aiPendingMetadata.aiGenerated, true);
}

// ── Audit event metadata ──────────────────────────────────────────────────────
{
  const { auditEvent } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE,
    purchaseOrderDraft:     makeDraftRecord(),
    submittedByHumanUserId: 'chef-001',
  });
  const meta = auditEvent.metadata as Record<string, unknown>;
  check('audit meta: fromStatus', meta.fromStatus, 'DRAFT');
  check('audit meta: toStatus', meta.toStatus, 'PENDING');
  check('audit meta: requiresReceivingConfirmation', meta.requiresReceivingConfirmation, true);
  check('audit meta: suggestionId', meta.suggestionId, SUG_ID);
  check('audit meta: sourceSnapshotId', meta.sourceSnapshotId, SNAP_ID);
  check('audit meta: auditTrailId', meta.auditTrailId, TRAIL_ID);
  check('audit meta: approvalId', meta.approvalId, 'appr_p7_001');
  check('audit meta: submittedByHumanUserId', meta.submittedByHumanUserId, 'chef-001');
  checkTrue('audit meta: submitId present', typeof meta.submitId === 'string');
}

// ── Missing human submitter → BLOCKED ────────────────────────────────────────
{
  const { blockedReasons } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE,
    purchaseOrderDraft:     makeDraftRecord(),
    submittedByHumanUserId: '',
  });
  checkTrue('missing submitter → MISSING_HUMAN_SUBMITTER', blockedReasons.includes('MISSING_HUMAN_SUBMITTER'));
}

// ── AI caller → BLOCKED ───────────────────────────────────────────────────────
{
  const { blockedReasons, auditEvent } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE,
    actorType:              'ai',
    purchaseOrderDraft:     makeDraftRecord(),
    submittedByHumanUserId: 'ai-service',
  });
  checkTrue('AI caller → AI_PURCHASE_SUBMIT_FORBIDDEN', blockedReasons.includes('AI_PURCHASE_SUBMIT_FORBIDDEN'));
  check('AI caller: blocked audit event', auditEvent.eventType, 'PURCHASE_ORDER_PENDING_BLOCKED');
}

// ── Status not DRAFT → BLOCKED ────────────────────────────────────────────────
{
  const { blockedReasons } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE,
    purchaseOrderDraft:     makeDraftRecord({ status: 'PENDING' }),
    submittedByHumanUserId: 'chef-001',
  });
  checkTrue('not DRAFT → PURCHASE_ORDER_DRAFT_REQUIRED', blockedReasons.includes('PURCHASE_ORDER_DRAFT_REQUIRED'));
}

// ── Missing sourceSnapshotId → BLOCKED ────────────────────────────────────────
{
  const d = makeDraftRecord();
  d.aiMetadata!.sourceSnapshotId = '';
  const { blockedReasons } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE, purchaseOrderDraft: d, submittedByHumanUserId: 'chef-001',
  });
  checkTrue('missing sourceSnapshotId → MISSING_SNAPSHOT_ID', blockedReasons.includes('MISSING_SNAPSHOT_ID'));
}

// ── Missing suggestionId → BLOCKED ───────────────────────────────────────────
{
  const d = makeDraftRecord();
  d.aiMetadata!.suggestionId = '';
  const { blockedReasons } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE, purchaseOrderDraft: d, submittedByHumanUserId: 'chef-001',
  });
  checkTrue('missing suggestionId → MISSING_DRAFT_SUGGESTION_ID', blockedReasons.includes('MISSING_DRAFT_SUGGESTION_ID'));
}

// ── Missing draftSuggestionId → BLOCKED ──────────────────────────────────────
{
  const d = makeDraftRecord();
  d.aiMetadata!.draftSuggestionId = '';
  const { blockedReasons } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE, purchaseOrderDraft: d, submittedByHumanUserId: 'chef-001',
  });
  checkTrue('missing draftSuggestionId → MISSING_DRAFT_SUGGESTION_ID', blockedReasons.includes('MISSING_DRAFT_SUGGESTION_ID'));
}

// ── Missing auditTrailId → BLOCKED ───────────────────────────────────────────
{
  const d = makeDraftRecord();
  d.aiMetadata!.auditTrailId = '';
  const { blockedReasons } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE, purchaseOrderDraft: d, submittedByHumanUserId: 'chef-001',
  });
  checkTrue('missing auditTrailId → MISSING_AUDIT_TRAIL_ID', blockedReasons.includes('MISSING_AUDIT_TRAIL_ID'));
}

// ── Missing approvalId → BLOCKED ─────────────────────────────────────────────
{
  const d = makeDraftRecord();
  d.aiMetadata!.approvalId = '';
  const { blockedReasons } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE, purchaseOrderDraft: d, submittedByHumanUserId: 'chef-001',
  });
  checkTrue('missing approvalId → MISSING_APPROVAL_ID', blockedReasons.includes('MISSING_APPROVAL_ID'));
}

// ── Never creates RECEIVED ────────────────────────────────────────────────────
{
  const { purchaseOrderPendingInput } = submitApprovedDraftPurchaseOrderToPending({
    ...BASE, purchaseOrderDraft: makeDraftRecord(), submittedByHumanUserId: 'chef-001',
  });
  check('toStatus is PENDING not RECEIVED', purchaseOrderPendingInput?.toStatus, 'PENDING');
  check('never RECEIVED', (purchaseOrderPendingInput?.toStatus as string) === 'RECEIVED', false);
}

// ── Does NOT modify inventory ─────────────────────────────────────────────────
{
  const result = submitApprovedDraftPurchaseOrderToPending({
    ...BASE, purchaseOrderDraft: makeDraftRecord(), submittedByHumanUserId: 'chef-001',
  });
  check('sync: not a Promise', result instanceof Promise, false);
  check('no inventoryUpdate field', 'inventoryUpdate' in result, false);
  check('no currentStock field', 'currentStock' in result, false);
}

// ── validatePurchaseOrderPendingInput ─────────────────────────────────────────
{
  function makeValidPendingInput(): PurchaseOrderPendingInput {
    return {
      purchaseOrderId:        PO_ID,
      fromStatus:             'DRAFT',
      toStatus:               'PENDING',
      submittedByHumanUserId: 'chef-001',
      aiPendingMetadata: {
        source:                       'ai_suggestion_human_submitted',
        tenantId:                     TENANT,
        sourceSnapshotId:             SNAP_ID,
        suggestionId:                 SUG_ID,
        draftSuggestionId:            'draft_p7_001',
        auditTrailId:                 TRAIL_ID,
        approvalId:                   'appr_p7_001',
        submitId:                     'sub_p7_001',
        submittedByHumanUserId:       'chef-001',
        submittedAt:                  NOW,
        requiresReceivingConfirmation: true,
        aiGenerated:                  true,
        aiCanSubmit:                  false,
        aiCanReceive:                 false,
      },
    };
  }

  check('valid pending input: no errors', validatePurchaseOrderPendingInput(makeValidPendingInput()), []);

  // toStatus RECEIVED → blocked
  const received = { ...makeValidPendingInput(), toStatus: 'RECEIVED' as never };
  const receivedErrors = validatePurchaseOrderPendingInput(received);
  checkTrue('RECEIVED → PURCHASE_ORDER_PENDING_ONLY', receivedErrors.includes('PURCHASE_ORDER_PENDING_ONLY'));
  checkTrue('RECEIVED → PURCHASE_ORDER_RECEIVED_FORBIDDEN', receivedErrors.includes('PURCHASE_ORDER_RECEIVED_FORBIDDEN'));

  // Missing submitter
  const noSub = { ...makeValidPendingInput(), submittedByHumanUserId: '' };
  checkTrue('missing submitter → MISSING_HUMAN_SUBMITTER', validatePurchaseOrderPendingInput(noSub).includes('MISSING_HUMAN_SUBMITTER'));

  // aiCanSubmit true → blocked
  const aiSub = {
    ...makeValidPendingInput(),
    aiPendingMetadata: { ...makeValidPendingInput().aiPendingMetadata, aiCanSubmit: true as never },
  };
  checkTrue('aiCanSubmit true → AI_PURCHASE_SUBMIT_FORBIDDEN', validatePurchaseOrderPendingInput(aiSub).includes('AI_PURCHASE_SUBMIT_FORBIDDEN'));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiHumanSubmitService verified');
