/**
 * realModelConfigApplyConcurrentModificationService.ts
 *
 * Feature 009 Phase 3: Concurrent Modification + Duplicate Apply Simulation
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { ConfigVersion, DiffHash } from '../types/modelConfigApply';
import type { F009ValidationResult } from '../types/realModelConfigApplyTransaction';
import type { LockCheckResult } from './realModelConfigApplyReadSetSnapshotService';

// ─── Duplicate apply types ────────────────────────────────────────────────────

export type DuplicateApplyOutcome = 'ALLOW_NEW' | 'IDEMPOTENT_REPLAY' | 'BLOCKED';

export interface DuplicateApplyResult {
  outcome: DuplicateApplyOutcome;
  blockedReasons: BlockedReason[];
}

// ─── Version conflict detection ───────────────────────────────────────────────

/**
 * Checks whether settings currentVersion matches expectedCurrentVersion.
 * Returns blocked with F009_CONCURRENT_MODIFICATION_VERSION if mismatch.
 */
export function detectVersionConflict(
  actualVersion: ConfigVersion,
  expectedVersion: ConfigVersion,
): F009ValidationResult {
  if (actualVersion !== expectedVersion) {
    return {
      valid: false,
      blockedReasons: ['F009_CONCURRENT_MODIFICATION_VERSION'],
    };
  }
  return { valid: true, blockedReasons: [] };
}

// ─── Hash mismatch detection ──────────────────────────────────────────────────

/**
 * Checks whether settings currentConfigHash matches approval.configBeforeHash.
 * Returns blocked with F009_CONCURRENT_MODIFICATION_HASH if mismatch.
 */
export function detectHashMismatch(
  actualHash: DiffHash,
  approvalBeforeHash: DiffHash,
): F009ValidationResult {
  if (actualHash !== approvalBeforeHash) {
    return {
      valid: false,
      blockedReasons: ['F009_CONCURRENT_MODIFICATION_HASH'],
    };
  }
  return { valid: true, blockedReasons: [] };
}

// ─── Combined detection ───────────────────────────────────────────────────────

/**
 * Checks both version and hash for concurrent modification.
 * Returns all blocked reasons found.
 */
export function detectConcurrentModification(input: {
  actualVersion: ConfigVersion;
  expectedVersion: ConfigVersion;
  actualConfigHash: DiffHash;
  approvalConfigBeforeHash: DiffHash;
}): F009ValidationResult {
  const blockedReasons: BlockedReason[] = [];

  const versionResult = detectVersionConflict(input.actualVersion, input.expectedVersion);
  if (!versionResult.valid) {
    blockedReasons.push(...versionResult.blockedReasons);
  }

  const hashResult = detectHashMismatch(input.actualConfigHash, input.approvalConfigBeforeHash);
  if (!hashResult.valid) {
    blockedReasons.push(...hashResult.blockedReasons);
  }

  return { valid: blockedReasons.length === 0, blockedReasons };
}

// ─── Duplicate apply evaluation ───────────────────────────────────────────────

/**
 * Models duplicate apply outcome from lock check result.
 * Maps LockCheckResult.outcome to DuplicateApplyOutcome.
 */
export function evaluateDuplicateApply(lockCheckResult: LockCheckResult): DuplicateApplyResult {
  switch (lockCheckResult.outcome) {
    case 'ALLOW_NEW':
      return { outcome: 'ALLOW_NEW', blockedReasons: [] };

    case 'IDEMPOTENT_REPLAY':
      return { outcome: 'IDEMPOTENT_REPLAY', blockedReasons: [] };

    case 'BLOCKED': {
      const reasons = lockCheckResult.blockedReasons;
      const mappedReasons: BlockedReason[] = [];
      if (reasons.includes('F009_READSET_LOCK_CONSUMED')) {
        mappedReasons.push('F009_DUPLICATE_APPLY_CONSUMED');
      }
      if (reasons.includes('F009_READSET_LOCK_PENDING_CONFLICT')) {
        mappedReasons.push('F009_DUPLICATE_APPLY_PENDING');
      }
      // Pass through any other blocked reasons not specifically mapped
      for (const r of reasons) {
        if (!mappedReasons.includes(r)) {
          mappedReasons.push(r);
        }
      }
      return { outcome: 'BLOCKED', blockedReasons: mappedReasons };
    }
  }
}
