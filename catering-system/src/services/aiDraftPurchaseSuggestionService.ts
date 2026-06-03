/**
 * aiDraftPurchaseSuggestionService.ts
 *
 * Prepares a DraftPurchaseSuggestion object from a validated AIPurchaseSuggestion.
 *
 * HARD RULES (Phase 5):
 *  1. Pure function — no Firestore reads or writes.
 *  2. Does NOT call purchaseOrderService or inventoryService.
 *  3. Does NOT create purchaseOrders, does NOT set status to PENDING/RECEIVED.
 *  4. Does NOT modify inventory.
 *  5. requiresHumanApproval is ALWAYS true.
 *  6. createdBy is ALWAYS 'human' — AI callers are BLOCKED.
 *  7. LOW and BLOCKED confidence suggestions are BLOCKED.
 *  8. Produces DRAFT_SUGGESTION_CREATED or DRAFT_SUGGESTION_BLOCKED audit event.
 *  9. Phase 6 will add the actual human-approval → purchaseOrder path.
 */

import type {
  AIPurchaseSuggestion, AISuggestionFeedback, HumanOverride,
  DraftPurchaseSuggestion, DraftPurchaseSuggestionStatus,
  AuditEvent, BlockedReason, Grams,
  TenantId, SuggestionId, SnapshotId, AuditTrailId,
} from '@/types/aiBoundary';
import { asGrams } from './unitConversionService';
import { createAuditEvent } from './aiAuditTrailHelper';

// ─── ID generation ────────────────────────────────────────────────────────────

function generateDraftId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Input / Output ───────────────────────────────────────────────────────────

export interface PrepareDraftPurchaseSuggestionInput {
  suggestion: AIPurchaseSuggestion;
  feedback?: AISuggestionFeedback;
  humanOverride?: HumanOverride;
  actorId: string;
  /** Caller type — must be 'human'; AI callers are blocked */
  actorType?: 'human' | 'ai' | 'system';
  /** Optional explicit auditTrailId; also accepted from feedback/override/suggestion */
  auditTrailId?: AuditTrailId;
  /** The ingredient this draft covers (defaults to first shortage item) */
  ingredientId?: string;
  requestId: string;
  now: Date;
}

export interface PrepareDraftPurchaseSuggestionResult {
  draftSuggestion?: DraftPurchaseSuggestion;
  auditEvent: AuditEvent;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}

// ─── prepareDraftPurchaseSuggestion ──────────────────────────────────────────

/**
 * Validates inputs and prepares a DraftPurchaseSuggestion.
 *
 * On success: returns draftSuggestion with status DRAFT_PREPARED + DRAFT_SUGGESTION_CREATED audit event.
 * On failure: returns undefined draftSuggestion + DRAFT_SUGGESTION_BLOCKED audit event.
 *
 * Never throws. Never writes Firestore. Never calls purchaseOrderService.
 */
