/**
 * realModelConfigApplyLiveReadSequenceService.ts
 *
 * Feature 009 Phase 4: Simulated Live Transaction Read Sequence Contract
 *
 * Models the ordered read sequence that a real runTransaction executor would follow:
 *   Step 1: read approval
 *   Step 2: read settings
 *   Step 3: read idempotency lock
 *   Step 4: validate approval
 *   Step 5: validate settings version / hash
 *   Step 6: validate lock
 *   Step 7: decide write-set contract eligibility
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 *  - All output contracts: executable: false, aiCanExecute: false
 */

import type { BlockedReason } from '../types/aiBoundary';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LiveReadStep =
  | 'READ_APPROVAL'
  | 'READ_SETTINGS'
  | 'READ_LOCK'
  | 'VALIDATE_APPROVAL'
  | 'VALIDATE_SETTINGS'
  | 'VALIDATE_LOCK'
  | 'DECIDE_WRITE_SET_ELIGIBILITY';

export interface LiveReadSequenceContract {
  readonly _kind: 'live_read_sequence_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  sequence: LiveReadStep[];
  rationale: Record<LiveReadStep, string>;
  approvalPath: string;
  settingsPath: string;
  lockPath: string;
  generatedAt: Date;
}

export interface LiveReadSequenceValidationInput {
  tenantId: string;
  approvalId: string;
  lockId: string;
  approvalReadValid: boolean;   // was the approval read result valid?
  settingsReadValid: boolean;   // was the settings read result valid?
  lockReadValid: boolean;       // null lock = valid (ALLOW_NEW)
}

export interface LiveReadSequenceValidationResult {
  canBuildWriteSet: boolean;
  blockedReasons: BlockedReason[];
  contract: LiveReadSequenceContract;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVE_READ_SEQUENCE: LiveReadStep[] = [
  'READ_APPROVAL',
  'READ_SETTINGS',
  'READ_LOCK',
  'VALIDATE_APPROVAL',
  'VALIDATE_SETTINGS',
  'VALIDATE_LOCK',
  'DECIDE_WRITE_SET_ELIGIBILITY',
];

const RATIONALE: Record<LiveReadStep, string> = {
  READ_APPROVAL:
    'Approval must be read first inside the transaction — it carries configBeforeHash, ' +
    'expectedCurrentVersion, and applyToken that all subsequent validation steps depend on.',
  READ_SETTINGS:
    'Settings must be read after approval so that the approval configBeforeHash can be ' +
    'compared against the live currentConfigHash, and the version can be verified.',
  READ_LOCK:
    'Idempotency lock is read last because the duplicate-apply decision requires both the ' +
    'approval applyToken and the expectedCurrentVersion already validated from settings.',
  VALIDATE_APPROVAL:
    'Approval validation (status, tenant, approvedBy, expiry) must complete before settings ' +
    'validation — only a valid approval provides a trustworthy configBeforeHash reference.',
  VALIDATE_SETTINGS:
    'Settings validation (version match, hash match) must occur before lock validation — ' +
    'the lock payloadHash is derived from configAfterHash which is approval-dependent.',
  VALIDATE_LOCK:
    'Lock validation (idempotency check, PENDING conflict, CONSUMED guard) must occur after ' +
    'both approval and settings are validated to determine whether the write-set is safe.',
  DECIDE_WRITE_SET_ELIGIBILITY:
    'Write-set eligibility is determined only after all three reads and their validations ' +
    'succeed — any single failure prevents a write-set from being constructed.',
};

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Builds the static live read sequence contract with correct Firestore paths and rationale.
 * Pure function — no I/O.
 */
export function buildLiveReadSequenceContract(
  tenantId: string,
  approvalId: string,
  lockId: string,
): LiveReadSequenceContract {
  return {
    _kind: 'live_read_sequence_contract',
    executable: false,
    aiCanExecute: false,
    sequence: [...LIVE_READ_SEQUENCE],
    rationale: { ...RATIONALE },
    approvalPath: `approvals/${tenantId}/${approvalId}`,
    settingsPath: `settings/${tenantId}`,
    lockPath: `modelConfigIdempotencyLocks/${lockId}`,
    generatedAt: new Date(),
  };
}

/**
 * Validates that all live read-set items are valid.
 * If any is invalid, canBuildWriteSet is false and step-specific reasons are added.
 * F009_LIVE_READ_INVALID_PREVENTS_WRITE_SET is always added when any step is invalid.
 */
export function validateLiveReadSequence(
  input: LiveReadSequenceValidationInput,
): LiveReadSequenceValidationResult {
  const blockedReasons: BlockedReason[] = [];

  if (!input.approvalReadValid) {
    blockedReasons.push('F009_LIVE_READ_APPROVAL_REQUIRED');
  }
  if (!input.settingsReadValid) {
    blockedReasons.push('F009_LIVE_READ_SETTINGS_REQUIRED');
  }
  if (!input.lockReadValid) {
    blockedReasons.push('F009_LIVE_READ_LOCK_REQUIRED');
  }

  if (blockedReasons.length > 0) {
    blockedReasons.push('F009_LIVE_READ_INVALID_PREVENTS_WRITE_SET');
  }

  const contract = buildLiveReadSequenceContract(
    input.tenantId,
    input.approvalId,
    input.lockId,
  );

  return {
    canBuildWriteSet: blockedReasons.length === 0,
    blockedReasons,
    contract,
  };
}
