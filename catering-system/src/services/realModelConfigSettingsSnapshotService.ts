/**
 * realModelConfigSettingsSnapshotService.ts
 *
 * Feature 008 Phase 3 + Phase 4: Simulated Settings Snapshot Validator
 *
 * Validates a simulated (plain-object) Firestore settings snapshot before a
 * real apply transaction may proceed.  Phase 3 does NOT read from Firestore;
 * callers supply the snapshot as a plain input object.  Phase 4+ will
 * populate this from a real `runTransaction` Firestore read.
 *
 * Checks:
 *  1. snapshot must be present
 *  2. tenantId must match request (first — default-deny)
 *  3. currentVersion must match expectedCurrentVersion
 *  4. currentConfig must be present
 *  5. canonical hash of currentConfig is computed
 *  6. currentConfigHash must equal approval.configBeforeHash
 *  7. currentConfigHash must equal writeSet.settingsHistoryWrite.configBeforeHash
 *     when a write-set is provided
 *
 * Concurrent modification is detected when:
 *  - currentVersion !== expectedCurrentVersion (either direction)
 *  - currentConfigHash !== approval.configBeforeHash
 *
 * HARD RULES:
 *  - No Firestore reads, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type { ConfigVersion, DiffHash } from '../types/modelConfigApply';
import type { TransactionWriteSetContract } from '../types/realApplyTransactionExecution';
import { validateCanonicalModelConfigHashInput } from './realModelConfigCanonicalizationService';

// ─── Input types ─────────────────────────────────────────────────────────────

/**
 * A simulated (plain-object) snapshot of a Firestore settings document.
 * Phase 3: passed as a plain input — not read from Firestore.
 * Phase 4+ will read this from Firestore inside runTransaction.
 */
export interface SimulatedSettingsSnapshot {
  readonly _kind: 'simulated_settings_snapshot';
  tenantId: TenantId;
  currentVersion: ConfigVersion;
  currentConfig: unknown;
}

export interface SnapshotValidationInput {
  snapshot: SimulatedSettingsSnapshot | null | undefined;
  requestTenantId: TenantId;
  expectedCurrentVersion: ConfigVersion;
  /** approval.configBeforeHash — the canonical hash of the config at approval time */
  approvalConfigBeforeHash: DiffHash;
  /**
   * Optional write-set contract — when supplied, verifies that its
   * configBeforeHash fields are consistent with the snapshot hash.
   */
  writeSet?: TransactionWriteSetContract | null;
}

export interface SnapshotValidationResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
  /** Computed canonical hash of snapshot.currentConfig when canonicalization succeeded */
  currentConfigHash?: DiffHash;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function str(v: unknown): string { return v as string; }

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Validates a simulated settings snapshot before a real apply transaction.
 * Default-deny: any missing or mismatched field → blocked.
 */
