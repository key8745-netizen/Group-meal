/**
 * aiHumanSubmitService.ts
 *
 * Validates and prepares the human-submit record that authorises transitioning
 * a purchaseOrders DRAFT document to PENDING.
 *
 * HARD RULES (Phase 7):
 *  1. Pure validation function — no Firestore reads or writes.
 *  2. Only humans can submit — AI callers are unconditionally BLOCKED.
 *  3. Only DRAFT → PENDING transitions are allowed.
 *  4. Never produces RECEIVED.
 *  5. Never modifies inventory.
 *  6. Does NOT call inventoryService.
 *  7. aiCanSubmit and aiCanReceive are always false (type-locked).
 *  8. requiresReceivingConfirmation is always true (type-locked).
 *  9. Produces PURCHASE_ORDER_PENDING_SUBMITTED or PURCHASE_ORDER_PENDING_BLOCKED audit event.
 *
 * The actual Firestore status update is delegated to
 * purchaseOrderService.submitAIDraftPurchaseOrderToPending(),
 * which the UI calls after receiving a successful submit result here.
 */

import type {
  HumanSubmitPurchaseOrderPending, AIPurchaseOrderPendingMetadata,
  AuditEvent, BlockedReason, TenantId, SuggestionId, SnapshotId, AuditTrailId,
} from '@/types/aiBoundary';
import { createAuditEvent } from './aiAuditTrailHelper';

// ─── ID generation ────────────────────────────────────────────────────────────

function generateSubmitId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Expected shape of a purchaseOrderDraft ───────────────────────────────────

export interface PurchaseOrderDraftRecord {
  id?: string;
  purchaseOrderId?: string;
  status: string;
  tenantId?: string;
  aiMetadata?: {
    source?: string;
    requiresFinalSubmission?: boolean;
    aiCanSubmit?: boolean;
    sourceSnapshotId?: string;
    suggestionId?: string;
    draftSuggestionId?: string;
    auditTrailId?: string;
    approvalId?: string;
    feedbackId?: string;
    overrideId?: string;
    approvedByHumanUserId?: string;
  };
  items?: Array<{ ingredientId: string; name: string; purchaseQtyKg: number }>;
}

// ─── Input / Output ───────────────────────────────────────────────────────────

export interface SubmitDraftToPendingInput {
  purchaseOrderDraft: PurchaseOrderDraftRecord;
  submittedByHumanUserId: string;
  /** actorType must be 'human'; any other value is BLOCKED */
  actorType?: 'human' | 'ai' | 'system';
  submitNote?: string;
  requestId: string;
  now: Date;
}

