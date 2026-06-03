/**
 * aiBoundary.ts
 *
 * Core type definitions for the AI Decision Boundary system (Feature 001 v1.3).
 *
 * Design principles:
 *  - Branded types prevent accidental mixing of numeric domains (grams ≠ raw number)
 *  - All quantities in Grams internally; kg/taijin exist only at the UI boundary
 *  - BlockedReason is an exhaustive union so the compiler catches unhandled cases
 *  - No Firestore imports — this file is pure TypeScript, importable by scripts and tests
 */

// ─── Branded primitive types ──────────────────────────────────────────────────

/**
 * Integer gram value — the canonical internal unit for all quantities.
 * Never construct directly: use unitConversionService.toGrams() or kgToGrams().
 */
export type Grams = number & { readonly __brand: 'grams' };

/** Validated Firestore tenant identifier */
export type TenantId = string & { readonly __brand: 'tenantId' };

/** Unique identifier for an AIContextSnapshot document */
export type SnapshotId = string & { readonly __brand: 'snapshotId' };

/** Unique identifier for an ai_suggestions document */
export type SuggestionId = string & { readonly __brand: 'suggestionId' };

/** Unique identifier for an ai_audit_trails document */
export type AuditTrailId = string & { readonly __brand: 'auditTrailId' };

// ─── Unit ─────────────────────────────────────────────────────────────────────

/**
 * Supported input units for unitConversionService.toGrams().
 * 'grams' is the storage/computation unit.
 * 'kg' and 'taijin' are user-facing input units only.
 */
export type Unit = 'grams' | 'kg' | 'taijin';

// ─── CallerType ───────────────────────────────────────────────────────────────

/**
 * Identifies who is making a Firestore operation request.
 * Used by aiBoundaryService.validateOperation() to enforce write restrictions.
 */
export type CallerType = 'human' | 'ai' | 'system';

// ─── BlockedReason ────────────────────────────────────────────────────────────

/**
 * Exhaustive list of reasons why an AI operation or suggestion is blocked.
 * Every path that returns blocked: true must include at least one BlockedReason.
 * Never use a freeform string — add to this union instead.
 */
export type BlockedReason =
  // ── Data completeness ───────────────────────────────────────────────────────
  | 'MISSING_INGREDIENT_ID'
  | 'MISSING_TENANT_ID'
  | 'TENANT_MISMATCH'
  // ── Unit / conversion ────────────────────────────────────────────────────────
  | 'UNKNOWN_UNIT'
  | 'MISSING_UNIT_CONVERSION_RATE'
  | 'INVALID_UNIT_CONVERSION_RATE'
  // ── OCR / data source ────────────────────────────────────────────────────────
  | 'UNVERIFIED_OCR_SOURCE'
  | 'UNVERIFIED_OR_CONTAMINATED_SOURCE'
  // ── Snapshot ────────────────────────────────────────────────────────────────
  | 'EXPIRED_SNAPSHOT'
  | 'SNAPSHOT_TOO_LARGE'
  | 'SNAPSHOT_DEBUG_NOT_ALLOWED'
  // ── Inventory / BOM ─────────────────────────────────────────────────────────
  | 'NEGATIVE_STOCK_UNVERIFIED'
  | 'INCOMPLETE_BOM'
  // ── Write permission ────────────────────────────────────────────────────────
  | 'AI_FORBIDDEN_WRITE_ATTEMPT'
  | 'FORBIDDEN_FIELD_IN_PAYLOAD'
  // ── Audit ───────────────────────────────────────────────────────────────────
  | 'MISSING_AUDIT_TRAIL'
  | 'AUDIT_HASH_MISMATCH'
  | 'AUDIT_CONCURRENT_WRITE_CONFLICT'
  // ── Migration / quantity ─────────────────────────────────────────────────────
  | 'UNIT_MIGRATION_MISMATCH'
  | 'MISSING_GRAMS_FIELD'
  | 'LEGACY_KG_FALLBACK_USED'
  // ── Caller identity ──────────────────────────────────────────────────────────
  | 'MISSING_CALLER_TYPE'
  | 'MISSING_CALLER_ID'
  | 'MISSING_REQUEST_ID'
  // ── Snapshot / audit chain (Phase 1 Patch) ───────────────────────────────────
  | 'MISSING_SNAPSHOT_ID'
  | 'MISSING_AUDIT_TRAIL_ID'
  | 'AUDIT_VERSION_CONFLICT'
  | 'LEGACY_QUANTITY_BLOCKED_FOR_AI';

// ─── Operation validation ──────────────────────────────────────────────────────

/**
 * Describes an AI system's intention to perform a Firestore operation.
 * Passed to aiBoundaryService.validateOperation() before any write occurs.
 */
