/**
 * modelConfigHistoricalValidationService.ts
 *
 * Feature 006 Phase 2 + Phase 3: Historical Config Hash Cross-validation
 * and settingsHistory Snapshot Mapping
 *
 * Validates that the historical settingsHistory snapshot for a rollback target
 * version has the expected config hash, is immutable, and has not been
 * deleted or overwritten.
 *
 * Phase 2: pure logic — accepts caller-supplied settingsHistory snapshot.
 * Phase 3 (future): the caller will read this snapshot from inside
 *   runTransaction before passing it here.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI, no async, no side effects
 *  - Tenant hard guard executes first
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { TenantId } from '../types/aiBoundary';
import type { ConfigVersion, DiffHash } from '../types/modelConfigApply';

// ─── Settings History Snapshot ────────────────────────────────────────────────

/**
 * Represents a single version record in the settingsHistory collection.
 * Phase 2: passed by the caller (future Phase 3 caller reads from Firestore).
 *
 * Invariants:
 *   - immutable must be true
 *   - deleted must be undefined or false
 *   - overwritten must be undefined or false
 */
export interface SettingsHistorySnapshot {
  readonly _kind: 'settings_history_snapshot';
  tenantId: TenantId;
  version: ConfigVersion;
  configHash: DiffHash;
  /** Optional extended metadata — required for Phase 3 full mapping validation */
  configBeforeHash?: DiffHash;
  configAfterHash?: DiffHash;
  diffHash?: DiffHash;
  sourceAuditTrailId?: string;
  approvalId?: string;
  readonly immutable: true;
  deleted?: false;
  overwritten?: false;
  createdAt: Date;
  createdByHumanUserId: string;
}

// ─── Historical Validation Input ──────────────────────────────────────────────

export interface ValidateRollbackHistoricalConfigHashInput {
  tenantId: TenantId;
  rollbackTargetVersion: ConfigVersion;
  expectedHistoricalConfigHash: DiffHash;
  historicalSnapshot: SettingsHistorySnapshot | null;
}

// ─── Historical Validation Result ────────────────────────────────────────────

export interface HistoricalConfigHashValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Validates the historical settingsHistory snapshot for a rollback target.
 *
 * Must be called with a snapshot supplied by the transaction caller.
 * This helper does not read Firestore — it validates the supplied snapshot.
 *
 * Validation order (tenant hard guard first):
 *  1. Tenant hard guard
 *  2. rollbackTargetVersion present
 *  3. Historical snapshot present
 *  4. snapshot.tenantId === request.tenantId
 *  5. snapshot.version === rollbackTargetVersion
 *  6. snapshot.configHash === expectedHistoricalConfigHash
 *  7. snapshot.immutable === true
 *  8. snapshot.deleted !== true
 *  9. snapshot.overwritten !== true
 */
export function validateRollbackHistoricalConfigHash(
  input: ValidateRollbackHistoricalConfigHashInput,
): HistoricalConfigHashValidationResult {
  const blocked: BlockedReason[] = [];

  // 1. Tenant hard guard — must be first
  if (!input.tenantId) {
    blocked.push('REAL_ROLLBACK_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked };
  }

  // 2. rollbackTargetVersion present
  if (!input.rollbackTargetVersion) {
    blocked.push('REAL_ROLLBACK_MISSING_ROLLBACK_TOKEN');
    return { valid: false, blockedReasons: blocked };
  }

  // 3. Historical snapshot present
  if (!input.historicalSnapshot) {
    blocked.push('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND');
    return { valid: false, blockedReasons: blocked };
  }

  const snap = input.historicalSnapshot;

  // 4. snapshot.tenantId must match
  if ((snap.tenantId as string) !== (input.tenantId as string)) {
    blocked.push('REAL_ROLLBACK_TENANT_MISMATCH');
  }

  // 5. snapshot.version must match rollbackTargetVersion
  if ((snap.version as string) !== (input.rollbackTargetVersion as string)) {
    blocked.push('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND');
  }

  // 6. configHash must match expected
  if ((snap.configHash as string) !== (input.expectedHistoricalConfigHash as string)) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 7. snapshot must be immutable
  if (snap.immutable !== true) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 8. snapshot must not be deleted
  if ((snap as { deleted?: unknown }).deleted === true) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 9. snapshot must not be overwritten
  if ((snap as { overwritten?: unknown }).overwritten === true) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}

// ─── Rollback Target Version Validation ──────────────────────────────────────

export interface ValidateRollbackTargetVersionInput {
  rollbackTargetVersion: ConfigVersion | null | undefined;
  expectedCurrentVersion: ConfigVersion;
  newVersion: ConfigVersion;
  expectedHistoricalConfigHash: DiffHash | null | undefined;
}

export interface RollbackTargetVersionValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Validates the version chain semantics for a rollback operation.
 *
 * Rules:
 *  - rollbackTargetVersion must be present
 *  - rollbackTargetVersion must not equal expectedCurrentVersion (same-version guard)
 *  - rollbackTargetVersion must be strictly less than expectedCurrentVersion
 *    (we are rolling back to an older version)
 *  - newVersion must be strictly greater than expectedCurrentVersion
 *    (the new version record will be created at a higher version number)
 *  - expectedHistoricalConfigHash must be present
 *
 * Note: version ordering is string-based for branded ConfigVersion.
 * Phase 3 should use a proper semver or monotonic counter comparison.
 * Phase 2 validates the structural chain only.
 */
export function validateRollbackTargetVersion(
  input: ValidateRollbackTargetVersionInput,
): RollbackTargetVersionValidationResult {
  const blocked: BlockedReason[] = [];

  // rollbackTargetVersion must be present
  if (!input.rollbackTargetVersion) {
    blocked.push('REAL_ROLLBACK_MISSING_ROLLBACK_TOKEN');
    return { valid: false, blockedReasons: blocked };
  }

  // same-version guard
  if ((input.rollbackTargetVersion as string) === (input.expectedCurrentVersion as string)) {
    blocked.push('REAL_ROLLBACK_SAME_VERSION');
  }

  // rollbackTargetVersion must be < expectedCurrentVersion (older)
  if ((input.rollbackTargetVersion as string) > (input.expectedCurrentVersion as string)) {
    blocked.push('ROLLBACK_TARGET_VERSION_INVALID');
  }

  // newVersion must be > expectedCurrentVersion (new record)
  if ((input.newVersion as string) <= (input.expectedCurrentVersion as string)) {
    blocked.push('ROLLBACK_TARGET_VERSION_INVALID');
  }

  // historicalConfigHash must be present
  if (!input.expectedHistoricalConfigHash) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}

// ─── Phase 3: settingsHistory Snapshot Mapping ────────────────────────────────

export interface SnapshotMappingInput {
  tenantId: TenantId;
  rollbackTargetVersion: ConfigVersion;
  expectedHistoricalConfigHash: DiffHash;
  requireExtendedMetadata?: boolean;
  historicalSnapshot: SettingsHistorySnapshot | null;
}

export interface SnapshotMappingResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  mappedConfigHash: DiffHash | null;
}

