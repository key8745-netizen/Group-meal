/**
 * aiHumanApprovalService.ts
 *
 * Validates and prepares the human-approval object that authorises converting
 * a DraftPurchaseSuggestion into a purchaseOrders DRAFT document.
 *
 * HARD RULES (Phase 6):
 *  1. Pure validation function — no Firestore reads or writes.
 *  2. Only humans can approve — AI callers are unconditionally BLOCKED.
 *  3. Only DRAFT_PREPARED drafts with HIGH or MEDIUM confidence are approved.
 *  4. The produced purchaseOrderDraftInput has status === 'DRAFT' only.
 *  5. Never produces PENDING or RECEIVED.
 *  6. Never modifies inventory.
 *  7. Does NOT call purchaseOrderService or inventoryService.
 *  8. aiCanApprove and aiCanSubmit are always false (type-locked).
 *  9. requiresFinalSubmission is always true (type-locked).
 * 10. Produces PURCHASE_ORDER_DRAFT_CREATED or PURCHASE_ORDER_DRAFT_BLOCKED audit event.
 *
 * The actual Firestore write is delegated to
 * purchaseOrderService.createDraftPurchaseOrderFromApprovedSuggestion(),
 * which the UI calls after receiving a successful approval result here.
 */

import type {
  DraftPurchaseSuggestion, HumanApprovalForPurchaseDraft,
  AIPurchaseOrderDraftMetadata, AuditEvent, BlockedReason, Grams,
  TenantId, SuggestionId, SnapshotId, AuditTrailId,
} from '@/types/aiBoundary';
import { asGrams } from './unitConversionService';
import { createAuditEvent } from './aiAuditTrailHelper';

// ─── ID generation ────────────────────────────────────────────────────────────

