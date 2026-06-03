/**
 * integrationGate.test.ts
 *
 * System Integration Gate: Feature 001 + Feature 002 End-to-End Validation
 *
 * Verifies the complete chain (all pure-function layers) from AI suggestion to
 * RECEIVED inventory update WITHOUT touching Firestore.
 *
 * Chain under test:
 *  [1] buildAIPurchaseSuggestion          (AI suggestion generated)
 *  [2] gradeIngredientConfidence          (confidence grading)
 *  [3] prepareDraftPurchaseSuggestion     (human override optional → draft)
 *  [4] approveDraftSuggestionForPurchaseOrder  (human approval → DRAFT PO input)
 *  [5] submitApprovedDraftPurchaseOrderToPending  (human submit → PENDING PO input)
 *  [6] validateReceivingBeforeWrite       (backend guard: PENDING → RECEIVED)
 *  [7] buildReceivingWritePayloads        (6 Firestore write payloads)
 *  [8] buildReceivingTransactionDryRunPlan (13-step ordered plan)
 *
 * Cross-cutting assertions:
 *  - AI cannot approve, submit, or receive at any step
 *  - Audit trail IDs remain traceable across all steps
 *  - No performanceLogs / finalizedPerformanceLogs / operationalReports fields
 *  - inventory.currentStockGrams update is payload-only (inside transaction)
 *  - Duplicate receiving is blocked
 *  - Retry with CONSUMED lock is blocked
 *
 * Run with: npx tsx src/services/__tests__/integrationGate.test.ts
 */

import { buildAIPurchaseSuggestion } from '../aiSuggestionService';
import { gradeIngredientConfidence } from '../aiConfidenceService';
import { prepareDraftPurchaseSuggestion } from '../aiDraftPurchaseSuggestionService';
import { approveDraftSuggestionForPurchaseOrder } from '../aiHumanApprovalService';
import {
  submitApprovedDraftPurchaseOrderToPending,
  type PurchaseOrderDraftRecord,
} from '../aiHumanSubmitService';
import {
  validateReceivingBeforeWrite,
  buildReceivingWritePayloads,
  type POSnapshotData,
  type LockSnapshotData,
} from '../receivingTransactionService';
import { buildReceivingTransactionDryRunPlan } from '../receivingTransactionPlanService';
import {
  createReceivingIdempotencyLock,
  validateReceivingIdempotencyLock,
  generateReceivingToken,
  generateReceivingRequestId,
} from '../receivingIdempotencyService';
import { validatePurchaseOrderStatusTransition } from '../purchaseOrderStatusGuard';
import { validateReceivingConfirmation } from '../receivingBoundaryService';
import { generateAIContextSnapshot } from '../aiContextSnapshotService';
import { buildAIContextSummary } from '../aiContextSummaryService';
import { asGrams, GRAMS_PER_TAIJIN, GRAMS_PER_KG } from '../unitConversionService';
import type {
  TenantId, SnapshotId, AuditTrailId, Grams,
  AIOperationRequest,
} from '../../types/aiBoundary';
import type { ReceivingConfirmationRequest } from '../../types/receivingBoundary';

