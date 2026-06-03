/**
 * aiHumanApprovalService.test.ts
 *
 * Validation tests for approveDraftSuggestionForPurchaseOrder()
 * and validatePurchaseOrderDraftInput().
 * Run with: npx tsx src/services/__tests__/aiHumanApprovalService.test.ts
 */

import {
  approveDraftSuggestionForPurchaseOrder,
  validatePurchaseOrderDraftInput,
  type PurchaseOrderDraftInput,
} from '../aiHumanApprovalService';
import type {
  TenantId, SuggestionId, SnapshotId, AuditTrailId, Grams,
  DraftPurchaseSuggestion, ConfidenceLevel,
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

const TENANT    = 'tenant-p6' as TenantId;
const SUG_ID    = 'sug_p6_001' as SuggestionId;
const SNAP_ID   = 'snap_p6_001' as SnapshotId;
const TRAIL_ID  = 'trail_p6_001' as AuditTrailId;
const NOW       = new Date('2026-06-03T12:00:00Z');

function makeDraft(level: ConfidenceLevel = 'HIGH', status: DraftPurchaseSuggestion['status'] = 'DRAFT_PREPARED'): DraftPurchaseSuggestion {
  return {
    draftSuggestionId:  'draft_p6_001',
    tenantId:           TENANT,
    sourceSnapshotId:   SNAP_ID,
    suggestionId:       SUG_ID,
    auditTrailId:       TRAIL_ID,
    ingredientId:       'carrot',
    ingredientName:     'Carrot',
    suggestedQtyGrams:  770 as Grams,
    finalQtyGrams:      600 as Grams,
    confidence: {
      level, reasons: [], blockReason: level === 'BLOCKED' ? 'UNVERIFIED_OCR_SOURCE' : null,
      blockedReasons: level === 'BLOCKED' ? ['UNVERIFIED_OCR_SOURCE'] : [],
      warnings: [], canCreateDraft: false, sourceSnapshotId: SNAP_ID,
    },
    status,
    blockedReasons:       status === 'BLOCKED' ? ['DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED'] : [],
    warnings:             [],
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

const BASE = { actorType: 'human' as const, requestId: 'req-p6-001', now: NOW };

console.log('\n── aiHumanApprovalService ─────────────────────────────────────');

// ── HIGH + human → approval created ──────────────────────────────────────────
{
  const { approval, purchaseOrderDraftInput, auditEvent, blockedReasons } =
    approveDraftSuggestionForPurchaseOrder({
      ...BASE,
      draftSuggestion: makeDraft('HIGH'),
      approvedByHumanUserId: 'chef-001',
    });

  check('HIGH: no blockedReasons', blockedReasons, []);
  checkTrue('HIGH: approval present', !!approval);
  check('HIGH: aiCanApprove = false', approval?.aiCanApprove, false);
  check('HIGH: requiresFinalSubmission = true', approval?.requiresFinalSubmission, true);
  check('HIGH: createsPurchaseOrderStatus = DRAFT', approval?.createsPurchaseOrderStatus, 'DRAFT');
  check('HIGH: approvedByHumanUserId', approval?.approvedByHumanUserId, 'chef-001');
  check('HIGH: tenantId', approval?.tenantId, TENANT);
  check('HIGH: suggestionId', approval?.suggestionId, SUG_ID);
  check('HIGH: sourceSnapshotId', approval?.sourceSnapshotId, SNAP_ID);
  check('HIGH: auditTrailId', approval?.auditTrailId, TRAIL_ID);
  checkTrue('HIGH: approvalId present', (approval?.approvalId ?? '').length > 0);
  check('HIGH: auditEvent PURCHASE_ORDER_DRAFT_CREATED', auditEvent.eventType, 'PURCHASE_ORDER_DRAFT_CREATED');
  check('HIGH: auditEvent actorType = human', auditEvent.actorType, 'human');

  // purchaseOrderDraftInput
  check('draft input: status = DRAFT', purchaseOrderDraftInput?.status, 'DRAFT');
  check('draft input: aiCanSubmit = false', purchaseOrderDraftInput?.aiMetadata.aiCanSubmit, false);
  check('draft input: requiresFinalSubmission = true', purchaseOrderDraftInput?.aiMetadata.requiresFinalSubmission, true);
  check('draft input: source', purchaseOrderDraftInput?.aiMetadata.source, 'ai_suggestion_human_approved');
  check('draft input: aiGenerated = true', purchaseOrderDraftInput?.aiMetadata.aiGenerated, true);
  check('draft input: approvedQtyGrams = 600', purchaseOrderDraftInput?.approvedQtyGrams, 600);
}

// ── MEDIUM + human → approval created ────────────────────────────────────────
{
  const { blockedReasons, purchaseOrderDraftInput } =
    approveDraftSuggestionForPurchaseOrder({
      ...BASE,
      draftSuggestion: makeDraft('MEDIUM'),
      approvedByHumanUserId: 'chef-001',
    });
  check('MEDIUM: no blocked', blockedReasons, []);
  check('MEDIUM: status DRAFT', purchaseOrderDraftInput?.status, 'DRAFT');
}

// ── Audit event metadata ──────────────────────────────────────────────────────
{
  const { auditEvent } = approveDraftSuggestionForPurchaseOrder({
    ...BASE,
    draftSuggestion: makeDraft('HIGH'),
    approvedByHumanUserId: 'chef-001',
  });
  const meta = auditEvent.metadata as Record<string, unknown>;
  check('audit meta: status DRAFT', meta.status, 'DRAFT');
  check('audit meta: requiresFinalSubmission', meta.requiresFinalSubmission, true);
  check('audit meta: suggestionId', meta.suggestionId, SUG_ID);
  check('audit meta: sourceSnapshotId', meta.sourceSnapshotId, SNAP_ID);
  check('audit meta: auditTrailId', meta.auditTrailId, TRAIL_ID);
  check('audit meta: approvedByHumanUserId', meta.approvedByHumanUserId, 'chef-001');
  checkTrue('audit meta: approvalId present', typeof meta.approvalId === 'string');
}

// ── Missing human approver → BLOCKED ─────────────────────────────────────────
{
  const { blockedReasons } = approveDraftSuggestionForPurchaseOrder({
    ...BASE,
    draftSuggestion: makeDraft(),
    approvedByHumanUserId: '',
  });
  checkTrue('missing approver → MISSING_HUMAN_APPROVER', blockedReasons.includes('MISSING_HUMAN_APPROVER'));
}

// ── AI caller → BLOCKED ───────────────────────────────────────────────────────
{
  const { blockedReasons, auditEvent } = approveDraftSuggestionForPurchaseOrder({
    ...BASE,
    actorType: 'ai',
    draftSuggestion: makeDraft(),
    approvedByHumanUserId: 'ai-service',
  });
  checkTrue('AI caller → AI_PURCHASE_APPROVAL_FORBIDDEN', blockedReasons.includes('AI_PURCHASE_APPROVAL_FORBIDDEN'));
  check('AI caller: blocked audit event', auditEvent.eventType, 'PURCHASE_ORDER_DRAFT_BLOCKED');
}

// ── BLOCKED draft status → BLOCKED ───────────────────────────────────────────
{
  const { blockedReasons } = approveDraftSuggestionForPurchaseOrder({
    ...BASE,
    draftSuggestion: makeDraft('BLOCKED', 'BLOCKED'),
    approvedByHumanUserId: 'chef-001',
  });
  checkTrue('BLOCKED draft → DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED',
    blockedReasons.includes('DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED'));
}

// ── LOW confidence → BLOCKED ──────────────────────────────────────────────────
{
  const { blockedReasons } = approveDraftSuggestionForPurchaseOrder({
    ...BASE,
    draftSuggestion: makeDraft('LOW'),
    approvedByHumanUserId: 'chef-001',
  });
  checkTrue('LOW confidence → DRAFT_FROM_LOW_CONFIDENCE_BLOCKED',
    blockedReasons.includes('DRAFT_FROM_LOW_CONFIDENCE_BLOCKED'));
}

// ── Missing sourceSnapshotId → BLOCKED ───────────────────────────────────────
{
  const d = { ...makeDraft(), sourceSnapshotId: '' as SnapshotId };
  const { blockedReasons } = approveDraftSuggestionForPurchaseOrder({
    ...BASE, draftSuggestion: d, approvedByHumanUserId: 'chef-001',
  });
  checkTrue('missing sourceSnapshotId → MISSING_SNAPSHOT_ID', blockedReasons.includes('MISSING_SNAPSHOT_ID'));
}

// ── Missing auditTrailId → BLOCKED ───────────────────────────────────────────
{
  const d = { ...makeDraft(), auditTrailId: '' as AuditTrailId };
  const { blockedReasons } = approveDraftSuggestionForPurchaseOrder({
    ...BASE, draftSuggestion: d, approvedByHumanUserId: 'chef-001',
  });
  checkTrue('missing auditTrailId → MISSING_AUDIT_TRAIL_ID', blockedReasons.includes('MISSING_AUDIT_TRAIL_ID'));
}

// ── Approval never creates PENDING or RECEIVED ────────────────────────────────
{
  const { purchaseOrderDraftInput } = approveDraftSuggestionForPurchaseOrder({
    ...BASE, draftSuggestion: makeDraft(), approvedByHumanUserId: 'chef-001',
  });
  check('never PENDING', (purchaseOrderDraftInput?.status as string) === 'PENDING', false);
  check('never RECEIVED', (purchaseOrderDraftInput?.status as string) === 'RECEIVED', false);
  check('always DRAFT', purchaseOrderDraftInput?.status, 'DRAFT');
}

// ── Does NOT call purchaseOrderService or inventoryService ────────────────────
{
  const result = approveDraftSuggestionForPurchaseOrder({
    ...BASE, draftSuggestion: makeDraft(), approvedByHumanUserId: 'chef-001',
  });
  check('sync: not a Promise', result instanceof Promise, false);
  check('no purchaseOrderId on result', 'purchaseOrderId' in result, false);
  check('no inventoryWrite on result', 'inventoryWrite' in result, false);
}

// ── validatePurchaseOrderDraftInput ──────────────────────────────────────────
{
  function makeValidInput(): PurchaseOrderDraftInput {
    return {
      status: 'DRAFT',
      tenantId: TENANT,
      ingredientId: 'carrot',
      approvedQtyGrams: 600 as Grams,
      notes: 'test',
      aiMetadata: {
        source: 'ai_suggestion_human_approved',
        tenantId: TENANT,
        sourceSnapshotId: SNAP_ID,
        suggestionId: SUG_ID,
        draftSuggestionId: 'draft_p6_001',
        auditTrailId: TRAIL_ID,
        approvalId: 'appr_001',
        approvedByHumanUserId: 'chef-001',
        approvedAt: NOW,
        requiresFinalSubmission: true,
        aiGenerated: true,
        aiCanSubmit: false,
      },
    };
  }

  check('valid input: no errors', validatePurchaseOrderDraftInput(makeValidInput()), []);

  // Status not DRAFT → blocked
  const notDraft = { ...makeValidInput(), status: 'PENDING' as never };
  const notDraftErrors = validatePurchaseOrderDraftInput(notDraft);
  checkTrue('not DRAFT → PURCHASE_ORDER_DRAFT_ONLY', notDraftErrors.includes('PURCHASE_ORDER_DRAFT_ONLY'));
  checkTrue('PENDING → PURCHASE_ORDER_PENDING_FORBIDDEN', notDraftErrors.includes('PURCHASE_ORDER_PENDING_FORBIDDEN'));

  // Missing human approver
  const noApprover = { ...makeValidInput(), aiMetadata: { ...makeValidInput().aiMetadata, approvedByHumanUserId: '' } };
  checkTrue('missing approver → MISSING_HUMAN_APPROVER', validatePurchaseOrderDraftInput(noApprover).includes('MISSING_HUMAN_APPROVER'));

  // aiCanSubmit true → blocked
  const aiSubmit = { ...makeValidInput(), aiMetadata: { ...makeValidInput().aiMetadata, aiCanSubmit: true as never } };
  checkTrue('aiCanSubmit true → AI_PURCHASE_SUBMIT_FORBIDDEN', validatePurchaseOrderDraftInput(aiSubmit).includes('AI_PURCHASE_SUBMIT_FORBIDDEN'));

  // Missing auditTrailId
  const noTrail = { ...makeValidInput(), aiMetadata: { ...makeValidInput().aiMetadata, auditTrailId: '' as AuditTrailId } };
  checkTrue('missing auditTrailId → MISSING_AUDIT_TRAIL_ID', validatePurchaseOrderDraftInput(noTrail).includes('MISSING_AUDIT_TRAIL_ID'));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiHumanApprovalService verified');