function generateApprovalId(): string {
  return `appr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Input / Output ───────────────────────────────────────────────────────────

export interface ApproveDraftSuggestionInput {
  draftSuggestion: DraftPurchaseSuggestion;
  approvedByHumanUserId: string;
  /** actorType must be 'human'; any other value is BLOCKED */
  actorType?: 'human' | 'ai' | 'system';
  approvalNote?: string;
  requestId: string;
  now: Date;
}

export interface ApproveDraftSuggestionResult {
  approval?: HumanApprovalForPurchaseDraft;
  /** Ready-to-persist input for purchaseOrderService.createDraftPurchaseOrderFromApprovedSuggestion() */
  purchaseOrderDraftInput?: PurchaseOrderDraftInput;
  auditEvent: AuditEvent;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

/**
 * Typed input for the DRAFT-only purchase order helper in purchaseOrderService.
 * Status is permanently 'DRAFT' — no other value is permitted.
 */
export interface PurchaseOrderDraftInput {
  status: 'DRAFT';
  tenantId: TenantId;
  ingredientId: string;
  ingredientName?: string;
  /** Quantity in grams — DISPLAY LAYER must convert to kg/台斤 */
  approvedQtyGrams: Grams;
  notes: string;
  aiMetadata: AIPurchaseOrderDraftMetadata;
}

// ─── approveDraftSuggestionForPurchaseOrder ───────────────────────────────────

/**
 * Validates a DraftPurchaseSuggestion for human approval and builds:
 *  - HumanApprovalForPurchaseDraft (the approval record)
 *  - PurchaseOrderDraftInput       (input for the Firestore write helper)
 *  - AuditEvent                    (PURCHASE_ORDER_DRAFT_CREATED or _BLOCKED)
 *
 * Never throws. Never writes Firestore.
 */
export function approveDraftSuggestionForPurchaseOrder(
  input: ApproveDraftSuggestionInput,
): ApproveDraftSuggestionResult {
  const {
    draftSuggestion, approvedByHumanUserId,
    actorType = 'human', approvalNote, requestId, now,
  } = input;

  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [...(draftSuggestion.warnings ?? [])];

  // ── Identity: only humans can approve ─────────────────────────────────────

  if (actorType !== 'human') {
    blocked.push('AI_PURCHASE_APPROVAL_FORBIDDEN');
  }
  if (!approvedByHumanUserId) {
    blocked.push('MISSING_HUMAN_APPROVER');
  }
  if (!requestId) {
    blocked.push('MISSING_REQUEST_ID');
  }

  // ── Draft field checks ────────────────────────────────────────────────────

  if (!draftSuggestion.draftSuggestionId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }
  if (!draftSuggestion.suggestionId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }
  if (!draftSuggestion.sourceSnapshotId) {
    blocked.push('MISSING_SNAPSHOT_ID');
  }
  if (!draftSuggestion.auditTrailId) {
    blocked.push('MISSING_AUDIT_TRAIL_ID');
  }
  if (!draftSuggestion.tenantId) {
    blocked.push('MISSING_TENANT_ID');
  }

  // ── Draft status + confidence ─────────────────────────────────────────────

  if (draftSuggestion.status !== 'DRAFT_PREPARED') {
    if (draftSuggestion.status === 'BLOCKED' || draftSuggestion.status === 'REJECTED') {
      blocked.push('DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED');
    } else {
      blocked.push('HUMAN_APPROVAL_REQUIRED');
    }
  }

  const confLevel = draftSuggestion.confidence?.level;
  if (confLevel === 'LOW') {
    blocked.push('DRAFT_FROM_LOW_CONFIDENCE_BLOCKED');
  }
  if (confLevel === 'BLOCKED') {
    blocked.push('DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED');
  }

  if (draftSuggestion.blockedReasons.length > 0) {
    for (const r of draftSuggestion.blockedReasons) {
      if (!blocked.includes(r)) blocked.push(r);
    }
  }

  if (!draftSuggestion.requiresHumanApproval) {
    blocked.push('HUMAN_APPROVAL_REQUIRED');
  }

  // ── Validate finalQtyGrams ────────────────────────────────────────────────

  let approvedQtyGrams: Grams = draftSuggestion.finalQtyGrams;
  try {
    approvedQtyGrams = asGrams(draftSuggestion.finalQtyGrams);
  } catch {
    blocked.push('UNKNOWN_UNIT');
  }

  // ── Early return on block ─────────────────────────────────────────────────

  if (blocked.length > 0) {
    const auditEvent = createAuditEvent({
      eventType:    'PURCHASE_ORDER_DRAFT_BLOCKED',
      actorType:    actorType === 'human' ? 'human' : 'ai',
      actorId:      approvedByHumanUserId || 'unknown',
      at:           now,
      toState:      'BLOCKED',
      eventVersion: 1,
      metadata: {
        requestId,
        draftSuggestionId:  draftSuggestion.draftSuggestionId,
        suggestionId:       draftSuggestion.suggestionId,
        sourceSnapshotId:   draftSuggestion.sourceSnapshotId,
        auditTrailId:       draftSuggestion.auditTrailId,
        blockedReasons:     blocked,
        requiresFinalSubmission: true,
      },
    });
    return { approval: undefined, purchaseOrderDraftInput: undefined, auditEvent, blockedReasons: blocked, warnings };
  }

  // ── Build approval + purchaseOrderDraftInput ──────────────────────────────

  const approvalId = generateApprovalId();

  const approval: HumanApprovalForPurchaseDraft = {
    approvalId,
    tenantId:               draftSuggestion.tenantId as TenantId,
    draftSuggestionId:      draftSuggestion.draftSuggestionId,
    suggestionId:           draftSuggestion.suggestionId as SuggestionId,
    sourceSnapshotId:       draftSuggestion.sourceSnapshotId as SnapshotId,
    auditTrailId:           draftSuggestion.auditTrailId as AuditTrailId,
    feedbackId:             draftSuggestion.feedbackId,
    overrideId:             draftSuggestion.overrideId,
    approvedByHumanUserId,
    approvedAt:             now,
    approvalNote,
    approvedQtyGrams,
    createsPurchaseOrderStatus: 'DRAFT',
    aiCanApprove:           false,
    requiresFinalSubmission: true,
  };

  const aiMetadata: AIPurchaseOrderDraftMetadata = {
    source:                 'ai_suggestion_human_approved',
    tenantId:               draftSuggestion.tenantId as TenantId,
    sourceSnapshotId:       draftSuggestion.sourceSnapshotId as SnapshotId,
    suggestionId:           draftSuggestion.suggestionId as SuggestionId,
    draftSuggestionId:      draftSuggestion.draftSuggestionId,
    auditTrailId:           draftSuggestion.auditTrailId as AuditTrailId,
    feedbackId:             draftSuggestion.feedbackId,
    overrideId:             draftSuggestion.overrideId,
    approvalId,
    approvedByHumanUserId,
    approvedAt:             now,
    requiresFinalSubmission: true,
    aiGenerated:            true,
    aiCanSubmit:            false,
  };

  const purchaseOrderDraftInput: PurchaseOrderDraftInput = {
    status:          'DRAFT',
    tenantId:        draftSuggestion.tenantId as TenantId,
    ingredientId:    draftSuggestion.ingredientId,
    ingredientName:  draftSuggestion.ingredientName,
    approvedQtyGrams,
    notes: approvalNote
      ? `AI 建議人工核准（${approvalNote}）`
      : 'AI 建議人工核准草稿',
    aiMetadata,
  };

  const auditEvent = createAuditEvent({
    eventType:    'PURCHASE_ORDER_DRAFT_CREATED',
    actorType:    'human',
    actorId:      approvedByHumanUserId,
    at:           now,
    fromState:    'DRAFT_PREPARED',
    toState:      'DRAFT',
    eventVersion: 1,
    metadata: {
      approvalId,
      draftSuggestionId:      draftSuggestion.draftSuggestionId,
      suggestionId:           draftSuggestion.suggestionId,
      sourceSnapshotId:       draftSuggestion.sourceSnapshotId,
      auditTrailId:           draftSuggestion.auditTrailId,
      feedbackId:             draftSuggestion.feedbackId,
      overrideId:             draftSuggestion.overrideId,
      approvedByHumanUserId,
      approvedQtyGrams,
      status:                 'DRAFT',
      requiresFinalSubmission: true,
    },
  });

  return { approval, purchaseOrderDraftInput, auditEvent, blockedReasons: [], warnings };
}

// ─── validatePurchaseOrderDraftInput ─────────────────────────────────────────

/**
 * Pure validation for PurchaseOrderDraftInput before any Firestore write.
 * Called by purchaseOrderService.createDraftPurchaseOrderFromApprovedSuggestion().
 */
export function validatePurchaseOrderDraftInput(
  input: PurchaseOrderDraftInput,
): BlockedReason[] {
  const blocked: BlockedReason[] = [];

  if (input.status !== 'DRAFT') {
    blocked.push('PURCHASE_ORDER_DRAFT_ONLY');
    if ((input.status as string) === 'PENDING') blocked.push('PURCHASE_ORDER_PENDING_FORBIDDEN');
    if ((input.status as string) === 'RECEIVED') blocked.push('PURCHASE_ORDER_RECEIVED_FORBIDDEN');
  }

  if (!input.aiMetadata.approvedByHumanUserId) {
    blocked.push('MISSING_HUMAN_APPROVER');
  }
  if (input.aiMetadata.aiCanSubmit !== false) {
    blocked.push('AI_PURCHASE_SUBMIT_FORBIDDEN');
  }
  if (!input.aiMetadata.requiresFinalSubmission) {
    blocked.push('HUMAN_APPROVAL_REQUIRED');
  }
  if (input.aiMetadata.source !== 'ai_suggestion_human_approved') {
    blocked.push('AI_PURCHASE_APPROVAL_FORBIDDEN');
  }
  if (!input.aiMetadata.auditTrailId) {
    blocked.push('MISSING_AUDIT_TRAIL_ID');
  }
  if (!input.aiMetadata.sourceSnapshotId) {
    blocked.push('MISSING_SNAPSHOT_ID');
  }
  if (!input.aiMetadata.suggestionId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }
  if (!input.aiMetadata.draftSuggestionId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }
  if (!input.aiMetadata.approvalId) {
    blocked.push('MISSING_APPROVAL_ID');
  }

  return blocked;
}
