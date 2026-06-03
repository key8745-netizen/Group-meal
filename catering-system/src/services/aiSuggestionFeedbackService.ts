/**
 * aiSuggestionFeedbackService.ts
 *
 * Creates feedback + override objects when a human overrides an AI suggestion.
 *
 * HARD RULES (Phase 4):
 *  1. Pure function — no Firestore reads or writes.
 *  2. Does NOT call purchaseOrderService or inventoryService.
 *  3. Does NOT create draft purchase suggestions.
 *  4. Produces SUGGESTION_OVERRIDDEN audit event only.
 *  5. finalQtyGrams MUST pass asGrams() validation.
 *  6. overrideReason is mandatory.
 *  7. actorType is always 'human'.
 */

import type {
  AIPurchaseSuggestion, AISuggestionFeedback, HumanOverride,
  AuditEvent, BlockedReason, Grams, TenantId, SuggestionId,
  SnapshotId, AuditTrailId, OverrideReason,
} from '@/types/aiBoundary';
import { asGrams } from './unitConversionService';
import { createAuditEvent } from './aiAuditTrailHelper';

// ─── ID generation ────────────────────────────────────────────────────────────

function generateFeedbackId(): string {
  return `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateOverrideId(): string {
  return `ov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Input / Output ───────────────────────────────────────────────────────────

export interface CreateAISuggestionFeedbackInput {
  suggestion: AIPurchaseSuggestion;
  /** The ingredient line being overridden */
  ingredientId: string;
  /** The human's final quantity decision, already in grams */
  finalQtyGrams: Grams;
  overrideReason: OverrideReason;
  note?: string;
  actorId: string;
  auditTrailId: AuditTrailId;
  now: Date;
}

export interface CreateAISuggestionFeedbackResult {
  feedback: AISuggestionFeedback;
  humanOverride: HumanOverride;
  auditEvent: AuditEvent;
  /** Non-empty when the inputs are invalid — caller must not persist if non-empty */
  blockedReasons: BlockedReason[];
}

// ─── createAISuggestionFeedback ───────────────────────────────────────────────

/**
 * Builds feedback + override + audit event for a human quantity override.
 * Returns blockedReasons (non-empty on failure) instead of throwing, so the
 * UI can display a meaningful error without a try/catch.
 *
 * No Firestore writes. No purchase order creation. No draft suggestion.
 */
export function createAISuggestionFeedback(
  input: CreateAISuggestionFeedbackInput,
): CreateAISuggestionFeedbackResult {
  const {
    suggestion, ingredientId, finalQtyGrams, overrideReason,
    note, actorId, auditTrailId, now,
  } = input;

  const blocked: BlockedReason[] = [];

  // ── Validation ─────────────────────────────────────────────────────────────

  if (!suggestion.suggestionId) {
    blocked.push('MISSING_INGREDIENT_ID'); // closest available reason
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
  if (!actorId) {
    blocked.push('MISSING_CALLER_ID');
  }
  if (!overrideReason) {
    blocked.push('INCOMPLETE_BOM'); // signals missing required field
  }
  if (!ingredientId) {
    blocked.push('MISSING_INGREDIENT_ID');
  }

  // Validate finalQtyGrams — asGrams throws on invalid value; catch and record
  let validatedFinalQty: Grams = finalQtyGrams;
  try {
    validatedFinalQty = asGrams(finalQtyGrams);
  } catch {
    blocked.push('UNKNOWN_UNIT');
  }

  if (blocked.length > 0) {
    // Return a sentinel result — caller must NOT persist
    const nullAudit = createAuditEvent({
      eventType: 'SUGGESTION_OVERRIDDEN',
      actorType: 'human',
      actorId: actorId || 'unknown',
      at: now,
      toState: 'BLOCKED',
      eventVersion: 1,
      metadata: { blockedReasons: blocked },
    });
    return {
      feedback: null as unknown as AISuggestionFeedback,
      humanOverride: null as unknown as HumanOverride,
      auditEvent: nullAudit,
      blockedReasons: blocked,
    };
  }

  // ── Find original qty from the suggestion item ─────────────────────────────

  const matchingItem = suggestion.items.find(i => i.ingredientId === ingredientId);
  const originalRecommendedQtyGrams: Grams =
    matchingItem?.suggestedQtyGrams ?? (0 as Grams);

  // ── Build objects ──────────────────────────────────────────────────────────

  const feedbackId = generateFeedbackId();
  const overrideId = generateOverrideId();

  const feedback: AISuggestionFeedback = {
    feedbackId,
    tenantId:                   suggestion.tenantId as TenantId,
    suggestionId:               suggestion.suggestionId as SuggestionId,
    sourceSnapshotId:           suggestion.sourceSnapshotId as SnapshotId,
    auditTrailId,
    ingredientId,
    originalRecommendedQtyGrams,
    finalQtyGrams:              validatedFinalQty,
    overrideReason,
    note,
    actorType:                  'human',
    actorId,
    createdAt:                  now,
  };

  const humanOverride: HumanOverride = {
    overrideId,
    tenantId:        suggestion.tenantId as TenantId,
    suggestionId:    suggestion.suggestionId as SuggestionId,
    auditTrailId,
    ingredientId,
    originalQtyGrams: originalRecommendedQtyGrams,
    finalQtyGrams:    validatedFinalQty,
    reason:           overrideReason,
    note,
    createdBy:        actorId,
    createdAt:        now,
  };

  const auditEvent = createAuditEvent({
    eventType:    'SUGGESTION_OVERRIDDEN',
    actorType:    'human',
    actorId,
    at:           now,
    fromState:    'SUGGESTED',
    toState:      'OVERRIDDEN',
    eventVersion: 1,
    metadata: {
      feedbackId,
      overrideId,
      suggestionId:       suggestion.suggestionId,
      sourceSnapshotId:   suggestion.sourceSnapshotId,
      auditTrailId,
      ingredientId,
      originalQtyGrams:   originalRecommendedQtyGrams,
      finalQtyGrams:      validatedFinalQty,
      overrideReason,
    },
  });

  return { feedback, humanOverride, auditEvent, blockedReasons: [] };
}

// ─── createSuggestionViewedEvent ─────────────────────────────────────────────

/**
 * Produces a SUGGESTION_VIEWED audit event when a user opens a suggestion card.
 * Pure function — no writes.
 */
export function createSuggestionViewedEvent(input: {
  suggestion: AIPurchaseSuggestion;
  actorId: string;
  now: Date;
}): AuditEvent {
  const { suggestion, actorId, now } = input;
  return createAuditEvent({
    eventType:    'SUGGESTION_VIEWED',
    actorType:    'human',
    actorId,
    at:           now,
    toState:      'SUGGESTED',
    eventVersion: 1,
    metadata: {
      suggestionId:     suggestion.suggestionId,
      sourceSnapshotId: suggestion.sourceSnapshotId,
      tenantId:         suggestion.tenantId,
      overallLevel:     suggestion.overallConfidence.level,
      itemCount:        suggestion.items.length,
    },
  });
}