export function prepareDraftPurchaseSuggestion(
  input: PrepareDraftPurchaseSuggestionInput,
): PrepareDraftPurchaseSuggestionResult {
  const {
    suggestion, feedback, humanOverride,
    actorId, actorType = 'human',
    requestId, now,
  } = input;

  const blocked: BlockedReason[] = [];
  const warnings: BlockedReason[] = [...suggestion.warnings];

  // ── Resolve auditTrailId from all sources ─────────────────────────────────
  const auditTrailId: AuditTrailId | undefined =
    input.auditTrailId ??
    suggestion.auditTrailId ??
    feedback?.auditTrailId ??
    humanOverride?.auditTrailId;

  // ── Resolve ingredientId ──────────────────────────────────────────────────
  const ingredientId: string =
    input.ingredientId ??
    feedback?.ingredientId ??
    humanOverride?.ingredientId ??
    suggestion.items[0]?.ingredientId ??
    '';

  // ── Identity checks ────────────────────────────────────────────────────────

  if (actorType !== 'human') {
    blocked.push('AI_DRAFT_CREATION_FORBIDDEN');
    blocked.push('DRAFT_REQUIRES_HUMAN_ACTOR');
  }
  if (!actorId) {
    blocked.push('MISSING_CALLER_ID');
  }
  if (!requestId) {
    blocked.push('MISSING_REQUEST_ID');
  }

  // ── Suggestion field checks ────────────────────────────────────────────────

  if (!suggestion.suggestionId) {
    blocked.push('MISSING_DRAFT_SUGGESTION_ID');
  }
  if (!suggestion.tenantId) {
    blocked.push('MISSING_TENANT_ID');
  }
  if (!suggestion.sourceSnapshotId) {
    blocked.push('MISSING_SNAPSHOT_ID');
  }
  if (!auditTrailId) {
    blocked.push('MISSING_AUDIT_TRAIL_ID');
  }
  if (!ingredientId) {
    blocked.push('MISSING_INGREDIENT_ID');
  }

  // ── Confidence checks ──────────────────────────────────────────────────────

  const level = suggestion.overallConfidence.level;
  if (level === 'LOW') {
    blocked.push('DRAFT_FROM_LOW_CONFIDENCE_BLOCKED');
  }
  if (level === 'BLOCKED') {
    blocked.push('DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED');
  }

  // Propagate suggestion-level blocked reasons
  for (const r of suggestion.blockedReasons) {
    if (!blocked.includes(r)) blocked.push(r);
  }

  // ── Feedback / override cross-validation ──────────────────────────────────

  if (feedback) {
    if (feedback.suggestionId !== suggestion.suggestionId) {
      blocked.push('FEEDBACK_SUGGESTION_MISMATCH');
    }
    if (auditTrailId && feedback.auditTrailId !== auditTrailId) {
      blocked.push('FEEDBACK_SUGGESTION_MISMATCH');
    }
    // 'other' reason requires a note
    if (feedback.overrideReason === 'other' && !feedback.note) {
      warnings.push('INCOMPLETE_BOM'); // signals missing required detail
    }
  }

  if (humanOverride) {
    if (humanOverride.suggestionId !== suggestion.suggestionId) {
      blocked.push('OVERRIDE_SUGGESTION_MISMATCH');
    }
    if (auditTrailId && humanOverride.auditTrailId !== auditTrailId) {
      blocked.push('OVERRIDE_SUGGESTION_MISMATCH');
    }
  }

  // ── Determine final qty ────────────────────────────────────────────────────

  const matchingItem = suggestion.items.find(i => i.ingredientId === ingredientId)
    ?? suggestion.items[0];

  const rawFinalQty: number =
    humanOverride?.finalQtyGrams ??
    feedback?.finalQtyGrams ??
    matchingItem?.suggestedQtyGrams ??
    0;

  let finalQtyGrams: Grams = rawFinalQty as Grams;
  try {
    finalQtyGrams = asGrams(rawFinalQty);
  } catch {
    blocked.push('UNKNOWN_UNIT');
  }

  // ── Early return on any block ──────────────────────────────────────────────

  if (blocked.length > 0) {
    const auditEvent = createAuditEvent({
      eventType:    'DRAFT_SUGGESTION_BLOCKED',
      actorType:    actorType === 'human' ? 'human' : 'ai',
      actorId:      actorId || 'unknown',
      at:           now,
      toState:      'BLOCKED',
      eventVersion: 1,
      metadata: {
        requestId,
        suggestionId:    suggestion.suggestionId,
        sourceSnapshotId: suggestion.sourceSnapshotId,
        auditTrailId,
        ingredientId,
        blockedReasons:  blocked,
        requiresHumanApproval: true,
      },
    });
    return { draftSuggestion: undefined, auditEvent, blockedReasons: blocked, warnings };
  }

  // ── Build DraftPurchaseSuggestion ─────────────────────────────────────────

  const draftSuggestionId = generateDraftId();
  const status: DraftPurchaseSuggestionStatus =
    level === 'HIGH' || level === 'MEDIUM'
      ? 'DRAFT_PREPARED'
      : 'BLOCKED';

  const draftSuggestion: DraftPurchaseSuggestion = {
    draftSuggestionId,
    tenantId:         suggestion.tenantId as TenantId,
    sourceSnapshotId: suggestion.sourceSnapshotId as SnapshotId,
    suggestionId:     suggestion.suggestionId as SuggestionId,
    auditTrailId:     auditTrailId as AuditTrailId,
    feedbackId:       feedback?.feedbackId,
    overrideId:       humanOverride?.overrideId,
    ingredientId,
    ingredientName:   matchingItem?.name,
    suggestedQtyGrams: matchingItem?.suggestedQtyGrams ?? (0 as Grams),
    finalQtyGrams,
    confidence:       matchingItem?.confidence ?? suggestion.overallConfidence,
    status,
    blockedReasons:   [],
    warnings,
    requiresHumanApproval: true,
    dataLineage: {
      snapshotId:        suggestion.sourceSnapshotId as SnapshotId,
      suggestionId:      suggestion.suggestionId as SuggestionId,
      feedbackId:        feedback?.feedbackId,
      overrideId:        humanOverride?.overrideId,
      sourceCollections: [], // caller should pass via snapshot; empty here (no Firestore read)
      generatedAt:       suggestion.generatedAt,
    },
    createdBy:       'human',
    createdByUserId: actorId,
    createdAt:       now,
  };

  const auditEvent = createAuditEvent({
    eventType:    'DRAFT_SUGGESTION_CREATED',
    actorType:    'human',
    actorId,
    at:           now,
    fromState:    'SUGGESTED',
    toState:      'DRAFT_PREPARED',
    eventVersion: 1,
    metadata: {
      draftSuggestionId,
      suggestionId:        suggestion.suggestionId,
      sourceSnapshotId:    suggestion.sourceSnapshotId,
      auditTrailId,
      feedbackId:          feedback?.feedbackId,
      overrideId:          humanOverride?.overrideId,
      ingredientId,
      finalQtyGrams,
      confidence:          level,
      requiresHumanApproval: true,
    },
  });

  return { draftSuggestion, auditEvent, blockedReasons: [], warnings };
}
