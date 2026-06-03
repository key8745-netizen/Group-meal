/**
 * aiSuggestionService.ts
 *
 * Generates AI purchase suggestions from a validated AIContextSnapshot.
 *
 * HARD RULES (Phase 3):
 *  1. Pure function — no Firestore reads or writes.
 *  2. validateSnapshotForSuggestion() MUST pass before any suggestion is built.
 *  3. All returned AIPurchaseSuggestion objects have usableForDraft: false.
 *     Phase 4 adds the human-approval path.
 *  4. No draft purchase orders, no inventory writes, no purchaseOrders writes.
 *  5. All quantities use Grams branded type.
 *  6. Every suggestion includes a SUGGESTION_GENERATED audit event.
 *  7. The snapshot is the SOLE data source — no external Firestore reads.
 *  8. Contaminated, expired, or debug snapshots → immediately BLOCKED.
 */

import type {
  AIContextSnapshot, AIPurchaseSuggestion, PurchaseSuggestionItem,
  SuggestionId, Grams, BlockedReason, AuditEvent, AIOperationRequest,
} from '@/types/aiBoundary';
import { validateSnapshotForSuggestion } from './aiSnapshotValidationService';
import { validateAIOperationOrThrow } from './aiBoundaryService';
import { gradeIngredientConfidence, gradeOverallConfidence } from './aiConfidenceService';
import { createAuditEvent } from './aiAuditTrailHelper';
import { asGrams } from './unitConversionService';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Suggestion expires 2 hours after generation (shorter than snapshot TTL) */
const SUGGESTION_TTL_MS = 2 * 60 * 60 * 1000;

/** Only generate suggestion items where shortage > 0 */
const MIN_SHORTAGE_GRAMS = 0;

// ─── ID generation ────────────────────────────────────────────────────────────

function generateSuggestionId(): SuggestionId {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `sug_${ts}_${rand}` as SuggestionId;
}

// ─── BuildAIPurchaseSuggestionInput ───────────────────────────────────────────

export interface BuildAIPurchaseSuggestionInput {
  snapshot: AIContextSnapshot;
  now: Date;
  /** The operation context for audit + boundary validation */
  operation: AIOperationRequest;
}

export interface BuildAIPurchaseSuggestionResult {
  suggestion: AIPurchaseSuggestion;
  /** Audit event to persist before any downstream action (Phase 4+) */
  auditEvent: AuditEvent;
}

// ─── buildAIPurchaseSuggestion ────────────────────────────────────────────────

/**
 * Generates an AI purchase suggestion from a validated AIContextSnapshot.
 *
 * Steps:
 *  1. validateAIOperationOrThrow — identity guard
 *  2. validateSnapshotForSuggestion — snapshot freshness / contamination / mode
 *  3. For each ingredient with shortage > 0, build a PurchaseSuggestionItem
 *  4. Grade per-item and overall confidence
 *  5. Produce SUGGESTION_GENERATED audit event
 *  6. Return { suggestion, auditEvent } — nothing is written to Firestore
 *
 * Throws AIOperationBlockedError if the operation identity is invalid.
 * Returns a suggestion with overallConfidence.level === 'BLOCKED' if the
 * snapshot fails validation — never throws for data-quality failures.
 */