export function validateSimulatedSettingsSnapshotForApply(
  input: SnapshotValidationInput,
): SnapshotValidationResult {
  const blocked: BlockedReason[] = [];

  // snapshot must be present
  if (!input.snapshot) {
    blocked.push('F008_SNAPSHOT_MISSING');
    return { valid: false, blockedReasons: blocked };
  }

  const snap = input.snapshot;

  // structural kind check
  if ((snap as { _kind?: string })._kind !== 'simulated_settings_snapshot') {
    blocked.push('F008_SNAPSHOT_MALFORMED');
    return { valid: false, blockedReasons: blocked };
  }

  // tenantId must match first (default-deny, hard guard)
  if (str(snap.tenantId) !== str(input.requestTenantId)) {
    blocked.push('F008_SNAPSHOT_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked };
  }

  // currentVersion must match expectedCurrentVersion (both directions)
  if (str(snap.currentVersion) !== str(input.expectedCurrentVersion)) {
    blocked.push('F008_SNAPSHOT_VERSION_MISMATCH');
    blocked.push('F008_SNAPSHOT_CONCURRENT_MODIFICATION');
  }

  // currentConfig must be present
  if (snap.currentConfig === undefined || snap.currentConfig === null) {
    blocked.push('F008_SNAPSHOT_CONFIG_MISSING');
    return { valid: false, blockedReasons: blocked };
  }

  // Canonicalize currentConfig → currentConfigHash
  const canon = validateCanonicalModelConfigHashInput(snap.currentConfig);
  if (!canon.valid || !canon.canonicalized) {
    blocked.push('F008_SNAPSHOT_CONFIG_MISSING');
    blocked.push(...(canon.blockedReasons as BlockedReason[]));
    return { valid: false, blockedReasons: blocked };
  }

  const currentConfigHash = canon.canonicalized.inputHash as DiffHash;

  // currentConfigHash must equal approval.configBeforeHash
  if (str(currentConfigHash) !== str(input.approvalConfigBeforeHash)) {
    blocked.push('F008_SNAPSHOT_HASH_MISMATCH');
    blocked.push('F008_SNAPSHOT_CONCURRENT_MODIFICATION');
  }

  // If write-set provided: verify write-set.configBeforeHash fields are consistent
  if (input.writeSet) {
    const ws = input.writeSet;
    if (str(ws.settingsHistoryWrite.configBeforeHash) !== str(currentConfigHash)) {
      blocked.push('F008_WRITE_SET_HISTORY_HASH_MISMATCH');
      blocked.push('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT');
    }
    if (str(ws.auditEventWrite.configBeforeHash) !== str(currentConfigHash)) {
      blocked.push('F008_WRITE_SET_AUDIT_HASH_MISMATCH');
      blocked.push('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT');
    }
  }

  const uniqueBlocked = [...new Set(blocked)] as BlockedReason[];
  return {
    valid: uniqueBlocked.length === 0,
    blockedReasons: uniqueBlocked,
    currentConfigHash: uniqueBlocked.length === 0 ? currentConfigHash : undefined,
  };
}

// ─── Phase 4: Simulated Real Firestore Settings Snapshot ─────────────────────

/**
 * Phase 4: a snapshot that explicitly declares its source as
 * 'SIMULATED_FIRESTORE_SNAPSHOT'. Phase 5+ will use real Firestore reads.
 */
export interface SimulatedRealFirestoreSettingsSnapshot {
  readonly _kind: 'simulated_real_firestore_settings_snapshot';
  /** Must be 'SIMULATED_FIRESTORE_SNAPSHOT' — validated as part of the source guard */
  source: 'SIMULATED_FIRESTORE_SNAPSHOT';
  tenantId: TenantId;
  currentVersion: ConfigVersion;
  currentConfig: unknown;
}

export interface RealSnapshotValidationInput {
  snapshot: SimulatedRealFirestoreSettingsSnapshot | null | undefined;
  requestTenantId: TenantId;
  expectedCurrentVersion: ConfigVersion;
  approvalConfigBeforeHash: DiffHash;
  /** When supplied, write-set configBeforeHash fields must match snapshot hash */
  writeSet?: TransactionWriteSetContract | null;
}

/**
 * Phase 4: validates a simulated real Firestore settings snapshot.
 *
 * Extends Phase 3 validator with:
 *  - source guard: snapshot.source must equal 'SIMULATED_FIRESTORE_SNAPSHOT'
 *  - full audit event hash consistency when write-set is supplied
 */
export function validateSimulatedRealFirestoreSettingsSnapshotForApply(
  input: RealSnapshotValidationInput,
): SnapshotValidationResult {
  const blocked: BlockedReason[] = [];

  if (!input.snapshot) {
    blocked.push('F008_SNAPSHOT_MISSING');
    return { valid: false, blockedReasons: blocked };
  }

  const snap = input.snapshot;

  // structural kind check
  if ((snap as { _kind?: string })._kind !== 'simulated_real_firestore_settings_snapshot') {
    blocked.push('F008_SNAPSHOT_MALFORMED');
    return { valid: false, blockedReasons: blocked };
  }

  // source guard — must declare provenance
  if (snap.source !== 'SIMULATED_FIRESTORE_SNAPSHOT') {
    blocked.push('F008_SNAPSHOT_SOURCE_MISMATCH');
    return { valid: false, blockedReasons: blocked };
  }

  // tenantId hard guard — execute first
  if (str(snap.tenantId) !== str(input.requestTenantId)) {
    blocked.push('F008_SNAPSHOT_TENANT_MISMATCH');
    return { valid: false, blockedReasons: blocked };
  }

  // currentVersion must match expectedCurrentVersion
  if (str(snap.currentVersion) !== str(input.expectedCurrentVersion)) {
    blocked.push('F008_SNAPSHOT_VERSION_MISMATCH');
    blocked.push('F008_SNAPSHOT_CONCURRENT_MODIFICATION');
  }

  // currentConfig must be present
  if (snap.currentConfig === undefined || snap.currentConfig === null) {
    blocked.push('F008_SNAPSHOT_CONFIG_MISSING');
    return { valid: false, blockedReasons: blocked };
  }

  // Canonicalize → currentConfigHash
  const canon = validateCanonicalModelConfigHashInput(snap.currentConfig);
  if (!canon.valid || !canon.canonicalized) {
    blocked.push('F008_SNAPSHOT_CONFIG_MISSING');
    blocked.push(...(canon.blockedReasons as BlockedReason[]));
    return { valid: false, blockedReasons: blocked };
  }

  const currentConfigHash = canon.canonicalized.inputHash as DiffHash;

  // hash must match approval.configBeforeHash
  if (str(currentConfigHash) !== str(input.approvalConfigBeforeHash)) {
    blocked.push('F008_SNAPSHOT_HASH_MISMATCH');
    blocked.push('F008_SNAPSHOT_CONCURRENT_MODIFICATION');
  }

  // write-set consistency (settingsHistory + audit event)
  if (input.writeSet) {
    const ws = input.writeSet;
    if (str(ws.settingsHistoryWrite.configBeforeHash) !== str(currentConfigHash)) {
      blocked.push('F008_WRITE_SET_HISTORY_HASH_MISMATCH');
      blocked.push('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT');
    }
    if (str(ws.auditEventWrite.configBeforeHash) !== str(currentConfigHash)) {
      blocked.push('F008_WRITE_SET_AUDIT_HASH_MISMATCH');
      blocked.push('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT');
    }
  }

  const uniqueBlocked = [...new Set(blocked)] as BlockedReason[];
  return {
    valid: uniqueBlocked.length === 0,
    blockedReasons: uniqueBlocked,
    currentConfigHash: uniqueBlocked.length === 0 ? currentConfigHash : undefined,
  };
}
