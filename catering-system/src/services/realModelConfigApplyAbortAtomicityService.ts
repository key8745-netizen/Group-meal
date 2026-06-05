/**
 * realModelConfigApplyAbortAtomicityService.ts
 *
 * Feature 009 Phase 4: Abort Atomicity Contract
 *
 * Models what must happen atomically on abort:
 *  - FAILED audit event write (not yet executed)
 *  - ABANDONED lock transition (not yet executed)
 *  - No settings mutation
 *  - No settingsHistory write
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 *  - All output contracts: executable: false, aiCanExecute: false
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AbortAtomicityOutcome =
  | 'ABORT_NO_LOCK_TRANSITION'     // abort before lock acquired
  | 'ABORT_WITH_LOCK_ABANDONED'    // abort after PENDING lock acquired
  | 'ABORT_DUPLICATE_IDEMPOTENT'   // duplicate abort, same approvalId+token
  | 'ABORT_CONSUMED_LOCK_NOOP'     // lock already CONSUMED — abort is no-op
  | 'ABORT_ABANDONED_REPLAY';      // lock already ABANDONED — replay allowed

export interface AbortAtomicityContract {
  readonly _kind: 'abort_atomicity_contract';
  readonly executable: false;
  readonly aiCanExecute: false;
  outcome: AbortAtomicityOutcome;
  lockTransitionRequired: boolean;
  lockTransitionTarget: 'ABANDONED' | null;
  auditPayloadRequired: boolean;
  settingsMutationRequired: false;     // always false — no mutation on abort
  historyWriteRequired: false;         // always false — no history write on abort
  abortedAt: Date;
}

export interface AbortAtomicityInput {
  approvalId: string;
  applyToken: string;
  lockStatus: 'NO_LOCK' | 'PENDING' | 'CONSUMED' | 'ABANDONED';
  isDuplicateAbort: boolean;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds an abort atomicity contract describing what must happen atomically on abort.
 * The contract is non-executable — it describes intent only.
 */
export function buildAbortAtomicityContract(input: AbortAtomicityInput): AbortAtomicityContract {
  // Duplicate abort — idempotent, no action required
  if (input.isDuplicateAbort) {
    return {
      _kind: 'abort_atomicity_contract',
      executable: false,
      aiCanExecute: false,
      outcome: 'ABORT_DUPLICATE_IDEMPOTENT',
      lockTransitionRequired: false,
      lockTransitionTarget: null,
      auditPayloadRequired: false,
      settingsMutationRequired: false,
      historyWriteRequired: false,
      abortedAt: new Date(),
    };
  }

  // Lock CONSUMED — abort is a no-op, already completed
  if (input.lockStatus === 'CONSUMED') {
    return {
      _kind: 'abort_atomicity_contract',
      executable: false,
      aiCanExecute: false,
      outcome: 'ABORT_CONSUMED_LOCK_NOOP',
      lockTransitionRequired: false,
      lockTransitionTarget: null,
      auditPayloadRequired: false,
      settingsMutationRequired: false,
      historyWriteRequired: false,
      abortedAt: new Date(),
    };
  }

  // Lock ABANDONED — already aborted, replay is allowed
  if (input.lockStatus === 'ABANDONED') {
    return {
      _kind: 'abort_atomicity_contract',
      executable: false,
      aiCanExecute: false,
      outcome: 'ABORT_ABANDONED_REPLAY',
      lockTransitionRequired: false,
      lockTransitionTarget: null,
      auditPayloadRequired: true,
      settingsMutationRequired: false,
      historyWriteRequired: false,
      abortedAt: new Date(),
    };
  }

  // Lock PENDING — must transition to ABANDONED atomically
  if (input.lockStatus === 'PENDING') {
    return {
      _kind: 'abort_atomicity_contract',
      executable: false,
      aiCanExecute: false,
      outcome: 'ABORT_WITH_LOCK_ABANDONED',
      lockTransitionRequired: true,
      lockTransitionTarget: 'ABANDONED',
      auditPayloadRequired: true,
      settingsMutationRequired: false,
      historyWriteRequired: false,
      abortedAt: new Date(),
    };
  }

  // NO_LOCK — abort before lock acquired, no transition needed
  return {
    _kind: 'abort_atomicity_contract',
    executable: false,
    aiCanExecute: false,
    outcome: 'ABORT_NO_LOCK_TRANSITION',
    lockTransitionRequired: false,
    lockTransitionTarget: null,
    auditPayloadRequired: true,
    settingsMutationRequired: false,
    historyWriteRequired: false,
    abortedAt: new Date(),
  };
}

// ─── Race condition evaluator ─────────────────────────────────────────────────

/**
 * Evaluates whether the abort contract represents a race condition risk.
 * ABORT_WITH_LOCK_ABANDONED requires atomic ABANDONED transition inside a transaction.
 */
export function evaluateAbortRaceCondition(
  abortContract: AbortAtomicityContract,
): { hasRaceConditionRisk: boolean; reasons: string[] } {
  switch (abortContract.outcome) {
    case 'ABORT_NO_LOCK_TRANSITION':
    case 'ABORT_DUPLICATE_IDEMPOTENT':
      // Safe — no lock state to transition
      return { hasRaceConditionRisk: false, reasons: [] };

    case 'ABORT_WITH_LOCK_ABANDONED':
      // Must be done inside a transaction to avoid leaving lock in PENDING permanently
      return {
        hasRaceConditionRisk: true,
        reasons: ['PENDING_LOCK_REQUIRES_ATOMIC_ABANDONED_TRANSITION'],
      };

    case 'ABORT_CONSUMED_LOCK_NOOP':
    case 'ABORT_ABANDONED_REPLAY':
      // Stable states — no race condition risk
      return { hasRaceConditionRisk: false, reasons: [] };
  }
}