export function buildAIPurchaseSuggestion(
  input: BuildAIPurchaseSuggestionInput,
): BuildAIPurchaseSuggestionResult {
  const { snapshot, now, operation } = input;

  // ── Guard 1: backend operation identity ──────────────────────────────────
  validateAIOperationOrThrow(operation);

  // ── Guard 2: snapshot validation ─────────────────────────────────────────
  const snapValidation = validateSnapshotForSuggestion(snapshot, now);

  if (!snapValidation.allowed) {
    // Return a BLOCKED suggestion — do not throw
    return blockedSuggestion({
      snapshot, now, operation,
      blockedReasons: snapValidation.blockedReasons,
      warnings: snapValidation.warnings,
    });
  }

  const summary = snapshot.summary!; // guaranteed by validateSnapshotForSuggestion

  // ── Guard 3: tenant consistency ───────────────────────────────────────────
  if (summary.tenantId !== snapshot.tenantId) {
    return blockedSuggestion({
      snapshot, now, operation,
      blockedReasons: ['TENANT_MISMATCH'],
      warnings: [],
    });
  }

  // ── Build per-ingredient items ────────────────────────────────────────────
  const items: PurchaseSuggestionItem[] = [];
  const itemBlockedReasons: BlockedReason[] = [];

  for (const [ingredientId, shortageGrams] of Object.entries(summary.shortageQtyGramsByIngredient)) {
    if (shortageGrams <= MIN_SHORTAGE_GRAMS) continue;

    const inventorySummary = summary.inventorySummaryByIngredient[ingredientId];
    const currentStockGrams = inventorySummary?.currentStockGrams ?? (0 as Grams);
    const averageDailyUsageGrams = summary.averageDailyUsageGramsByIngredient[ingredientId];

    const confidence = gradeIngredientConfidence({
      ingredientId,
      shortageGrams,
      averageDailyUsageGrams,
      inventorySummary,
      summaryWarnings: summary.warnings,
      summaryBlockedReasons: summary.blockedReasons,
      sourceSnapshotId: snapshot.snapshotId,
    });

    for (const r of confidence.blockedReasons) {
      if (!itemBlockedReasons.includes(r)) itemBlockedReasons.push(r);
    }

    let suggestedQtyGrams: Grams;
    try {
      // Suggest: shortage + 10% buffer, rounded to nearest gram
      suggestedQtyGrams = asGrams(Math.round(shortageGrams * 1.1));
    } catch {
      suggestedQtyGrams = shortageGrams;
    }

    items.push({
      ingredientId,
      name:                  inventorySummary?.name ?? ingredientId,
      suggestedQtyGrams,
      currentStockGrams,
      shortageGrams,
      averageDailyUsageGrams,
      confidence,
    });
  }

  // ── Overall confidence ────────────────────────────────────────────────────
  const overallConfidence = gradeOverallConfidence(
    items.map(i => i.confidence),
    summary.warnings,
    [...summary.blockedReasons, ...itemBlockedReasons],
    snapshot.snapshotId,
  );

  const allWarnings = overallConfidence.warnings;
  const allBlocked  = overallConfidence.blockedReasons;

  // ── Build suggestion ──────────────────────────────────────────────────────
  const suggestionId = generateSuggestionId();

  const suggestion: AIPurchaseSuggestion = {
    suggestionId,
    tenantId:         snapshot.tenantId,
    sourceSnapshotId: snapshot.snapshotId,
    generatedAt:      now,
    expiresAt:        new Date(now.getTime() + SUGGESTION_TTL_MS),
    items,
    overallConfidence,
    usableForDraft:   false, // Phase 3: always false
    blockedReasons:   allBlocked,
    warnings:         allWarnings,
    auditEvent:       {} as AuditEvent, // placeholder; replaced below
  };

  // ── Audit event ───────────────────────────────────────────────────────────
  const auditEvent = createAuditEvent({
    eventType:    'SUGGESTION_GENERATED',
    actorType:    operation.callerType,
    actorId:      operation.callerId,
    at:           now,
    toState:      'SUGGESTED',
    eventVersion: 1,
    metadata: {
      suggestionId,
      snapshotId:        snapshot.snapshotId,
      tenantId:          snapshot.tenantId,
      overallLevel:      overallConfidence.level,
      itemCount:         items.length,
      usableForDraft:    false,
    },
  });

  // Attach audit event to suggestion
  const finalSuggestion: AIPurchaseSuggestion = { ...suggestion, auditEvent };

  return { suggestion: finalSuggestion, auditEvent };
}

// ─── blockedSuggestion ────────────────────────────────────────────────────────

function blockedSuggestion(input: {
  snapshot: AIContextSnapshot;
  now: Date;
  operation: AIOperationRequest;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
}): BuildAIPurchaseSuggestionResult {
  const { snapshot, now, operation, blockedReasons, warnings } = input;
  const suggestionId = generateSuggestionId();

  const overallConfidence = {
    level:          'BLOCKED' as const,
    reasons:        blockedReasons.map(r => String(r)),
    blockReason:    blockedReasons[0] ?? null,
    blockedReasons,
    warnings,
    canCreateDraft: false as const,
    sourceSnapshotId: snapshot.snapshotId,
  };

  const auditEvent = createAuditEvent({
    eventType:    'SUGGESTION_GENERATED',
    actorType:    operation.callerType,
    actorId:      operation.callerId,
    at:           now,
    toState:      'BLOCKED',
    eventVersion: 1,
    metadata: {
      suggestionId,
      snapshotId:     snapshot.snapshotId,
      tenantId:       snapshot.tenantId,
      overallLevel:   'BLOCKED',
      blockedReasons,
      usableForDraft: false,
    },
  });

  const suggestion: AIPurchaseSuggestion = {
    suggestionId,
    tenantId:         snapshot.tenantId,
    sourceSnapshotId: snapshot.snapshotId,
    generatedAt:      now,
    expiresAt:        new Date(now.getTime() + SUGGESTION_TTL_MS),
    items:            [],
    overallConfidence,
    usableForDraft:   false,
    blockedReasons,
    warnings,
    auditEvent,
  };

  return { suggestion, auditEvent };
}
