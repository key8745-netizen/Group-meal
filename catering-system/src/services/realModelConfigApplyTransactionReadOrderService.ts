/**
 * realModelConfigApplyTransactionReadOrderService.ts
 *
 * Feature 009 Phase 3: Transaction Read-Set Order Contract
 *
 * Models the required read order for the future real runTransaction:
 *   1. approval
 *   2. settings
 *   3. idempotency lock
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 *  - All output contracts: executable: false, aiCanExecute: false
 */

import type { BlockedReason } from '../types/aiBoundary';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReadOrderStep = 'approval' | 'settings' | 'idempotencyLock';

export interface TransactionReadOrderContract {
  readonly _kind: 'transaction_read_order_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  readOrder: ReadOrderStep[];
  rationale: Record<ReadOrderStep, string>;
  approvalPath: string;
  settingsPath: string;
  lockPath: string;
  generatedAt: Date;
}

export interface ReadOrderValidationInput {
  tenantId: string;
  approvalId: string;
  lockId: string;
  approvalValid: boolean;
  settingsValid: boolean;
  lockValid: boolean;
}

export interface ReadOrderValidationResult {
  canBuildWriteSet: boolean;
  blockedReasons: BlockedReason[];
  contract: TransactionReadOrderContract;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const READ_ORDER: ReadOrderStep[] = ['approval', 'settings', 'idempotencyLock'];

const RATIONALE: Record<ReadOrderStep, string> = {
  approval:
    'Approval must be validated first — it carries configBeforeHash and expectedCurrentVersion ' +
    'that subsequent reads depend on.',
  settings:
    'Settings must be read after approval so the approval configBeforeHash can be compared ' +
    'against the live currentConfigHash, and the version can be checked.',
  idempotencyLock:
    'Lock is read last because the duplicate-apply decision depends on both the approval ' +
    'applyToken and the expectedCurrentVersion read from settings.',
};

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Builds the static read order contract with correct Firestore paths and rationale.
 * Pure function — no I/O.
 */
export function buildTransactionReadOrderContract(
  tenantId: string,
  approvalId: string,
  lockId: string,
): TransactionReadOrderContract {
  return {
    _kind: 'transaction_read_order_contract',
    executable: false,
    aiCanExecute: false,
    readOrder: [...READ_ORDER],
    rationale: { ...RATIONALE },
    approvalPath: `approvals/${tenantId}/${approvalId}`,
    settingsPath: `settings/${tenantId}`,
    lockPath: `modelConfigIdempotencyLocks/${lockId}`,
    generatedAt: new Date(),
  };
}

/**
 * Validates that all read-set items are valid.
 * If any is invalid, canBuildWriteSet is false and step-specific reasons are added.
 * F009_READSET_INVALID_PREVENTS_WRITE_SET is always added when any step is invalid.
 */
export function validateTransactionReadOrder(
  input: ReadOrderValidationInput,
): ReadOrderValidationResult {
  const blockedReasons: BlockedReason[] = [];

  if (!input.approvalValid) {
    blockedReasons.push('F009_READSET_ORDER_APPROVAL_REQUIRED');
  }
  if (!input.settingsValid) {
    blockedReasons.push('F009_READSET_ORDER_SETTINGS_REQUIRED');
  }
  if (!input.lockValid) {
    blockedReasons.push('F009_READSET_ORDER_LOCK_REQUIRED');
  }

  if (blockedReasons.length > 0) {
    blockedReasons.push('F009_READSET_INVALID_PREVENTS_WRITE_SET');
  }

  const contract = buildTransactionReadOrderContract(
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