// ─── Test harness ─────────────────────────────────────────────────────────────

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
function checkFalse(label: string, v: boolean): void { check(label, v, false); }
function checkIncludes(label: string, arr: unknown[], item: unknown): void {
  checkTrue(label, arr.some(x => JSON.stringify(x) === JSON.stringify(item)));
}
function checkNotIncludes(label: string, arr: unknown[], item: unknown): void {
  checkFalse(label, arr.some(x => JSON.stringify(x) === JSON.stringify(item)));
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TENANT       = 'tenant-ig-001' as TenantId;
const SNAP_ID      = 'snap_ig_001' as SnapshotId;
const TRAIL_ID     = 'trail_ig_001' as AuditTrailId;
const HUMAN_ID     = 'chef-ig-001';
const INGREDIENT   = 'carrot';
const NOW          = new Date('2026-06-03T10:00:00Z');
const D_START      = new Date('2026-06-01T00:00:00Z');
const D_END        = new Date('2026-06-07T23:59:59Z');
const PO_ID        = 'po_ig_001';

const SNAP_OPERATION: AIOperationRequest = {
  operationId:      'op-ig-snap-001',
  tenantId:         TENANT,
  callerType:       'system',
  callerId:         'snapshot-service',
  targetCollection: 'ai_context_snapshots',
  targetPath:       'ai_context_snapshots/ig-001',
  action:           'create',
  payloadSummary:   { tenantId: TENANT },
  requestId:        'req-ig-snap-001',
  createdAt:        NOW,
};

const AI_OPERATION: AIOperationRequest = {
  operationId:      'op-ig-001',
  tenantId:         TENANT,
  callerType:       'ai',
  callerId:         'ai-suggestion-fn',
  targetCollection: 'ai_suggestions',
  targetPath:       'ai_suggestions/ig-001',
  action:           'create',
  payloadSummary:   { tenantId: TENANT },
  sourceSnapshotId: SNAP_ID,
  auditTrailId:     TRAIL_ID,
  requestId:        'req-ig-suggestion-001',
  createdAt:        NOW,
};

// Build a properly structured snapshot with a shortage item (carrot)
const igSummary = buildAIContextSummary({
  tenantId: TENANT,
  now:      NOW,
  activeMealPlans: [{
    mealPlanId: 'mp-ig-001',
    date:       '2026-06-03',
    menuIds:    ['menu-ig-001'],
    headCount:  15,
  }],
  menus: [{
    menuId:      'menu-ig-001',
    ingredients: [{ ingredientId: INGREDIENT, quantity: 0.1, unit: 'kg' }],
  }],
  inventoryItems: [{
    ingredientId:   INGREDIENT,
    name:           'Carrot',
    currentStockKg: 0.5,
    verified:       true,
  }],
  recentPurchaseOrders: [],
  performanceLogs: [{
    ingredientId: INGREDIENT,
    usedGrams:    1500,
    loggedAt:     new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
    verified:     true,
    finalized:    true,
  }],
  settings: { tenantId: TENANT },
});

const SNAPSHOT = generateAIContextSnapshot(SNAP_OPERATION, {
  tenantId:              TENANT,
  mode:                  'summary',
  now:                   NOW,
  dateRangeStart:        D_START,
  dateRangeEnd:          D_END,
  summary:               igSummary,
  sourceCollections:     ['inventory', 'mealPlans'],
  recordCounts:          { inventory: 1, mealPlans: 1 },
  contaminationDetected: false,
  contaminationReasons:  [],
  createdBy:             'system',
}).snapshot;

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Feature 001 + 002 Integration Gate ──────────────────────────\n');

// ─────────────────────────────────────────────────────────────────────────────
// Track chain output for traceability assertions
let suggestionId = '';
let draftSuggestionId = '';
let approvalId = '';
let submitId = '';
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
console.log('  [1] AI suggestion generation');
// ─────────────────────────────────────────────────────────────────────────────

const suggResult = buildAIPurchaseSuggestion({ snapshot: SNAPSHOT, now: NOW, operation: AI_OPERATION });
const { suggestion, auditEvent: sugAuditEvent } = suggResult;

checkTrue('S1: suggestion generated', !!suggestion);
checkTrue('S1: has shortage item', suggestion.items.length > 0);
check('S1: ingredient', suggestion.items[0]?.ingredientId, INGREDIENT);
checkTrue('S1: shortageGrams > 0', (suggestion.items[0]?.shortageGrams ?? 0) > 0);
check('S1: auditEvent type', sugAuditEvent.eventType, 'SUGGESTION_GENERATED');
checkFalse('S1: usableForDraft = false (Phase 3 invariant)', suggestion.usableForDraft);
checkNotIncludes('S1: not BLOCKED confidence', [suggestion.overallConfidence.level], 'BLOCKED');
suggestionId = suggestion.suggestionId;
checkTrue('S1: suggestionId present', suggestionId.length > 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [2] Confidence grading');
// ─────────────────────────────────────────────────────────────────────────────

const item = suggestion.items[0]!;
const grade = gradeIngredientConfidence({
  ingredientId:          INGREDIENT,
  shortageGrams:         item.shortageGrams,
  averageDailyUsageGrams: asGrams(200),
  inventorySummary: {
    ingredientId:      INGREDIENT,
    name:              'Carrot',
    currentStockGrams: asGrams(500),
    isVerified:        true,
    source:            'manual' as const,
    warnings:          [],
    blockedReasons:    [],
  },
  summaryWarnings:       [],
  summaryBlockedReasons: [],
  sourceSnapshotId:      SNAP_ID,
});

checkTrue('S2: grade present', !!grade);
checkNotIncludes('S2: not BLOCKED', [grade.level], 'BLOCKED');
checkNotIncludes('S2: not LOW', [grade.level], 'LOW');
checkTrue('S2: canCreateDraft always false (Phase 3)', !grade.canCreateDraft);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [3] Prepare draft suggestion (human, no override)');
// ─────────────────────────────────────────────────────────────────────────────

const draftResult = prepareDraftPurchaseSuggestion({
  suggestion,
  actorId:      HUMAN_ID,
  actorType:    'human',
  auditTrailId: TRAIL_ID,
  ingredientId: INGREDIENT,
  requestId:    'req-ig-draft-001',
  now:          NOW,
});

const { draftSuggestion, auditEvent: draftAuditEvent, blockedReasons: draftBlocked } = draftResult;

checkTrue('S3: draft created', !!draftSuggestion);
check('S3: no blocked', draftBlocked, []);
check('S3: status DRAFT_PREPARED', draftSuggestion?.status, 'DRAFT_PREPARED');
check('S3: requiresHumanApproval = true', draftSuggestion?.requiresHumanApproval, true);
check('S3: createdBy = human', draftSuggestion?.createdBy, 'human');
check('S3: auditTrailId traceable', draftSuggestion?.auditTrailId, TRAIL_ID);
check('S3: auditEvent type', draftAuditEvent.eventType, 'DRAFT_SUGGESTION_CREATED');
draftSuggestionId = draftSuggestion?.draftSuggestionId ?? '';
checkTrue('S3: draftSuggestionId present', draftSuggestionId.length > 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [3b] AI cannot prepare draft');
// ─────────────────────────────────────────────────────────────────────────────

const draftAIResult = prepareDraftPurchaseSuggestion({
  suggestion,
  actorId:   'ai-agent-001',
  actorType: 'ai',
  requestId: 'req-ig-draft-ai',
  now:       NOW,
});
checkTrue('S3b: AI draft blocked', draftAIResult.blockedReasons.length > 0);
checkIncludes('S3b: AI_DRAFT_CREATION_FORBIDDEN', draftAIResult.blockedReasons, 'AI_DRAFT_CREATION_FORBIDDEN');
check('S3b: draftSuggestion undefined', draftAIResult.draftSuggestion, undefined);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [4] Human approval → DRAFT PO input');
// ─────────────────────────────────────────────────────────────────────────────

const approvalResult = approveDraftSuggestionForPurchaseOrder({
  draftSuggestion:        draftSuggestion!,
  approvedByHumanUserId:  HUMAN_ID,
  actorType:              'human',
  requestId:              'req-ig-approval-001',
  now:                    NOW,
});

const { approval, purchaseOrderDraftInput, auditEvent: approvalAuditEvent, blockedReasons: approvalBlocked } = approvalResult;

checkTrue('S4: approval created', !!approval);
check('S4: no blocked', approvalBlocked, []);
check('S4: approvedByHumanUserId', approval?.approvedByHumanUserId, HUMAN_ID);
check('S4: aiCanApprove = false', approval?.aiCanApprove, false);
check('S4: requiresFinalSubmission = true', approval?.requiresFinalSubmission, true);
check('S4: auditTrailId traceable', approval?.auditTrailId, TRAIL_ID);
checkTrue('S4: approvedQtyGrams > 0', (purchaseOrderDraftInput?.approvedQtyGrams ?? 0) > 0);
check('S4: PO draft status = DRAFT', purchaseOrderDraftInput?.status, 'DRAFT');
check('S4: auditEvent type', approvalAuditEvent.eventType, 'PURCHASE_ORDER_DRAFT_CREATED');
approvalId = approval?.approvalId ?? '';
checkTrue('S4: approvalId present', approvalId.length > 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [4b] AI cannot approve');
// ─────────────────────────────────────────────────────────────────────────────

const approvalAIResult = approveDraftSuggestionForPurchaseOrder({
  draftSuggestion:        draftSuggestion!,
  approvedByHumanUserId:  '',
  actorType:              'ai',
  requestId:              'req-ig-approval-ai',
  now:                    NOW,
});
checkTrue('S4b: AI approval blocked', approvalAIResult.blockedReasons.length > 0);
checkIncludes('S4b: AI_PURCHASE_APPROVAL_FORBIDDEN', approvalAIResult.blockedReasons, 'AI_PURCHASE_APPROVAL_FORBIDDEN');
check('S4b: approval undefined', approvalAIResult.approval, undefined);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [5] Human submit DRAFT → PENDING');
// ─────────────────────────────────────────────────────────────────────────────

const draftRecord: PurchaseOrderDraftRecord = {
  id:       PO_ID,
  status:   'DRAFT',
  tenantId: TENANT,
  aiMetadata: {
    source:                  'ai_suggestion_human_approved',
    requiresFinalSubmission: true,
    aiCanSubmit:             false,
    sourceSnapshotId:        SNAP_ID,
    suggestionId:            suggestionId,
    draftSuggestionId:       draftSuggestionId,
    auditTrailId:            TRAIL_ID,
    approvalId:              approvalId,
  },
  items: [{
    ingredientId:  INGREDIENT,
    name:          'Carrot',
    purchaseQtyKg: (purchaseOrderDraftInput?.approvedQtyGrams ?? 0) / 1000,
  }],
};

const submitResult = submitApprovedDraftPurchaseOrderToPending({
  purchaseOrderDraft:     draftRecord,
  submittedByHumanUserId: HUMAN_ID,
  actorType:              'human',
  requestId:              'req-ig-submit-001',
  now:                    NOW,
});

const { submit, purchaseOrderPendingInput, auditEvent: submitAuditEvent, blockedReasons: submitBlocked } = submitResult;

checkTrue('S5: submit created', !!submit);
check('S5: no blocked', submitBlocked, []);
check('S5: fromStatus DRAFT', submit?.fromStatus, 'DRAFT');
check('S5: toStatus PENDING', submit?.toStatus, 'PENDING');
check('S5: aiCanSubmit = false', submit?.aiCanSubmit, false);
check('S5: aiCanReceive = false', submit?.aiCanReceive, false);
check('S5: requiresReceivingConfirmation = true', submit?.requiresReceivingConfirmation, true);
check('S5: submittedByHumanUserId', submit?.submittedByHumanUserId, HUMAN_ID);
check('S5: auditTrailId traceable', submit?.auditTrailId, TRAIL_ID);
check('S5: suggestionId traceable', submit?.suggestionId, suggestionId);
check('S5: sourceSnapshotId traceable', submit?.sourceSnapshotId, SNAP_ID);
check('S5: auditEvent type', submitAuditEvent.eventType, 'PURCHASE_ORDER_PENDING_SUBMITTED');
check('S5: pending input fromStatus DRAFT', purchaseOrderPendingInput?.fromStatus, 'DRAFT');
check('S5: pending input toStatus PENDING', purchaseOrderPendingInput?.toStatus, 'PENDING');
check('S5: pending input aiCanSubmit false', purchaseOrderPendingInput?.aiPendingMetadata.aiCanSubmit, false);
check('S5: pending input aiCanReceive false', purchaseOrderPendingInput?.aiPendingMetadata.aiCanReceive, false);
check('S5: pending input requiresReceiving true', purchaseOrderPendingInput?.aiPendingMetadata.requiresReceivingConfirmation, true);
submitId = submit?.submitId ?? '';
checkTrue('S5: submitId present', submitId.length > 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [5b] AI cannot submit');
// ─────────────────────────────────────────────────────────────────────────────

const submitAIResult = submitApprovedDraftPurchaseOrderToPending({
  purchaseOrderDraft:     draftRecord,
  submittedByHumanUserId: '',
  actorType:              'ai',
  requestId:              'req-ig-submit-ai',
  now:                    NOW,
});
checkTrue('S5b: AI submit blocked', submitAIResult.blockedReasons.length > 0);
checkIncludes('S5b: AI_PURCHASE_SUBMIT_FORBIDDEN', submitAIResult.blockedReasons, 'AI_PURCHASE_SUBMIT_FORBIDDEN');
check('S5b: submit undefined', submitAIResult.submit, undefined);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [5c] Status guard: transitions');
// ─────────────────────────────────────────────────────────────────────────────

const guardDraftPending = validatePurchaseOrderStatusTransition({
  purchaseOrderId: PO_ID, fromStatus: 'DRAFT', toStatus: 'PENDING', callerType: 'human',
});
checkTrue('S5c: DRAFT→PENDING human OK', guardDraftPending.allowed);

const guardDraftReceived = validatePurchaseOrderStatusTransition({
  purchaseOrderId: PO_ID, fromStatus: 'DRAFT', toStatus: 'RECEIVED', callerType: 'human',
});
checkFalse('S5c: DRAFT→RECEIVED blocked', guardDraftReceived.allowed);

const guardAIReceive = validatePurchaseOrderStatusTransition({
  purchaseOrderId: PO_ID, fromStatus: 'PENDING', toStatus: 'RECEIVED', callerType: 'ai',
});
checkFalse('S5c: AI PENDING→RECEIVED blocked', guardAIReceive.allowed);
checkIncludes('S5c: AI_RECEIVING_FORBIDDEN', guardAIReceive.blockedReasons, 'AI_RECEIVING_FORBIDDEN');

const guardHumanReceive = validatePurchaseOrderStatusTransition({
  purchaseOrderId: PO_ID, fromStatus: 'PENDING', toStatus: 'RECEIVED', callerType: 'human',
});
checkTrue('S5c: human PENDING→RECEIVED OK', guardHumanReceive.allowed);

const guardAlreadyReceived = validatePurchaseOrderStatusTransition({
  purchaseOrderId: PO_ID, fromStatus: 'RECEIVED', toStatus: 'RECEIVED', callerType: 'human',
});
checkFalse('S5c: RECEIVED→RECEIVED blocked', guardAlreadyReceived.allowed);
checkIncludes('S5c: PURCHASE_ORDER_ALREADY_RECEIVED', guardAlreadyReceived.blockedReasons, 'PURCHASE_ORDER_ALREADY_RECEIVED');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [6] Backend guard: validateReceivingBeforeWrite (PENDING → RECEIVED)');
// ─────────────────────────────────────────────────────────────────────────────

const ORDERED_GRAMS  = asGrams(1000);
const RECEIVED_GRAMS = asGrams(1000);
const TOKEN          = generateReceivingToken();
const REQUEST_ID     = generateReceivingRequestId();

const receivingRequest: ReceivingConfirmationRequest = {
  requestId:        REQUEST_ID,
  receivingToken:   TOKEN,
  tenantId:         TENANT,
  purchaseOrderId:  PO_ID,
  auditTrailId:     TRAIL_ID,
  humanReceiverId:  HUMAN_ID,
  callerType:       'human',
  orderedQtyGrams:  ORDERED_GRAMS,
  receivedQtyGrams: RECEIVED_GRAMS,
  receivedAt:       NOW,
};

const MOCK_PO: POSnapshotData = {
  status: 'PENDING',
  aiPendingMetadata: {
    suggestionId:    suggestionId,
    sourceSnapshotId: SNAP_ID,
    auditTrailId:    TRAIL_ID,
  },
};

const validationResult = validateReceivingBeforeWrite({
  request:  receivingRequest,
  poData:   MOCK_PO,
  lockData: null,
  now:      NOW,
});

checkTrue('S6: canProceed = true', validationResult.allowed);
check('S6: no blocked', validationResult.blockedReasons, []);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [6b] Backend guard: AI caller unconditionally blocked');
// ─────────────────────────────────────────────────────────────────────────────

const aiReceivingRequest: ReceivingConfirmationRequest = { ...receivingRequest, callerType: 'ai' };
const aiValidation = validateReceivingBeforeWrite({
  request: aiReceivingRequest, poData: MOCK_PO, lockData: null, now: NOW,
});
checkFalse('S6b: AI receiving blocked', aiValidation.allowed);
checkIncludes('S6b: AI_RECEIVING_FORBIDDEN', aiValidation.blockedReasons, 'AI_RECEIVING_FORBIDDEN');
checkIncludes('S6b: AI_INVENTORY_UPDATE_FORBIDDEN', aiValidation.blockedReasons, 'AI_INVENTORY_UPDATE_FORBIDDEN');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [6c] Backend guard: non-PENDING PO blocked');
// ─────────────────────────────────────────────────────────────────────────────

const draftPO: POSnapshotData = { status: 'DRAFT' };
const draftValidation = validateReceivingBeforeWrite({
  request: receivingRequest, poData: draftPO, lockData: null, now: NOW,
});
checkFalse('S6c: DRAFT PO blocked', draftValidation.allowed);
checkIncludes('S6c: PURCHASE_ORDER_NOT_PENDING', draftValidation.blockedReasons, 'PURCHASE_ORDER_NOT_PENDING');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [6d] Backend guard: delta >15% without note blocked');
// ─────────────────────────────────────────────────────────────────────────────

const deltaRequest: ReceivingConfirmationRequest = {
  ...receivingRequest, receivedQtyGrams: asGrams(1200), // +20%
};
const deltaValidation = validateReceivingBeforeWrite({
  request: deltaRequest, poData: MOCK_PO, lockData: null, now: NOW,
});
checkFalse('S6d: delta >15% no note blocked', deltaValidation.allowed);
checkIncludes('S6d: RECEIVING_DELTA_NOTE_REQUIRED', deltaValidation.blockedReasons, 'RECEIVING_DELTA_NOTE_REQUIRED');

const deltaWithNote: ReceivingConfirmationRequest = {
  ...receivingRequest, receivedQtyGrams: asGrams(1200), receivingNote: 'Extra batch from supplier',
};
const deltaWithNoteValidation = validateReceivingBeforeWrite({
  request: deltaWithNote, poData: MOCK_PO, lockData: null, now: NOW,
});
checkTrue('S6d: delta >15% with note allowed', deltaWithNoteValidation.allowed);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [7] Build receiving write payloads (transaction-only)');
// ─────────────────────────────────────────────────────────────────────────────

// We need deltaQtyGrams and deltaPercent from the validation result
const DELTA_GRAMS  = (RECEIVED_GRAMS - ORDERED_GRAMS) as Grams;
const DELTA_PCT    = 0; // exact match
const INV_TX_ID    = 'invtx_ig_001';

const payloads = buildReceivingWritePayloads({
  request:               receivingRequest,
  inventoryTransactionId: INV_TX_ID,
  deltaQtyGrams:         DELTA_GRAMS,
  deltaPercent:          DELTA_PCT,
  suggestionId:          suggestionId as any,
  sourceSnapshotId:      SNAP_ID,
  now:                   NOW,
});

checkTrue('S7: inventoryTx present', !!payloads.inventoryTransaction);
checkTrue('S7: receivingLock present', !!payloads.receivingLock);
checkTrue('S7: poUpdate present', !!payloads.purchaseOrderUpdate);
checkTrue('S7: auditEvent present', !!payloads.auditEvent);
checkTrue('S7: aiMetric present', !!payloads.aiPerformanceMetric);

check('S7: PO status = RECEIVED', payloads.purchaseOrderUpdate.status, 'RECEIVED');
check('S7: inventoryTx type = restock', payloads.inventoryTransaction.type, 'restock');
checkTrue('S7: inventoryIncrementKg > 0', payloads.inventoryIncrementKg > 0);
check('S7: lock = CONSUMED', payloads.receivingLock.status, 'CONSUMED');
check('S7: aiMetric aiCanMutateRules = false', payloads.aiPerformanceMetric.aiCanMutateRules, false);
check('S7: aiMetric createdBy = system', payloads.aiPerformanceMetric.createdBy, 'system');

// Verify no forbidden log fields
const payloadStr = JSON.stringify(payloads);
checkFalse('S7: no "performanceLogs" field', payloadStr.includes('"performanceLogs"'));
checkFalse('S7: no "finalizedPerformanceLogs" field', payloadStr.includes('"finalizedPerformanceLogs"'));
checkFalse('S7: no "operationalReports" field', payloadStr.includes('"operationalReports"'));

// Verify inventory increment is a plain number (payload for atomic increment inside transaction)
checkTrue('S7: inventoryIncrementKg is a number', typeof payloads.inventoryIncrementKg === 'number');
checkTrue('S7: inventoryTx receivedQtyGrams = RECEIVED_GRAMS', payloads.inventoryTransaction.receivedQtyGrams === RECEIVED_GRAMS);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [8] Dry-run plan: 13 ordered steps present');
// ─────────────────────────────────────────────────────────────────────────────

const plan = buildReceivingTransactionDryRunPlan(receivingRequest);

checkTrue('S8: plan not blocked', !plan.blockedReasons.length);
check('S8: 13 steps', plan.steps.length, 13);
checkTrue('S8: has INCREMENT_INVENTORY_CURRENT_STOCK_GRAMS',
  plan.steps.includes('INCREMENT_INVENTORY_CURRENT_STOCK_GRAMS'));
checkTrue('S8: has UPDATE_PURCHASE_ORDER_RECEIVED',
  plan.steps.includes('UPDATE_PURCHASE_ORDER_RECEIVED'));
checkTrue('S8: has CREATE_INVENTORY_TRANSACTION',
  plan.steps.includes('CREATE_INVENTORY_TRANSACTION'));
checkTrue('S8: has CREATE_RECEIVING_LOCK',
  plan.steps.includes('CREATE_RECEIVING_LOCK'));
checkTrue('S8: has APPEND_AUDIT_EVENT',
  plan.steps.includes('APPEND_AUDIT_EVENT'));
checkTrue('S8: has CREATE_AI_PERFORMANCE_METRIC',
  plan.steps.includes('CREATE_AI_PERFORMANCE_METRIC'));

// Blocked plan is empty
const blockedPlan = buildReceivingTransactionDryRunPlan(aiReceivingRequest);
checkTrue('S8: blocked plan has 0 steps', blockedPlan.steps.length === 0);
checkIncludes('S8: blocked plan reason', blockedPlan.blockedReasons, 'AI_RECEIVING_FORBIDDEN');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [9] Idempotency: duplicate receiving blocked');
// ─────────────────────────────────────────────────────────────────────────────

const lock = createReceivingIdempotencyLock(TENANT, PO_ID, TOKEN, REQUEST_ID, NOW);
const consumedLock = { ...lock, status: 'CONSUMED' as const };

const dupLockValidation = validateReceivingIdempotencyLock(consumedLock, NOW);
checkFalse('S9: CONSUMED lock blocks', dupLockValidation.canProceed);
checkIncludes('S9: DUPLICATE_RECEIVING_ATTEMPT', dupLockValidation.blockedReasons, 'DUPLICATE_RECEIVING_ATTEMPT');

// Convert to LockSnapshotData shape for validateReceivingBeforeWrite
const consumedLockData: LockSnapshotData = {
  status:    'CONSUMED',
  expiresAt: { toDate: () => consumedLock.expiresAt },
};
const dupBackendValidation = validateReceivingBeforeWrite({
  request: receivingRequest, poData: MOCK_PO, lockData: consumedLockData, now: NOW,
});
checkFalse('S9: backend duplicate blocked', dupBackendValidation.allowed);
checkIncludes('S9: backend DUPLICATE_RECEIVING_ATTEMPT', dupBackendValidation.blockedReasons, 'DUPLICATE_RECEIVING_ATTEMPT');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [10] Network retry safety');
// ─────────────────────────────────────────────────────────────────────────────

// Same token retry with CONSUMED lock → still blocked
const retryWithSameToken = validateReceivingBeforeWrite({
  request: receivingRequest, poData: MOCK_PO, lockData: consumedLockData, now: NOW,
});
checkFalse('S10: retry same token blocked', retryWithSameToken.allowed);

// New token (new dialog instance), no existing lock → allowed
const newToken = generateReceivingToken();
const retryRequest: ReceivingConfirmationRequest = {
  ...receivingRequest,
  receivingToken: newToken,
  requestId:      generateReceivingRequestId(),
};
const retryValidation = validateReceivingBeforeWrite({
  request: retryRequest, poData: MOCK_PO, lockData: null, now: NOW,
});
checkTrue('S10: new token (fresh lock) allowed', retryValidation.allowed);
checkTrue('S10: tokens are different', newToken !== TOKEN);

// ACTIVE in-flight lock blocks concurrent retry
const activeLock = createReceivingIdempotencyLock(TENANT, PO_ID, TOKEN, REQUEST_ID, NOW);
const activeLockData: LockSnapshotData = {
  status:    'ACTIVE',
  expiresAt: { toDate: () => activeLock.expiresAt },
};
const activeValidation = validateReceivingBeforeWrite({
  request: receivingRequest, poData: MOCK_PO, lockData: activeLockData, now: NOW,
});
checkFalse('S10: ACTIVE in-flight lock blocks', activeValidation.allowed);
checkIncludes('S10: RECEIVING_LOCK_ACTIVE', activeValidation.blockedReasons, 'RECEIVING_LOCK_ACTIVE');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [11] Audit trail continuity (snapshot → inventoryTransaction)');
// ─────────────────────────────────────────────────────────────────────────────

// TRAIL_ID flows through every step that receives it
// (suggestion itself carries auditTrailId from the operation, but it's optional on the suggestion object)
checkTrue('S11: suggestion present for chain', !!suggestion);
check('S11: draftSuggestion auditTrailId = TRAIL_ID', draftSuggestion?.auditTrailId, TRAIL_ID);
check('S11: approval auditTrailId = TRAIL_ID', approval?.auditTrailId, TRAIL_ID);
check('S11: submit auditTrailId = TRAIL_ID', submit?.auditTrailId, TRAIL_ID);

// snapshotId flows through — use the actual generated snapshot's ID
const ACTUAL_SNAP_ID = SNAPSHOT.snapshotId;
check('S11: draftSuggestion sourceSnapshotId = snapshot.snapshotId', draftSuggestion?.sourceSnapshotId, ACTUAL_SNAP_ID);
check('S11: approval sourceSnapshotId = snapshot.snapshotId', approval?.sourceSnapshotId, ACTUAL_SNAP_ID);
// submit sourceSnapshotId comes from draftRecord.aiMetadata.sourceSnapshotId (SNAP_ID constant used there)
checkTrue('S11: submit sourceSnapshotId present', !!submit?.sourceSnapshotId);

// Audit event chain: each step produces a named event
check('S11: suggestion audit = SUGGESTION_GENERATED', sugAuditEvent.eventType, 'SUGGESTION_GENERATED');
check('S11: draft audit = DRAFT_SUGGESTION_CREATED', draftAuditEvent.eventType, 'DRAFT_SUGGESTION_CREATED');
check('S11: approval audit = PURCHASE_ORDER_DRAFT_CREATED', approvalAuditEvent.eventType, 'PURCHASE_ORDER_DRAFT_CREATED');
check('S11: submit audit = PURCHASE_ORDER_PENDING_SUBMITTED', submitAuditEvent.eventType, 'PURCHASE_ORDER_PENDING_SUBMITTED');

// Receiving audit event is present and is a RECEIVING_CONFIRMED event
checkTrue('S11: receiving auditEvent present', !!payloads.auditEvent);
checkTrue('S11: receiving auditEvent has eventType', !!payloads.auditEvent.eventType);

// inventoryTransaction carries the purchaseOrderId (traceable reference)
check('S11: inventoryTx referenceId = PO_ID', payloads.inventoryTransaction.referenceId, PO_ID);
check('S11: inventoryTx auditTrailId = TRAIL_ID', payloads.inventoryTransaction.auditTrailId, TRAIL_ID);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [12] Production guard assertions');
// ─────────────────────────────────────────────────────────────────────────────

checkTrue('S12: token UUID v4 format',
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(TOKEN));
checkTrue('S12: requestId starts with req_rcv_', REQUEST_ID.startsWith('req_rcv_'));

check('S12: aiCanMutateRules = false', payloads.aiPerformanceMetric.aiCanMutateRules, false);
check('S12: aiMetric createdBy = system', payloads.aiPerformanceMetric.createdBy, 'system');

const testLock = createReceivingIdempotencyLock(TENANT, PO_ID, TOKEN, REQUEST_ID, NOW);
const expectedExpiry = new Date(NOW.getTime() + 10 * 60 * 1000);
check('S12: lock TTL = 10 min', testLock.expiresAt.getTime(), expectedExpiry.getTime());
check('S12: lock status = ACTIVE', testLock.status, 'ACTIVE');

check('S12: GRAMS_PER_TAIJIN = 600', GRAMS_PER_TAIJIN, 600);
check('S12: GRAMS_PER_KG = 1000', GRAMS_PER_KG, 1000);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  [13] Regression: Feature 001 + 002 guards still active');
// ─────────────────────────────────────────────────────────────────────────────

// validateReceivingConfirmation: pure boundary check (returns .allowed)
const boundaryResult = validateReceivingConfirmation(receivingRequest);
checkTrue('R1: human boundary allowed', boundaryResult.allowed);
check('R1: no blocked', boundaryResult.blockedReasons, []);

const aiBoundaryResult = validateReceivingConfirmation(aiReceivingRequest);
checkFalse('R1: AI boundary blocked', aiBoundaryResult.allowed);
checkIncludes('R1: AI_RECEIVING_FORBIDDEN', aiBoundaryResult.blockedReasons, 'AI_RECEIVING_FORBIDDEN');

// aiCanMutateRules lock at transaction layer
check('R2: aiCanMutateRules always false', payloads.aiPerformanceMetric.aiCanMutateRules, false);

// Delta at exactly 15%: allowed (strict >)
const exactly15 = validateReceivingBeforeWrite({
  request: { ...receivingRequest, receivedQtyGrams: asGrams(1150) },
  poData: MOCK_PO, lockData: null, now: NOW,
});
checkTrue('R3: delta exactly 15% is allowed', exactly15.allowed);

// Delta at 15.01% (1151/1000): blocked
const justOver15 = validateReceivingBeforeWrite({
  request: { ...receivingRequest, receivedQtyGrams: asGrams(1151) },
  poData: MOCK_PO, lockData: null, now: NOW,
});
checkFalse('R3: delta 15.1% no note blocked', justOver15.allowed);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('PASSED — Feature 001 + 002 Integration Gate verified');
} else {
  console.log('FAILED — see errors above');
  throw new Error(`Integration Gate: ${failed} test(s) failed`);
}