export interface SubmitDraftToPendingResult {
  submit?: HumanSubmitPurchaseOrderPending;
  purchaseOrderPendingInput?: PurchaseOrderPendingInput;
  auditEvent: AuditEvent;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

/**
 * Typed input for the PENDING transition helper in purchaseOrderService.
 */
export interface PurchaseOrderPendingInput {
  purchaseOrderId: string;
  fromStatus: 'DRAFT';
  toStatus: 'PENDING';
  submittedByHumanUserId: string;
  submitNote?: string;
  aiPendingMetadata: AIPurchaseOrderPendingMetadata;
}

// ─── submitApprovedDraftPurchaseOrderToPending ────────────────────────────────

/**
 * Validates a DRAFT purchaseOrder for human submission to PENDING and builds:
 *  - HumanSubmitPurchaseOrderPending (the submit record)
 *  - PurchaseOrderPendingInput       (input for the Firestore status update helper)
 *  - AuditEvent                      (PURCHASE_ORDER_PENDING_SUBMITTED or _BLOCKED)
 *
 * Never throws. Never writes Firestore. Never calls inventoryService.
 */
export function submitApprovedDraftPurchaseOrderToPending(
  input: SubmitDraftToPendingInput,
): SubmitDraftToPendingResult {
  const {
    purchaseOrderDraft, submittedByHumanUserId,
    actorType = 'human', submitNote, requestId, now,
  } = input;

  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  const meta = purchaseOrderDraft.aiMetadata;
  const purchaseOrderId = purchaseOrderDraft.id ?? purchaseOrderDraft.purchaseOrderId ?? '';

  // ── Identity: only humans can submit ─────────────────────────────────────

  if (actorType !== 'human') {
    blocked.push('AI_PURCHASE_SUBMIT_FORBIDDEN');
  }
  if (!submittedByHumanUserId) {
    blocked.push('MISSING_HUMAN_SUBMITTER');
  }
  if (!requestId) {
    blocked.push('MISSING_REQUEST_ID');
  }

  // ── Status check: must be DRAFT ───────────────────────────────────────────

  if (purchaseOrderDraft.status !== 'DRAFT') {
    blocked.push('PURCHASE_ORDER_DRAFT_REQUIRED');
  }

  // ── purchaseOrderId must be present ───────────────────────────────────────

  if (!purchaseOrderId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }

  // ── AI metadata validation ────────────────────────────────────────────────

  if (!meta) {
    blocked.push('MISSING_AUDIT_TRAIL_ID');
    blocked.push('MISSING_SNAPSHOT_ID');
  } else {
    if (meta.source !== 'ai_suggestion_human_approved') {
      blocked.push('AI_PURCHASE_APPROVAL_FORBIDDEN');
    }
    if (!meta.requiresFinalSubmission) {
      blocked.push('HUMAN_SUBMIT_REQUIRED');
    }
    if (meta.aiCanSubmit !== false) {
      blocked.push('AI_PURCHASE_SUBMIT_FORBIDDEN');
    }
    if (!meta.sourceSnapshotId) {
      blocked.push('MISSING_SNAPSHOT_ID');
    }
    if (!meta.suggestionId) {
      blocked.push('MISSING_DRAFT_SUGGESTION_ID');
    }
    if (!meta.draftSuggestionId) {
      blocked.push('MISSING_DRAFT_SUGGESTION_ID');
    }
    if (!meta.auditTrailId) {
      blocked.push('MISSING_AUDIT_TRAIL_ID');
    }
    if (!meta.approvalId) {
      blocked.push('MISSING_APPROVAL_ID');
    }
  }

  // ── Early return on block ─────────────────────────────────────────────────

  if (blocked.length > 0) {
    const auditEvent = createAuditEvent({
      eventType:    'PURCHASE_ORDER_PENDING_BLOCKED',
      actorType:    actorType === 'human' ? 'human' : 'ai',
      actorId:      submittedByHumanUserId || 'unknown',
      at:           now,
      toState:      'BLOCKED',
      eventVersion: 1,
      metadata: {
        requestId,
        purchaseOrderId,
        blockedReasons: blocked,
        fromStatus:  'DRAFT',
        toStatus:    'PENDING',
        requiresReceivingConfirmation: true,
      },
    });
    return { submit: undefined, purchaseOrderPendingInput: undefined, auditEvent, blockedReasons: blocked, warnings };
  }

  // ── Build submit + pendingInput ────────────────────────────────────────────

  const submitId = generateSubmitId();

  const submit: HumanSubmitPurchaseOrderPending = {
    submitId,
    tenantId:                   (purchaseOrderDraft.tenantId ?? meta!.sourceSnapshotId ?? '') as TenantId,
    purchaseOrderId,
    draftSuggestionId:          meta!.draftSuggestionId!,
    suggestionId:               meta!.suggestionId as SuggestionId,
    sourceSnapshotId:           meta!.sourceSnapshotId as SnapshotId,
    auditTrailId:               meta!.auditTrailId as AuditTrailId,
    approvalId:                 meta!.approvalId!,
    feedbackId:                 meta!.feedbackId,
    overrideId:                 meta!.overrideId,
    submittedByHumanUserId,
    submittedAt:                now,
    submitNote,
    fromStatus:                 'DRAFT',
    toStatus:                   'PENDING',
    aiCanSubmit:                false,
    aiCanReceive:               false,
    requiresReceivingConfirmation: true,
  };

  const aiPendingMetadata: AIPurchaseOrderPendingMetadata = {
    source:                       'ai_suggestion_human_submitted',
    tenantId:                     (purchaseOrderDraft.tenantId ?? '') as TenantId,
    sourceSnapshotId:             meta!.sourceSnapshotId as SnapshotId,
    suggestionId:                 meta!.suggestionId as SuggestionId,
    draftSuggestionId:            meta!.draftSuggestionId!,
    auditTrailId:                 meta!.auditTrailId as AuditTrailId,
    approvalId:                   meta!.approvalId!,
    submitId,
    submittedByHumanUserId,
    submittedAt:                  now,
    requiresReceivingConfirmation: true,
    aiGenerated:                  true,
    aiCanSubmit:                  false,
    aiCanReceive:                  false,
  };

  const purchaseOrderPendingInput: PurchaseOrderPendingInput = {
    purchaseOrderId,
    fromStatus:             'DRAFT',
    toStatus:               'PENDING',
    submittedByHumanUserId,
    submitNote,
    aiPendingMetadata,
  };

  const auditEvent = createAuditEvent({
    eventType:    'PURCHASE_ORDER_PENDING_SUBMITTED',
    actorType:    'human',
    actorId:      submittedByHumanUserId,
    at:           now,
    fromState:    'DRAFT',
    toState:      'PENDING',
    eventVersion: 1,
    metadata: {
      submitId,
      purchaseOrderId,
      draftSuggestionId:        meta!.draftSuggestionId,
      suggestionId:             meta!.suggestionId,
      sourceSnapshotId:         meta!.sourceSnapshotId,
      auditTrailId:             meta!.auditTrailId,
      approvalId:               meta!.approvalId,
      submittedByHumanUserId,
      fromStatus:               'DRAFT',
      toStatus:                 'PENDING',
      requiresReceivingConfirmation: true,
    },
  });

  return { submit, purchaseOrderPendingInput, auditEvent, blockedReasons: [], warnings };
}

// ─── validatePurchaseOrderPendingInput ────────────────────────────────────────

/**
 * Pure validation for PurchaseOrderPendingInput before any Firestore write.
 * Called by purchaseOrderService.submitAIDraftPurchaseOrderToPending().
 */
export function validatePurchaseOrderPendingInput(
  input: PurchaseOrderPendingInput,
): BlockedReason[] {
  const blocked: BlockedReason[] = [];

  if (input.fromStatus !== 'DRAFT') {
    blocked.push('PURCHASE_ORDER_DRAFT_REQUIRED');
  }
  if (input.toStatus !== 'PENDING') {
    blocked.push('PURCHASE_ORDER_PENDING_ONLY');
    if ((input.toStatus as string) === 'RECEIVED') {
      blocked.push('PURCHASE_ORDER_RECEIVED_FORBIDDEN');
    }
  }
  if (!input.submittedByHumanUserId) {
    blocked.push('MISSING_HUMAN_SUBMITTER');
  }
  if (input.aiPendingMetadata.aiCanSubmit !== false) {
    blocked.push('AI_PURCHASE_SUBMIT_FORBIDDEN');
  }
  if (!input.aiPendingMetadata.requiresReceivingConfirmation) {
    blocked.push('RECEIVING_CONFIRMATION_REQUIRED');
  }
  if (input.aiPendingMetadata.source !== 'ai_suggestion_human_submitted') {
    blocked.push('AI_PURCHASE_APPROVAL_FORBIDDEN');
  }
  if (!input.aiPendingMetadata.auditTrailId) {
    blocked.push('MISSING_AUDIT_TRAIL_ID');
  }
  if (!input.aiPendingMetadata.sourceSnapshotId) {
    blocked.push('MISSING_SNAPSHOT_ID');
  }
  if (!input.aiPendingMetadata.suggestionId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }
  if (!input.aiPendingMetadata.draftSuggestionId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }
  if (!input.aiPendingMetadata.approvalId) {
    blocked.push('MISSING_APPROVAL_ID');
  }
  if (!input.aiPendingMetadata.submitId) {
    blocked.push('MISSING_SUBMIT_ID');
  }

  return blocked;
}
