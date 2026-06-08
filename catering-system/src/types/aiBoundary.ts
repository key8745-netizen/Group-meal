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
  | 'LEGACY_QUANTITY_BLOCKED_FOR_AI'
  // ── Draft purchase suggestion (Phase 5) ──────────────────────────────────────
  | 'MISSING_DRAFT_SUGGESTION_ID'
  | 'DRAFT_REQUIRES_HUMAN_ACTOR'
  | 'DRAFT_FROM_LOW_CONFIDENCE_BLOCKED'
  | 'DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED'
  | 'FEEDBACK_SUGGESTION_MISMATCH'
  | 'OVERRIDE_SUGGESTION_MISMATCH'
  | 'AI_DRAFT_CREATION_FORBIDDEN'
  // ── Human approval / purchase order (Phase 6) ─────────────────────────────
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'MISSING_HUMAN_APPROVER'
  | 'PURCHASE_ORDER_DRAFT_ONLY'
  | 'AI_PURCHASE_APPROVAL_FORBIDDEN'
  | 'PURCHASE_ORDER_PENDING_FORBIDDEN'
  | 'PURCHASE_ORDER_RECEIVED_FORBIDDEN'
  | 'MISSING_APPROVAL_ID'
  | 'AI_PURCHASE_SUBMIT_FORBIDDEN'
  // ── Human submit (Phase 7) ────────────────────────────────────────────────
  | 'HUMAN_SUBMIT_REQUIRED'
  | 'MISSING_HUMAN_SUBMITTER'
  | 'PURCHASE_ORDER_DRAFT_REQUIRED'
  | 'PURCHASE_ORDER_PENDING_ONLY'
  | 'MISSING_SUBMIT_ID'
  | 'RECEIVING_CONFIRMATION_REQUIRED'
  // ── Receiving boundary (Feature 002) ─────────────────────────────────────
  | 'AI_RECEIVING_FORBIDDEN'
  | 'AI_INVENTORY_UPDATE_FORBIDDEN'
  | 'DUPLICATE_RECEIVING_ATTEMPT'
  | 'PURCHASE_ORDER_ALREADY_RECEIVED'
  | 'PURCHASE_ORDER_NOT_PENDING'
  | 'MISSING_RECEIVING_TOKEN'
  | 'MISSING_HUMAN_RECEIVER'
  | 'MISSING_INVENTORY_TRANSACTION_ID'
  | 'RECEIVING_DELTA_NOTE_REQUIRED'
  | 'INVALID_RECEIVED_QTY'
  | 'RECEIVED_QTY_GRAMS_REQUIRED'
  | 'INVENTORY_TRANSACTION_FAILED'
  | 'INVENTORY_UPDATE_FAILED'
  | 'PURCHASE_ORDER_STATUS_TRANSITION_INVALID'
  | 'PERFORMANCE_LOG_WRITE_FORBIDDEN'
  | 'AI_RULE_MUTATION_FORBIDDEN'
  | 'RECEIVING_LOCK_EXPIRED'
  | 'RECEIVING_LOCK_ACTIVE'
  // ── Prediction engine (Feature 003) ──────────────────────────────────────
  | 'PREDICTION_RAW_DATA_DETECTED'
  | 'PREDICTION_TENANT_MISMATCH'
  | 'PREDICTION_SAMPLE_TOO_SMALL'
  | 'PREDICTION_INSUFFICIENT_HISTORY'
  | 'PREDICTION_SINGLE_SOURCE_RISK'
  | 'PREDICTION_AGGREGATE_DISCLOSURE_RISK'
  | 'PREDICTION_SOURCE_SAMPLE_TOO_SMALL'
  | 'PREDICTION_LOW_DATA_QUALITY'
  | 'PREDICTION_INVALID_FACTOR'
  | 'PREDICTION_MAX_LIMIT_MISSING'
  | 'PREDICTION_NEGATIVE_QUANTITY'
  | 'PREDICTION_AI_WRITE_FORBIDDEN'
  | 'PREDICTION_AI_RULE_MUTATION_FORBIDDEN'
  | 'MODEL_CONFIG_REQUIRES_HUMAN_APPROVAL'
  | 'ADAPTER_TENANT_MISMATCH'
  | 'ADAPTER_SNAPSHOT_MISMATCH'
  | 'ADAPTER_AUDIT_TRAIL_MISMATCH'
  | 'ADAPTER_MISSING_SUGGESTION_ID'
  | 'ADAPTER_MISSING_PREDICTION_ID'
  | 'ADAPTER_PREDICTION_BLOCKED'
  | 'ADAPTER_AI_WRITE_GUARD'
  | 'ADAPTER_RAW_DATA_GUARD'
  | 'MODEL_CONFIG_WEIGHT_OUT_OF_RANGE'
  // Feature 004: Model Config Apply Boundary
  | 'CONFIG_APPLY_TENANT_MISMATCH'
  | 'CONFIG_APPLY_AI_CALLER_BLOCKED'
  | 'CONFIG_APPLY_MISSING_HUMAN_APPROVAL_ID'
  | 'CONFIG_APPLY_MISSING_AUDIT_TRAIL_ID'
  | 'CONFIG_APPLY_MISSING_SOURCE_RECOMMENDATION_ID'
  | 'CONFIG_APPLY_MISSING_APPLY_TOKEN'
  | 'CONFIG_APPLY_MISSING_PREVIOUS_VERSION'
  | 'CONFIG_APPLY_MISSING_PROPOSED_VERSION'
  | 'CONFIG_APPLY_INVALID_WEIGHT'
  | 'CONFIG_APPLY_WEIGHT_OUT_OF_BOUNDS'
  | 'CONFIG_APPLY_WEIGHT_NAN'
  | 'CONFIG_APPLY_WEIGHT_INFINITY'
  | 'CONFIG_APPLY_NORMALIZED_SUM_OUT_OF_RANGE'
  | 'CONFIG_APPLY_NO_WEIGHT_CHANGES'
  | 'CONFIG_ROLLBACK_TENANT_MISMATCH'
  | 'CONFIG_ROLLBACK_AI_CALLER_BLOCKED'
  | 'CONFIG_ROLLBACK_MISSING_TARGET_VERSION'
  | 'CONFIG_ROLLBACK_MISSING_ROLLBACK_TOKEN'
  | 'CONFIG_ROLLBACK_MISSING_AUDIT_TRAIL_ID'
  | 'CONFIG_ROLLBACK_MISSING_ROLLBACK_REASON'
  | 'CONFIG_ROLLBACK_SAME_VERSION'
  | 'CONFIG_DIFF_INVALID_WEIGHTS'
  | 'CONFIG_DIFF_NO_CHANGES'
  // Feature 004 Phase 2: Recommendation → Apply adapter
  | 'ADAPTER_RECOMMENDATION_TENANT_MISMATCH'
  | 'ADAPTER_APPROVAL_TENANT_MISMATCH'
  | 'ADAPTER_RECOMMENDATION_ID_MISMATCH'
  | 'ADAPTER_AUDIT_TRAIL_MISMATCH'
  | 'ADAPTER_MISSING_APPROVED_BY_USER'
  | 'ADAPTER_MISSING_APPROVAL_REASON'
  | 'ADAPTER_RECOMMENDATION_AI_APPLY_GUARD'
  | 'ADAPTER_RECOMMENDATION_HUMAN_APPROVAL_REQUIRED'
  // Feature 005: Real Apply Execution Preflight
  | 'EXEC_TENANT_MISMATCH'
  | 'EXEC_AI_CALLER_BLOCKED'
  | 'EXEC_MISSING_APPROVAL_ID'
  | 'EXEC_MISSING_AUDIT_TRAIL_ID'
  | 'EXEC_MISSING_EXPECTED_VERSION'
  | 'EXEC_MISSING_APPLY_TOKEN'
  | 'EXEC_APPROVAL_NOT_APPROVED'
  | 'EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH'
  | 'EXEC_MISSING_DIFF_HASH'
  | 'EXEC_MISSING_BEFORE_HASH'
  | 'EXEC_MISSING_AFTER_HASH'
  | 'EXEC_INVALID_PROPOSED_WEIGHTS'
  | 'EXEC_APPROVAL_TENANT_MISMATCH'
  // Feature 005: Rollback Preflight
  | 'ROLLBACK_EXEC_TENANT_MISMATCH'
  | 'ROLLBACK_EXEC_AI_CALLER_BLOCKED'
  | 'ROLLBACK_EXEC_MISSING_APPROVAL_ID'
  | 'ROLLBACK_EXEC_MISSING_AUDIT_TRAIL_ID'
  | 'ROLLBACK_EXEC_MISSING_ROLLBACK_TARGET_VERSION'
  | 'ROLLBACK_EXEC_MISSING_EXPECTED_VERSION'
  | 'ROLLBACK_EXEC_MISSING_ROLLBACK_TOKEN'
  | 'ROLLBACK_EXEC_MISSING_ROLLBACK_REASON'
  | 'ROLLBACK_EXEC_APPROVAL_NOT_APPROVED'
  | 'ROLLBACK_EXEC_APPROVAL_TENANT_MISMATCH'
  | 'ROLLBACK_EXEC_SAME_VERSION'
  // Feature 005: Transaction Plan
  | 'TXPLAN_TOKEN_MISSING'
  | 'TXPLAN_TOKEN_MISMATCH'
  | 'TXPLAN_DUPLICATE_BLOCKED_BY_IDEMPOTENCY'
  // Feature 005: Canonical JSON
  | 'CANONICAL_BIGINT_NOT_SUPPORTED'
  | 'CANONICAL_NAN_NOT_SUPPORTED'
  | 'CANONICAL_INFINITY_NOT_SUPPORTED'
  | 'CANONICAL_UNDEFINED_NOT_SUPPORTED'
  | 'CANONICAL_FUNCTION_NOT_SUPPORTED'
  | 'CANONICAL_SYMBOL_NOT_SUPPORTED'
  | 'CANONICAL_CIRCULAR_REFERENCE'
  // Feature 005 Phase 3: Idempotency conflict modeling
  | 'IDEMPOTENCY_DUPLICATE_ROLLBACK_TOKEN'
  | 'IDEMPOTENCY_REPLAY_BLOCKED'
  | 'IDEMPOTENCY_VERSION_CONFLICT'
  | 'IDEMPOTENCY_APPROVAL_REUSE_BLOCKED'
  | 'IDEMPOTENCY_VERSION_CHAIN_CONFLICT'
  // Feature 005 Phase 3: Audit continuity cross-validation
  | 'AUDIT_CONTINUITY_TENANT_MISMATCH'
  | 'AUDIT_CONTINUITY_APPROVAL_ID_MISMATCH'
  | 'AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH'
  | 'AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH'
  | 'AUDIT_CONTINUITY_VERSION_MISMATCH'
  | 'AUDIT_CONTINUITY_DIFF_HASH_MISMATCH'
  | 'AUDIT_CONTINUITY_CONFIG_BEFORE_HASH_MISMATCH'
  | 'AUDIT_CONTINUITY_CONFIG_AFTER_HASH_MISMATCH'
  | 'AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH'
  | 'AUDIT_CONTINUITY_ROLLBACK_TOKEN_MISMATCH'
  | 'AUDIT_CONTINUITY_ROLLBACK_TARGET_VERSION_MISMATCH'
  // Feature 005 Phase 4: Rollback reason + target version boundaries
  | 'ROLLBACK_REASON_TOO_LONG'
  | 'ROLLBACK_REASON_INVALID_CHARS'
  | 'ROLLBACK_TARGET_VERSION_INVALID'
  // Feature 006 Phase 1: Real Apply Transaction Contract
  | 'REAL_APPLY_TENANT_MISMATCH'
  | 'REAL_APPLY_AI_CALLER_BLOCKED'
  | 'REAL_APPLY_APPROVAL_NOT_APPROVED'
  | 'REAL_APPLY_APPROVAL_EXPIRED'
  | 'REAL_APPLY_EXPECTED_VERSION_MISMATCH'
  | 'REAL_APPLY_IDEMPOTENCY_LOCK_EXISTS'
  | 'REAL_APPLY_IDEMPOTENCY_REPLAY_BLOCKED'
  | 'REAL_APPLY_HISTORICAL_CONFIG_HASH_MISMATCH'
  | 'REAL_APPLY_CONFIG_BEFORE_HASH_MISMATCH'
  | 'REAL_APPLY_DIFF_HASH_MISMATCH'
  | 'REAL_APPLY_SOURCE_REC_MISMATCH'
  | 'REAL_APPLY_MISSING_HUMAN_APPROVER'
  | 'REAL_APPLY_MISSING_APPROVAL_REASON'
  | 'REAL_APPLY_MISSING_APPLY_TOKEN'
  | 'REAL_APPLY_MISSING_AUDIT_TRAIL'
  | 'REAL_APPLY_SETTINGS_HISTORY_WRITE_CONFLICT'
  // Feature 006 Phase 1: Real Rollback Transaction Contract
  | 'REAL_ROLLBACK_TENANT_MISMATCH'
  | 'REAL_ROLLBACK_AI_CALLER_BLOCKED'
  | 'REAL_ROLLBACK_APPROVAL_NOT_APPROVED'
  | 'REAL_ROLLBACK_APPROVAL_EXPIRED'
  | 'REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'
  | 'REAL_ROLLBACK_SAME_VERSION'
  | 'REAL_ROLLBACK_IDEMPOTENCY_LOCK_EXISTS'
  | 'REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND'
  | 'REAL_ROLLBACK_MISSING_ROLLBACK_TOKEN'
  | 'REAL_ROLLBACK_MISSING_ROLLBACK_REASON'
  | 'REAL_ROLLBACK_REASON_HASH_MISMATCH'
  | 'REAL_ROLLBACK_MISSING_AUDIT_TRAIL'
  | 'REAL_ROLLBACK_MISSING_HUMAN_APPROVER'
  // Feature 006 Phase 1: Idempotency Lock Schema
  | 'LOCK_SCHEMA_MISSING_TOKEN'
  | 'LOCK_SCHEMA_MISSING_TENANT'
  | 'LOCK_SCHEMA_MISSING_APPROVAL'
  | 'LOCK_SCHEMA_MISSING_AUDIT_TRAIL'
  | 'LOCK_SCHEMA_TTL_INVALID'
  | 'LOCK_SCHEMA_CLEANUP_UNDEFINED'
  | 'LOCK_SCHEMA_EXPIRES_BEFORE_CREATED'
  | 'LOCK_SCHEMA_DOCUMENT_PATH_INVALID'
  // Feature 007 Phase 1: Real Apply Transaction Execution Guard
  | 'REAL_EXEC_TENANT_MISMATCH'
  | 'REAL_EXEC_AI_CALLER_BLOCKED'
  | 'REAL_EXEC_UNKNOWN_CALLER_TYPE'
  | 'REAL_EXEC_MISSING_CALLER_CONTEXT'
  | 'REAL_EXEC_MISSING_HUMAN_USER_ID'
  | 'REAL_EXEC_SERVICE_ACCOUNT_INSUFFICIENT'
  | 'REAL_EXEC_ADMIN_SDK_NOT_SUFFICIENT'
  | 'REAL_EXEC_MISSING_APPROVAL_ID'
  | 'REAL_EXEC_MISSING_AUDIT_TRAIL_ID'
  | 'REAL_EXEC_MISSING_EXPECTED_VERSION'
  | 'REAL_EXEC_MISSING_APPLY_TOKEN'
  | 'REAL_EXEC_MISSING_NEW_VERSION'
  | 'REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID'
  // Feature 007 Phase 1: Canonicalization
  | 'REAL_EXEC_CANONICAL_BIGINT_BLOCKED'
  | 'REAL_EXEC_CANONICAL_NAN_BLOCKED'
  | 'REAL_EXEC_CANONICAL_INFINITY_BLOCKED'
  | 'REAL_EXEC_CANONICAL_UNDEFINED_BLOCKED'
  | 'REAL_EXEC_CANONICAL_FUNCTION_BLOCKED'
  | 'REAL_EXEC_CANONICAL_SYMBOL_BLOCKED'
  | 'REAL_EXEC_CANONICAL_CIRCULAR_REFERENCE'
  | 'REAL_EXEC_CANONICAL_DATE_NOT_SERIALIZABLE'
  | 'REAL_EXEC_CONFIG_HASH_MISMATCH'
  // Feature 007 Phase 1: Idempotency lock schema
  | 'REAL_EXEC_LOCK_MISSING_TOKEN'
  | 'REAL_EXEC_LOCK_MISSING_TENANT'
  | 'REAL_EXEC_LOCK_MISSING_APPROVAL'
  | 'REAL_EXEC_LOCK_MISSING_PAYLOAD_HASH'
  | 'REAL_EXEC_LOCK_MISSING_EXPECTED_VERSION'
  | 'REAL_EXEC_LOCK_INVALID_STATUS'
  | 'REAL_EXEC_LOCK_TTL_INVALID'
  | 'REAL_EXEC_LOCK_DUPLICATE_TOKEN'
  | 'REAL_EXEC_LOCK_APPROVAL_REUSE'
  | 'REAL_EXEC_LOCK_VERSION_CONFLICT'
  | 'REAL_EXEC_LOCK_AI_OWNER_BLOCKED'
  // Feature 007 Phase 2: Guard edge-case hardening
  | 'REAL_EXEC_CALLER_CONTEXT_MALFORMED'
  | 'REAL_EXEC_TOKEN_CLAIMS_SPOOFED'
  | 'REAL_EXEC_SIGN_IN_PROVIDER_INVALID'
  | 'REAL_EXEC_SIGN_IN_PROVIDER_MISSING'
  // Feature 007 Phase 2: Hash continuity
  | 'REAL_EXEC_CURRENT_CONFIG_HASH_MISMATCH'
  | 'REAL_EXEC_CONFIG_BEFORE_HASH_MISSING'
  | 'REAL_EXEC_CONFIG_AFTER_HASH_MISSING'
  | 'REAL_EXEC_DIFF_HASH_MISSING'
  | 'REAL_EXEC_HASH_CONTINUITY_BROKEN'
  | 'REAL_EXEC_AUDIT_HASH_MISMATCH'
  | 'REAL_EXEC_AUDIT_TOKEN_MISMATCH'
  | 'REAL_EXEC_AUDIT_TRAIL_ID_MISMATCH'
  | 'REAL_EXEC_AUDIT_APPROVAL_ID_MISMATCH'
  | 'REAL_EXEC_AUDIT_SOURCE_REC_MISMATCH'
  // Feature 007 Phase 3: Advanced guard hardening
  | 'REAL_EXEC_PROVIDER_FORGED'
  | 'REAL_EXEC_PROVIDER_USER_MISMATCH'
  | 'REAL_EXEC_SERVICE_ACCOUNT_FORGED_HUMAN_CONTEXT'
  | 'REAL_EXEC_ADMIN_SDK_FORGED_HUMAN_CONTEXT'
  | 'REAL_EXEC_CALLER_TYPE_PROVIDER_MISMATCH'
  | 'REAL_EXEC_TOKEN_TENANT_MISMATCH'
  | 'REAL_EXEC_ROLE_CLAIM_UNTRUSTED'
  // Feature 007 Phase 3: Full-chain hash propagation
  | 'REAL_EXEC_APPROVAL_BEFORE_HASH_MISMATCH'
  | 'REAL_EXEC_APPROVAL_AFTER_HASH_MISMATCH'
  | 'REAL_EXEC_APPROVAL_DIFF_HASH_MISMATCH'
  | 'REAL_EXEC_APPROVAL_APPLY_TOKEN_MISMATCH'
  | 'REAL_EXEC_APPROVAL_AUDIT_TRAIL_MISMATCH'
  | 'REAL_EXEC_CHAIN_PLAN_BEFORE_HASH_MISMATCH'
  | 'REAL_EXEC_CHAIN_PLAN_AFTER_HASH_MISMATCH'
  | 'REAL_EXEC_CHAIN_PLAN_DIFF_HASH_MISMATCH'
  | 'REAL_EXEC_CHAIN_PLAN_APPLY_TOKEN_MISMATCH'
  | 'REAL_EXEC_CHAIN_PLAN_AUDIT_TRAIL_MISMATCH'
  | 'REAL_EXEC_CHAIN_AUDIT_BEFORE_HASH_MISMATCH'
  | 'REAL_EXEC_CHAIN_AUDIT_AFTER_HASH_MISMATCH'
  | 'REAL_EXEC_CHAIN_AUDIT_DIFF_HASH_MISMATCH'
  | 'REAL_EXEC_CHAIN_AUDIT_APPLY_TOKEN_MISMATCH'
  | 'REAL_EXEC_CHAIN_AUDIT_TRAIL_MISMATCH'
  // Feature 007 Phase 4: Cryptographic forgery simulation
  | 'REAL_EXEC_TOKEN_SIGNATURE_FORGED'
  | 'REAL_EXEC_TOKEN_UNVERIFIED'
  | 'REAL_EXEC_TOKEN_VERIFICATION_STATUS_MISSING'
  | 'REAL_EXEC_TOKEN_VERIFICATION_STATUS_MALFORMED'
  // Feature 007 Phase 4: Multi-claim injection
  | 'REAL_EXEC_INJECTED_PERMISSION_CLAIM'
  | 'REAL_EXEC_INJECTED_TENANT_OVERRIDE'
  | 'REAL_EXEC_INJECTED_APPROVAL_OVERRIDE'
  | 'REAL_EXEC_INJECTED_SERVICE_ACCOUNT_FLAG'
  | 'REAL_EXEC_INJECTED_PROVIDER_OVERRIDE'
  | 'REAL_EXEC_CONFLICTING_CLAIMS'
  // Feature 007 Phase 4: Concurrent modification
  | 'REAL_EXEC_CONCURRENT_MODIFICATION_BLOCKED'
  | 'REAL_EXEC_CURRENT_CONFIG_VERSION_MISMATCH'
  // Feature 008 Phase 1: Persisted approval validation
  | 'F008_APPROVAL_MISSING'
  | 'F008_APPROVAL_NOT_APPROVED'
  | 'F008_APPROVAL_EXPIRED'
  | 'F008_APPROVAL_TENANT_MISMATCH'
  | 'F008_APPROVAL_SOURCE_REC_MISMATCH'
  | 'F008_APPROVAL_CALLER_MISMATCH'
  | 'F008_APPROVAL_HASH_MISSING'
  | 'F008_APPROVAL_MALFORMED'
  // Feature 008 Phase 1: Verified caller context
  | 'F008_CALLER_VERIFICATION_SOURCE_UNTRUSTED'
  | 'F008_CALLER_TOKEN_NOT_VERIFIED_BY_SERVER'
  | 'F008_CALLER_UID_MISSING'
  | 'F008_CALLER_TENANT_CLAIM_MISMATCH'
  // Feature 008 Phase 1: Transaction write-set contract
  | 'F008_WRITE_SET_MISSING_SETTINGS_PATH'
  | 'F008_WRITE_SET_MISSING_HISTORY_PATH'
  | 'F008_WRITE_SET_MISSING_LOCK_PATH'
  | 'F008_WRITE_SET_MISSING_AUDIT_PATH'
  | 'F008_WRITE_SET_VERSION_CONFLICT'
  | 'F008_WRITE_SET_HASH_CONTINUITY_BROKEN'
  // Feature 008 Phase 2: Token boundary hardening
  | 'F008_CALLER_UPSTREAM_VERIFICATION_MISSING'
  | 'F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN'
  | 'F008_CALLER_ADMIN_SDK_FORGED_HUMAN'
  | 'F008_CALLER_TOKEN_SUBJECT_MISMATCH'
  | 'F008_CALLER_USERID_APPROVAL_MISMATCH'
  // Feature 008 Phase 2: Approval hardening
  | 'F008_APPROVAL_AUDIT_TRAIL_MISMATCH'
  | 'F008_APPROVAL_APPLY_TOKEN_MISMATCH'
  | 'F008_APPROVAL_VERSION_MISMATCH'
  | 'F008_APPROVAL_HASH_MISMATCH'
  // Feature 008 Phase 2: Write-set hash consistency
  | 'F008_WRITE_SET_CURRENT_CONFIG_HASH_MISSING'
  | 'F008_WRITE_SET_HISTORY_HASH_MISMATCH'
  | 'F008_WRITE_SET_AUDIT_HASH_MISMATCH'
  | 'F008_WRITE_SET_HASH_FIELDS_INCONSISTENT'
  // Feature 008 Phase 3: Upstream middleware verification hardening
  | 'F008_CALLER_CONTEXT_MALFORMED'
  | 'F008_CALLER_TENANT_MISSING'
  | 'F008_CALLER_VERIFIED_SUBJECT_MISSING'
  // Feature 008 Phase 3: Simulated settings snapshot validation
  | 'F008_SNAPSHOT_MISSING'
  | 'F008_SNAPSHOT_MALFORMED'
  | 'F008_SNAPSHOT_TENANT_MISMATCH'
  | 'F008_SNAPSHOT_VERSION_MISMATCH'
  | 'F008_SNAPSHOT_CONFIG_MISSING'
  | 'F008_SNAPSHOT_HASH_MISMATCH'
  | 'F008_SNAPSHOT_CONCURRENT_MODIFICATION'
  // Feature 008 Phase 4: Firebase token alignment
  | 'F008_TOKEN_UID_MISMATCH'
  | 'F008_TOKEN_TENANT_MISMATCH'
  | 'F008_TOKEN_PROVIDER_MISSING'
  | 'F008_TOKEN_VERIFICATION_MISSING'
  | 'F008_TOKEN_VERIFICATION_MALFORMED'
  | 'F008_TOKEN_SOURCE_UNTRUSTED'
  | 'F008_TOKEN_SERVICE_ACCOUNT_BLOCKED'
  | 'F008_MIDDLEWARE_USER_MISMATCH'
  | 'F008_MIDDLEWARE_TENANT_MISMATCH'
  | 'F008_MIDDLEWARE_PROVIDER_MISMATCH'
  // Feature 008 Phase 4: Simulated real Firestore snapshot source guard
  | 'F008_SNAPSHOT_SOURCE_MISMATCH'
  // Feature 009 Phase 1: Verified caller
  | 'F009_CALLER_NOT_HUMAN'
  | 'F009_CALLER_SERVICE_ACCOUNT_BLOCKED'
  | 'F009_CALLER_ADMIN_SDK_BLOCKED'
  | 'F009_CALLER_MISSING_USER_ID'
  | 'F009_CALLER_MISSING_TENANT_ID'
  | 'F009_CALLER_TENANT_MISMATCH'
  | 'F009_CALLER_VERIFICATION_UNTRUSTED'
  | 'F009_CALLER_VERIFICATION_NOT_VERIFIED'
  // Feature 009 Phase 1: Approval
  | 'F009_APPROVAL_MISSING'
  | 'F009_APPROVAL_NOT_APPROVED'
  | 'F009_APPROVAL_EXPIRED'
  | 'F009_APPROVAL_TENANT_MISMATCH'
  | 'F009_APPROVAL_APPROVED_BY_MISMATCH'
  | 'F009_APPROVAL_SOURCE_REC_MISMATCH'
  | 'F009_APPROVAL_AUDIT_TRAIL_MISMATCH'
  | 'F009_APPROVAL_MISSING_VERSION'
  | 'F009_APPROVAL_MISSING_HASH_FIELDS'
  | 'F009_APPROVAL_MISSING_APPLY_TOKEN'
  | 'F009_APPROVAL_ALREADY_CONSUMED'
  // Feature 009 Phase 1: Idempotency lock lifecycle
  | 'F009_LOCK_ALREADY_CONSUMED'
  | 'F009_LOCK_PAYLOAD_MISMATCH'
  | 'F009_LOCK_APPROVALID_TOKEN_CONFLICT'
  | 'F009_LOCK_STALE_VERSION'
  | 'F009_LOCK_PENDING_CONFLICT'
  // Feature 009 Phase 1: Abort contract
  | 'F009_ABORT_REQUIRED'
  | 'F009_ABORT_LOCK_TRANSITION_REQUIRED'
  // Feature 009 Phase 2: Firebase verification
  | 'F009_FIREBASE_TOKEN_MISSING'
  | 'F009_FIREBASE_TOKEN_UID_MISSING'
  | 'F009_FIREBASE_TOKEN_TENANT_MISSING'
  | 'F009_FIREBASE_TOKEN_PROVIDER_MISSING'
  | 'F009_FIREBASE_TOKEN_SOURCE_UNTRUSTED'
  | 'F009_FIREBASE_TOKEN_NOT_VERIFIED'
  | 'F009_FIREBASE_TOKEN_SERVICE_ACCOUNT'
  | 'F009_FIREBASE_TOKEN_ADMIN_SDK'
  | 'F009_FIREBASE_TOKEN_UID_CALLER_MISMATCH'
  | 'F009_FIREBASE_TOKEN_TENANT_REQUEST_MISMATCH'
  | 'F009_FIREBASE_TOKEN_UID_MIDDLEWARE_MISMATCH'
  | 'F009_FIREBASE_TOKEN_TENANT_MIDDLEWARE_MISMATCH'
  | 'F009_FIREBASE_TOKEN_PROVIDER_MIDDLEWARE_MISMATCH'
  // Feature 009 Phase 2: Read-set snapshots
  | 'F009_READSET_APPROVAL_MISSING'
  | 'F009_READSET_APPROVAL_TENANT_MISMATCH'
  | 'F009_READSET_APPROVAL_ID_MISMATCH'
  | 'F009_READSET_APPROVAL_APPROVED_BY_MISMATCH'
  | 'F009_READSET_APPROVAL_REC_MISMATCH'
  | 'F009_READSET_APPROVAL_AUDIT_TRAIL_MISMATCH'
  | 'F009_READSET_APPROVAL_NOT_APPROVED'
  | 'F009_READSET_APPROVAL_EXPIRED'
  | 'F009_READSET_SETTINGS_MISSING'
  | 'F009_READSET_SETTINGS_TENANT_MISMATCH'
  | 'F009_READSET_SETTINGS_VERSION_MISMATCH'
  | 'F009_READSET_SETTINGS_HASH_MISMATCH'
  | 'F009_READSET_SETTINGS_CONFIG_MISSING'
  | 'F009_READSET_LOCK_PAYLOAD_MISMATCH'
  | 'F009_READSET_LOCK_APPROVALID_TOKEN_CONFLICT'
  | 'F009_READSET_LOCK_CONSUMED'
  | 'F009_READSET_LOCK_PENDING_CONFLICT'
  // Feature 009 Phase 2: Abort hardening
  | 'F009_ABORT_DUPLICATE_REQUEST'
  | 'F009_ABORT_AFTER_PENDING_LOCK'
  | 'F009_ABORT_VERSION_CONFLICT'
  // Feature 009 Phase 3: Transaction read-set order
  | 'F009_READSET_ORDER_APPROVAL_REQUIRED'
  | 'F009_READSET_ORDER_SETTINGS_REQUIRED'
  | 'F009_READSET_ORDER_LOCK_REQUIRED'
  | 'F009_READSET_INVALID_PREVENTS_WRITE_SET'
  // Feature 009 Phase 3: Concurrent modification
  | 'F009_CONCURRENT_MODIFICATION_VERSION'
  | 'F009_CONCURRENT_MODIFICATION_HASH'
  // Feature 009 Phase 3: Duplicate apply
  | 'F009_DUPLICATE_APPLY_CONSUMED'
  | 'F009_DUPLICATE_APPLY_PENDING'
  // Feature 009 Phase 4: Live read sequence
  | 'F009_LIVE_READ_APPROVAL_REQUIRED'
  | 'F009_LIVE_READ_SETTINGS_REQUIRED'
  | 'F009_LIVE_READ_LOCK_REQUIRED'
  | 'F009_LIVE_READ_INVALID_PREVENTS_WRITE_SET'
  // Feature 009 Phase 4: Abort atomicity
  | 'F009_ABORT_NO_SETTINGS_MUTATION'
  | 'F009_ABORT_NO_HISTORY_WRITE'
  | 'F009_ABORT_DUPLICATE_IDEMPOTENT'
  | 'F009_ABORT_CONSUMED_LOCK_NOOP'
  | 'F009_ABORT_ABANDONED_REPLAY'
  // Feature 009 Phase 5A: Production Environment Guard
  | 'F009_PHASE5A_NOT_TEST_ENV'
  | 'F009_PHASE5A_MISSING_EMULATOR_HOST'
  | 'F009_PHASE5A_PRODUCTION_PROJECT_ID_BLOCKED'
  | 'F009_PHASE5A_UNKNOWN_PROJECT_ID'
  | 'F009_PHASE5A_MISSING_OPT_IN_FLAG'
  | 'F009_PHASE5A_OPT_IN_FLAG_INVALID'
  | 'F009_PHASE5A_UNKNOWN_ENVIRONMENT_DEFAULT_DENY'
  | 'F009_PHASE5A_GUARD_NOT_EXECUTED'
  // Feature 009 Phase 5A: Transaction executor
  | 'F009_PHASE5A_TRANSACTION_BLOCKED_BY_GUARD'
  | 'F009_PHASE5A_TRANSACTION_ABORTED'
  | 'F009_PHASE5A_TRANSACTION_FAILED';

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