/**
 * Maps a caller-supplied settingsHistory snapshot to the historicalConfigHash
 * needed for a rollback contract. This is the Phase 3 authoritative mapping
 * entry point that Phase 4 real transaction will call after reading Firestore.
 *
 * Phase 3: pure logic — no Firestore read.
 * Phase 4 (future): caller reads the Firestore settingsHistory document and
 *   passes it as `historicalSnapshot`.
 *
 * Validation order (tenant hard guard first):
 *  1. Tenant hard guard
 *  2. rollbackTargetVersion present
 *  3. Historical snapshot present
 *  4. snapshot.tenantId === request.tenantId
 *  5. snapshot.version === rollbackTargetVersion
 *  6. snapshot.configHash present
 *  7. snapshot.configHash === expectedHistoricalConfigHash
 *  8. snapshot.immutable === true
 *  9. snapshot.deleted !== true
 * 10. snapshot.overwritten !== true
 * 11. Extended metadata present (if requireExtendedMetadata)
 */
export function mapSettingsHistorySnapshotToHistoricalHash(
  input: SnapshotMappingInput,
): SnapshotMappingResult {
  const blocked: BlockedReason[] = [];

  // 1. Tenant hard guard — must be first
  if (!input.tenantId) {
    blocked.push('REAL_ROLLBACK_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked, mappedConfigHash: null };
  }

  // 2. rollbackTargetVersion present
  if (!input.rollbackTargetVersion) {
    blocked.push('REAL_ROLLBACK_MISSING_ROLLBACK_TOKEN');
    return { valid: false, blockedReasons: blocked, mappedConfigHash: null };
  }

  // 3. Historical snapshot present
  if (!input.historicalSnapshot) {
    blocked.push('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND');
    return { valid: false, blockedReasons: blocked, mappedConfigHash: null };
  }

  const snap = input.historicalSnapshot;

  // 4. snapshot.tenantId must match
  if ((snap.tenantId as string) !== (input.tenantId as string)) {
    blocked.push('REAL_ROLLBACK_TENANT_MISMATCH');
  }

  // 5. snapshot.version must match rollbackTargetVersion
  if ((snap.version as string) !== (input.rollbackTargetVersion as string)) {
    blocked.push('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND');
  }

  // 6. snapshot.configHash must be present
  if (!snap.configHash) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 7. configHash must match expected
  if (snap.configHash && (snap.configHash as string) !== (input.expectedHistoricalConfigHash as string)) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 8. snapshot must be immutable
  if (snap.immutable !== true) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 9. snapshot must not be deleted
  if ((snap as { deleted?: unknown }).deleted === true) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 10. snapshot must not be overwritten
  if ((snap as { overwritten?: unknown }).overwritten === true) {
    blocked.push('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH');
  }

  // 11. Extended metadata required
  if (input.requireExtendedMetadata) {
    if (!snap.sourceAuditTrailId) {
      blocked.push('REAL_ROLLBACK_MISSING_AUDIT_TRAIL');
    }
    if (!snap.approvalId) {
      blocked.push('REAL_ROLLBACK_APPROVAL_NOT_APPROVED');
    }
  }

  if (blocked.length > 0) {
    return { valid: false, blockedReasons: blocked, mappedConfigHash: null };
  }

  return { valid: true, blockedReasons: [], mappedConfigHash: snap.configHash };
}