export interface AIOperationRequest {
  /** Caller-assigned unique identifier for idempotency tracking */
  operationId: string;
  tenantId: string;
  callerType: CallerType;
  /** Auth UID or service account ID */
  callerId: string;
  /** Firestore collection name, e.g. 'purchaseOrders' */
  targetCollection: string;
  /** Full document path, e.g. 'purchaseOrders/abc123' */
  targetPath: string;
  action: 'create' | 'read' | 'update' | 'delete';
  /** Subset of the intended write payload for validation — not the full document */
  payloadSummary: Record<string, unknown>;
  /** Required for all AI write operations except creating the audit trail itself */
  sourceSnapshotId?: string;
  /** Links this operation to a specific AI suggestion */
  suggestionId?: string;
  /** Links this operation to its audit trail chain */
  auditTrailId?: string;
  /** Caller-assigned unique request ID for deduplication */
  requestId: string;
  createdAt: Date;
}

export interface AIOperationValidationResult {
  allowed: boolean;
  /** Non-empty when allowed === false. Never empty on a rejection. */
  blockedReasons: BlockedReason[];
  /** Present even when allowed === true — non-fatal observations */
  warnings: BlockedReason[];
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

/**
 * A single immutable event in the audit chain.
 * Events are append-only; never update or delete.
 */
export interface AuditEvent {
  /** Discriminator string, e.g. 'SUGGESTION_GENERATED', 'HUMAN_OVERRIDE' */
  eventType: string;
  actorType: CallerType;
  actorId: string;
  at: Date;
  /** Previous lifecycle state, e.g. 'SUGGESTED' */
  fromState?: string;
  /** New lifecycle state, e.g. 'OVERRIDDEN' */
  toState?: string;
  /** Human-readable reason for the transition */
  reason?: string;
  /** Additional structured context */
  metadata?: Record<string, unknown>;
  /** SHA-256 hash of the previous event for tamper detection */
  previousEventHash?: string;
  /** SHA-256 hash of this event's canonical serialisation */
  eventHash: string;
  /** Monotonically increasing counter within the trail */
  eventVersion: number;
}

/**
 * The full audit trail document stored in ai_audit_trails/{auditTrailId}.
 * Tracks one AI suggestion from generation through to final inventory impact.
 */
export interface AIAuditTrail {
  auditTrailId: string;
  tenantId: string;
  /** The snapshot this suggestion was generated from */
  snapshotId?: string;
  suggestionId?: string;
  feedbackId?: string;
  overrideId?: string;
  draftPurchaseSuggestionId?: string;
  purchaseOrderId?: string;
  inventoryTransactionId?: string;
  status:
    | 'SUGGESTED'
    | 'OVERRIDDEN'
    | 'DRAFT_CREATED'
    | 'PENDING_APPROVED'
    | 'RECEIVED'
    | 'REJECTED'
    | 'BLOCKED';
  events: AuditEvent[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Metadata for an AIContextSnapshot document.
 * The snapshot is the sole authorised data source for AI suggestion generation.
 * Expired or contaminated snapshots must not be used to create new suggestions.
 */
export interface AIContextSnapshot {
  snapshotId: string;
  tenantId: string;
  /** 'summary' is the production default; 'debug' is for development only */
  mode: 'summary' | 'debug';
  generatedAt: Date;
  /** Snapshot must be rejected if Date.now() > expiresAt */
  expiresAt: Date;
  /** Collections read to build this snapshot */
  sourceCollections: string[];
  /** Document counts per collection — used for SNAPSHOT_TOO_LARGE checks */
  recordCounts: Record<string, number>;
  /** true when any excluded/blocked records were detected during build */
  contaminationDetected: boolean;
  contaminationReasons: BlockedReason[];
  summary?: AIContextSummary;
  createdBy: 'system' | 'ai' | 'human';
}

/**
 * Aggregated operational data included in a summary-mode snapshot.
 * All quantity fields use Grams.  Unknown or unresolvable fields are omitted.
 *
 * Phase 1: skeleton only — aggregation formulas are Phase 2.
 */
export interface AIContextSummary {
  tenantId: string;
  generatedAt: Date;
  activeMealPlanSummary?: unknown;
  inventorySummaryByIngredient?: Record<string, unknown>;
  /** Required grams per ingredient for planned meals */
  requiredQtyGramsByIngredient?: Record<string, Grams>;
  /** Shortage (required − stock) per ingredient, in grams */
  shortageQtyGramsByIngredient?: Record<string, Grams>;
  /** Sum of RECEIVED purchase order quantities per ingredient (last N days) */
  recentPurchaseTotalsGramsByIngredient?: Record<string, Grams>;
  /** Rolling average daily usage per ingredient */
  averageDailyUsageGramsByIngredient?: Record<string, Grams>;
  wasteRiskSummaryByIngredient?: Record<string, unknown>;
  settingsSummary?: Record<string, unknown>;
}

// ─── Confidence (v1.3 upgrade) ────────────────────────────────────────────────

/**
 * Confidence level for an AI purchase suggestion.
 *
 * HIGH  — all data complete, verified, snapshot current
 * MEDIUM — minor gaps, no OCR contamination, snapshot current
 * LOW    — notable gaps; human review required before DRAFT creation
 * BLOCKED — hard stop; must not generate any purchase action
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';

export interface SuggestionConfidenceV2 {
  level: ConfidenceLevel;
  reasons: string[];
  blockReason: BlockedReason | null;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  canCreateDraft: boolean;
  /** The snapshot this confidence evaluation is based on */
  sourceSnapshotId?: string;
}