// ─── Summary sub-types ────────────────────────────────────────────────────────

export interface ActiveMealPlanSummary {
  mealPlanIds: string[];
  dateRangeStart: Date;
  dateRangeEnd: Date;
  totalMeals: number;
  totalServings: number;
}

export interface InventoryIngredientSummary {
  ingredientId: string;
  name: string;
  currentStockGrams: Grams;
  safetyStockGrams?: Grams;
  category?: string;
  isVerified: boolean;
  source: 'manual' | 'imported' | 'system';
  warnings: BlockedReason[];
  blockedReasons: BlockedReason[];
}

export interface WasteRiskSummary {
  ingredientId: string;
  wasteFactor?: number;
  recentWasteGrams?: Grams;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
}

export interface SafeSettingsSummary {
  tenantId: TenantId;
  wasteFactorWarning?: number;
  aiPurchaseSuggestionEnabled?: boolean;
  /** Always true — AI suggestions always require human approval */
  requireHumanApproval: true;
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Aggregated operational data included in a summary-mode snapshot.
 * All quantity fields use Grams. Raw logs, raw OCR, and PII must never appear here.
 */
export interface AIContextSummary {
  tenantId: TenantId;
  generatedAt: Date;
  activeMealPlanSummary: ActiveMealPlanSummary;
  inventorySummaryByIngredient: Record<string, InventoryIngredientSummary>;
  /** Required grams per ingredient for planned meals (BOM × headCount × wasteFactor) */
  requiredQtyGramsByIngredient: Record<string, Grams>;
  /** Shortage (required + safetyStock − currentStock) per ingredient, minimum 0 */
  shortageQtyGramsByIngredient: Record<string, Grams>;
  /** Sum of RECEIVED purchase order quantities per ingredient (last 30 days) */
  recentPurchaseTotalsGramsByIngredient: Record<string, Grams>;
  /** Rolling average daily usage per ingredient (last 30 days / 30) */
  averageDailyUsageGramsByIngredient: Record<string, Grams>;
  wasteRiskSummaryByIngredient: Record<string, WasteRiskSummary>;
  settingsSummary: SafeSettingsSummary;
  /** Non-fatal observations — populated when data quality is degraded */
  warnings: BlockedReason[];
  /** Fatal issues — summary must not be used for AI suggestions when non-empty */
  blockedReasons: BlockedReason[];
}

/**
 * Metadata for an AIContextSnapshot document.
 * The snapshot is the sole authorised data source for AI suggestion generation.
 * Expired, contaminated, or debug snapshots must not be used to create suggestions.
 */
export interface AIContextSnapshot {
  snapshotId: SnapshotId;
  tenantId: TenantId;
  /** 'summary' is the production default; 'debug' is for development only and MUST NOT be used for suggestions */
  mode: 'summary' | 'debug';
  generatedAt: Date;
  /** Snapshot must be rejected if Date.now() > expiresAt (default: generatedAt + 4 hours) */
  expiresAt: Date;
  /** Collections read to build this snapshot */
  sourceCollections: string[];
  /** Document counts per collection — used for SNAPSHOT_TOO_LARGE checks */
  recordCounts: Record<string, number>;
  /** true when any excluded/blocked records were detected during build */
  contaminationDetected: boolean;
  contaminationReasons: BlockedReason[];
  summary?: AIContextSummary;
  createdBy: CallerType;
  /** Unique cache key: tenantId + mode + dateRange — used for deduplication */
  cacheKey: string;
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

// ─── Override / Feedback (Phase 4) ───────────────────────────────────────────

/**
 * Reason a human provides when overriding an AI purchase suggestion.
 * Exhaustive union — no freeform strings.
 */
export type OverrideReason =
  | 'too_high'
  | 'too_low'
  | 'supplier_limit'
  | 'chef_override'
  | 'unit_conversion_issue'
  | 'ingredient_unavailable'
  | 'seasonal_adjustment'
  | 'other';

/**
 * Feedback record created when a human overrides an AI suggestion quantity.
 * Never triggers downstream purchase flow — Phase 4 audit only.
 */
export interface AISuggestionFeedback {
  feedbackId: string;
  tenantId: TenantId;
  suggestionId: SuggestionId;
  sourceSnapshotId: SnapshotId;
  auditTrailId: AuditTrailId;
  ingredientId: string;
  originalRecommendedQtyGrams: Grams;
  finalQtyGrams: Grams;
  overrideReason: OverrideReason;
  note?: string;
  actorType: 'human';
  actorId: string;
  createdAt: Date;
}

/**
 * Immutable record of the human's final quantity decision.
 * Linked to a suggestion via suggestionId + auditTrailId.
 */
export interface HumanOverride {
  overrideId: string;
  tenantId: TenantId;
  suggestionId: SuggestionId;
  auditTrailId: AuditTrailId;
  ingredientId: string;
  originalQtyGrams: Grams;
  finalQtyGrams: Grams;
  reason: OverrideReason;
  note?: string;
  createdBy: string;
  createdAt: Date;
}

// ─── AI Purchase Suggestion (Phase 3) ────────────────────────────────────────

/**
 * A single ingredient line within an AI purchase suggestion.
 * All quantities in Grams. usableForDraft is always false in Phase 3.
 */
export interface PurchaseSuggestionItem {
  ingredientId: string;
  name: string;
  /** Quantity the system suggests purchasing */
  suggestedQtyGrams: Grams;
  currentStockGrams: Grams;
  shortageGrams: Grams;
  /** Average daily usage (30-day window) */
  averageDailyUsageGrams?: Grams;
  confidence: SuggestionConfidenceV2;
}

/**
 * An AI-generated purchase suggestion derived from an AIContextSnapshot.
 *
 * Phase 3 invariant: usableForDraft is ALWAYS false.
 * Phase 4 will add the human-approval path that sets usableForDraft conditionally.
 *
 * This object must never be written to purchaseOrders or inventory directly.
 */
export interface AIPurchaseSuggestion {
  suggestionId: SuggestionId;
  tenantId: TenantId;
  /** The snapshot that was used to generate this suggestion */
  sourceSnapshotId: SnapshotId;
  generatedAt: Date;
  /** Suggestion is stale and must not be actioned after this time */
  expiresAt: Date;
  items: PurchaseSuggestionItem[];
  overallConfidence: SuggestionConfidenceV2;
  /**
   * Phase 3: always false.
   * Phase 4 will allow true only after human approval via approveDraftOrder().
   */
  usableForDraft: false;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  /** Audit event produced at generation time */
  auditEvent: AuditEvent;
  /** Optional: links this suggestion to an audit trail chain (set externally) */
  auditTrailId?: AuditTrailId;
}

// ─── Draft Purchase Suggestion (Phase 5) ──────────────────────────────────────

/**
 * Alias for SuggestionConfidenceV2 — used in DraftPurchaseSuggestion to
 * explicitly signal that confidence is the per-item graded value.
 */
export type AISuggestionConfidence = SuggestionConfidenceV2;

export type DraftPurchaseSuggestionStatus =
  | 'DRAFT_PREPARED'
  | 'BLOCKED'
  | 'REJECTED'
  | 'AWAITING_HUMAN_APPROVAL';

/**
 * A draft purchase suggestion object — NOT a purchase order.
 *
 * Phase 5 invariant: this object is never written to purchaseOrders.
 * requiresHumanApproval is always true.
 * approvedBy / approvedAt are Phase 6 fields and must not appear here.
 *
 * createdBy is always 'human' — AI cannot create a draft directly.
 */
export interface DraftPurchaseSuggestion {
  draftSuggestionId: string;
  tenantId: TenantId;
  sourceSnapshotId: SnapshotId;
  suggestionId: SuggestionId;
  auditTrailId: AuditTrailId;
  feedbackId?: string;
  overrideId?: string;
  ingredientId: string;
  ingredientName?: string;
  suggestedQtyGrams: Grams;
  finalQtyGrams: Grams;
  confidence: AISuggestionConfidence;
  status: DraftPurchaseSuggestionStatus;
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  requiresHumanApproval: true;
  /** Phase 6 only — must be undefined in Phase 5 */
  approvedBy?: never;
  /** Phase 6 only — must be undefined in Phase 5 */
  approvedAt?: never;
  dataLineage: {
    snapshotId: SnapshotId;
    suggestionId: SuggestionId;
    feedbackId?: string;
    overrideId?: string;
    sourceCollections: string[];
    generatedAt: Date;
  };
  createdBy: 'human';
  createdByUserId: string;
  createdAt: Date;
}

// ─── Human Approval / Purchase Order DRAFT (Phase 6) ─────────────────────────

/**
 * Records a human's explicit approval to convert a DraftPurchaseSuggestion
 * into a purchaseOrders DRAFT document.
 *
 * Invariants:
 *  - aiCanApprove is always false
 *  - requiresFinalSubmission is always true
 *  - createsPurchaseOrderStatus is always 'DRAFT'
 */
export interface HumanApprovalForPurchaseDraft {
  approvalId: string;
  tenantId: TenantId;
  draftSuggestionId: string;
  suggestionId: SuggestionId;
  sourceSnapshotId: SnapshotId;
  auditTrailId: AuditTrailId;
  feedbackId?: string;
  overrideId?: string;
  approvedByHumanUserId: string;
  approvedAt: Date;
  approvalNote?: string;
  approvedQtyGrams: Grams;
  /** Always 'DRAFT' — never PENDING or RECEIVED */
  createsPurchaseOrderStatus: 'DRAFT';
  /** Phase 6 invariant: AI can never approve */
  aiCanApprove: false;
  /** After DRAFT is created, a human must still submit before it becomes PENDING */
  requiresFinalSubmission: true;
}

/**
 * AI-origin metadata stamped on a purchaseOrders DRAFT document.
 * The full audit chain from snapshot → suggestion → override → approval.
 */
export interface AIPurchaseOrderDraftMetadata {
  source: 'ai_suggestion_human_approved';
  tenantId: TenantId;
  sourceSnapshotId: SnapshotId;
  suggestionId: SuggestionId;
  draftSuggestionId: string;
  auditTrailId: AuditTrailId;
  feedbackId?: string;
  overrideId?: string;
  approvalId: string;
  approvedByHumanUserId: string;
  approvedAt: Date;
  /** Always true — tracks AI origin for human review */
  requiresFinalSubmission: true;
  /** Always true — documents that this order originated from AI suggestion */
  aiGenerated: true;
  /** Always false — AI cannot submit to PENDING */
  aiCanSubmit: false;
}

// ─── Human Submit / Purchase Order PENDING (Phase 7) ─────────────────────────

/**
 * Records a human's explicit submission of an AI-sourced DRAFT to PENDING.
 *
 * Invariants:
 *  - fromStatus is always 'DRAFT'
 *  - toStatus is always 'PENDING'
 *  - aiCanSubmit is always false
 *  - aiCanReceive is always false
 *  - requiresReceivingConfirmation is always true
 */
export interface HumanSubmitPurchaseOrderPending {
  submitId: string;
  tenantId: TenantId;
  purchaseOrderId: string;
  draftSuggestionId: string;
  suggestionId: SuggestionId;
  sourceSnapshotId: SnapshotId;
  auditTrailId: AuditTrailId;
  approvalId: string;
  feedbackId?: string;
  overrideId?: string;
  submittedByHumanUserId: string;
  submittedAt: Date;
  submitNote?: string;
  fromStatus: 'DRAFT';
  toStatus: 'PENDING';
  aiCanSubmit: false;
  aiCanReceive: false;
  requiresReceivingConfirmation: true;
}

/**
 * AI-origin metadata stamped when a DRAFT purchase order is submitted to PENDING.
 * Extends the audit chain from approval → submission.
 */
export interface AIPurchaseOrderPendingMetadata {
  source: 'ai_suggestion_human_submitted';
  tenantId: TenantId;
  sourceSnapshotId: SnapshotId;
  suggestionId: SuggestionId;
  draftSuggestionId: string;
  auditTrailId: AuditTrailId;
  approvalId: string;
  submitId: string;
  submittedByHumanUserId: string;
  submittedAt: Date;
  requiresReceivingConfirmation: true;
  aiGenerated: true;
  aiCanSubmit: false;
  aiCanReceive: false;
}
