/**
 * realApplyWriteSetHashConsistencyService.ts
 *
 * Feature 008 Phase 2: Write-Set Hash Consistency Validator
 *
 * Verifies that all hash fields propagate consistently from:
 *   approval snapshot → settingsHistoryWrite → auditEventWrite
 *
 * Also validates canonical currentConfig hash equals approval.configBeforeHash.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { DiffHash } from '../types/modelConfigApply';
import type {
  TransactionWriteSetContract,
  ExecutorValidationResult,
} from '../types/realApplyTransactionExecution';
import { validateCanonicalModelConfigHashInput } from './realModelConfigCanonicalizationService';

export interface WriteSetHashConsistencyInput {
  /** The write-set contract to validate */
  writeSet: TransactionWriteSetContract;
  /** The approval's hash fields — all write-set hashes must match these */
  approvalConfigBeforeHash: DiffHash;
  approvalConfigAfterHash: DiffHash;
  approvalDiffHash: DiffHash;
  /**
   * Phase 2: optional current config object from Firestore read.
   * When supplied, its canonical hash must equal approvalConfigBeforeHash.
   */
  currentConfigObject?: unknown;
}

function str(v: unknown): string { return v as string; }

/**
 * Validates hash consistency across the write-set contract.
 *
 * Checks:
 *  1. settingsHistoryWrite hash fields match approval hash fields
 *  2. auditEventWrite hash fields match approval hash fields
 *  3. settingsWrite.configAfterHash matches approval.configAfterHash
 *  4. If currentConfigObject supplied, its canonical hash must match approvalConfigBeforeHash
 */
export function validateWriteSetHashConsistency(
  input: WriteSetHashConsistencyInput,
): ExecutorValidationResult {
  const blocked: BlockedReason[] = [];
  const ws = input.writeSet;

  // settingsHistoryWrite hash fields must match approval
  if (
    str(ws.settingsHistoryWrite.configBeforeHash) !== str(input.approvalConfigBeforeHash) ||
    str(ws.settingsHistoryWrite.configAfterHash) !== str(input.approvalConfigAfterHash) ||
    str(ws.settingsHistoryWrite.diffHash) !== str(input.approvalDiffHash)
  ) {
    blocked.push('F008_WRITE_SET_HISTORY_HASH_MISMATCH');
    blocked.push('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT');
  }

  // auditEventWrite hash fields must match approval
  if (
    str(ws.auditEventWrite.configBeforeHash) !== str(input.approvalConfigBeforeHash) ||
    str(ws.auditEventWrite.configAfterHash) !== str(input.approvalConfigAfterHash) ||
    str(ws.auditEventWrite.diffHash) !== str(input.approvalDiffHash)
  ) {
    blocked.push('F008_WRITE_SET_AUDIT_HASH_MISMATCH');
    blocked.push('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT');
  }

  // settingsWrite.configAfterHash must match approval
  if (str(ws.settingsWrite.configAfterHash) !== str(input.approvalConfigAfterHash)) {
    blocked.push('F008_WRITE_SET_HASH_FIELDS_INCONSISTENT');
  }

  // Optional: canonical hash of currentConfigObject must equal approvalConfigBeforeHash
  if (input.currentConfigObject !== undefined) {
    const canon = validateCanonicalModelConfigHashInput(input.currentConfigObject);
    if (!canon.valid || !canon.canonicalized) {
      blocked.push('F008_WRITE_SET_CURRENT_CONFIG_HASH_MISSING');
      blocked.push(...(canon.blockedReasons as BlockedReason[]));
    } else if (str(canon.canonicalized.inputHash) !== str(input.approvalConfigBeforeHash)) {
      blocked.push('F008_WRITE_SET_CURRENT_CONFIG_HASH_MISSING');
      blocked.push('F008_WRITE_SET_HASH_CONTINUITY_BROKEN');
    }
  }

  // Deduplicate blocked reasons
  const unique = [...new Set(blocked)] as BlockedReason[];
  return { valid: unique.length === 0, blockedReasons: unique };
}
