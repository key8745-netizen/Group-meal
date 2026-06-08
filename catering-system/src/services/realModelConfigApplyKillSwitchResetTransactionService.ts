/**
 * realModelConfigApplyKillSwitchResetTransactionService.ts
 *
 * Feature 009 Phase 5C: Kill Switch Reset Transaction Protection
 *
 * Hardens Phase 5B's `evaluateKillSwitchResetAuditPayload` contract by adding
 * a full reset TRANSACTION boundary model: read-set / write-set as pure data
 * structures, two-person integrity enforcement, idempotency via auditTrailId,
 * and failure-consistency modeling (no inconsistent state ever results).
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no real runTransaction, no I/O
 *  - Pure synchronous — default-deny on any missing/ambiguous input
 *  - AI can never request, approve, or execute a kill switch reset
 */

import type { BlockedReason } from '../types/aiBoundary';
import type {
  KillSwitchScope,
  KillSwitchState,
} from './realModelConfigApplyProductionGateService';

// ─── Caller context (mirrors F009CallerType usage elsewhere) ────────────────

export type KillSwitchResetCallerType = 'HUMAN' | 'AI' | 'SERVICE_ACCOUNT' | 'ADMIN_SDK' | 'UNKNOWN';

export interface KillSwitchResetCallerContext {
  callerType: KillSwitchResetCallerType;
  callerUserId: string;
}

// ─── Reset transaction request (the "intent") ────────────────────────────────

export interface KillSwitchResetTransactionRequest {
  readonly _kind: 'f009_phase5c_kill_switch_reset_transaction_request';
  scope: KillSwitchScope;
  requestedBy: string;
  approvedBy: string;
  previousState: KillSwitchState;
  nextState: KillSwitchState;
  reason: string;
  timestamp: string;
  auditTrailId: string;
  requestedByContext: KillSwitchResetCallerContext;
  approvedByContext: KillSwitchResetCallerContext;
}

// ─── Read-set / write-set boundary (pure data, never executed) ──────────────

/**
 * Modeled read-set for the reset transaction — what a real `runTransaction`
 * would have to read BEFORE writing. Pure data only; no Firestore reads occur.
 */
export interface KillSwitchResetReadSet {
  readonly _kind: 'f009_phase5c_kill_switch_reset_read_set';
  readonly executable: false;
  killSwitchDocPath: string;
  observedCurrentState: KillSwitchState | 'MISSING' | 'UNKNOWN';
  observedAuditTrailIds: string[];
}

/**
 * Modeled write-set for the reset transaction — what a real `runTransaction`
 * would have to write ATOMICALLY. Pure data only; no Firestore writes occur.
 */
export interface KillSwitchResetWriteSet {
  readonly _kind: 'f009_phase5c_kill_switch_reset_write_set';
  readonly executable: false;
  killSwitchDocPath: string;
  killSwitchDocWrite: { state: KillSwitchState; lastUpdatedAt: string };
  auditDocPath: string;
  auditDocWrite: { auditTrailId: string; requestedBy: string; approvedBy: string; reason: string };
}

export interface KillSwitchResetTransactionPlan {
  readonly _kind: 'f009_phase5c_kill_switch_reset_transaction_plan';
  readonly executable: false;
  readSet: KillSwitchResetReadSet;
  writeSet: KillSwitchResetWriteSet;
}

/** Validates the read-set is structurally complete and internally coherent. */
export function evaluateReadSet(
  readSet: KillSwitchResetReadSet | null | undefined,
): { valid: boolean; blockedReasons: BlockedReason[] } {
  if (
    !readSet
    || (readSet as { _kind?: string })._kind !== 'f009_phase5c_kill_switch_reset_read_set'
    || !isNonEmpty(readSet.killSwitchDocPath)
    || !Array.isArray(readSet.observedAuditTrailIds)
  ) {
    return { valid: false, blockedReasons: ['F009_PHASE5C_RESET_TXN_READ_SET_INVALID'] };
  }
  return { valid: true, blockedReasons: [] };
}

/** Validates the write-set is structurally complete and internally coherent. */
export function evaluateWriteSet(
  writeSet: KillSwitchResetWriteSet | null | undefined,
): { valid: boolean; blockedReasons: BlockedReason[] } {
  if (
    !writeSet
    || (writeSet as { _kind?: string })._kind !== 'f009_phase5c_kill_switch_reset_write_set'
    || !isNonEmpty(writeSet.killSwitchDocPath)
    || !isNonEmpty(writeSet.auditDocPath)
    || !writeSet.killSwitchDocWrite
    || !writeSet.auditDocWrite
    || !isNonEmpty(writeSet.auditDocWrite.auditTrailId)
    || !isNonEmpty(writeSet.killSwitchDocWrite.lastUpdatedAt)
  ) {
    return { valid: false, blockedReasons: ['F009_PHASE5C_RESET_TXN_WRITE_SET_INVALID'] };
  }
  return { valid: true, blockedReasons: [] };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const REQUIRED_STRING_FIELDS: (keyof KillSwitchResetTransactionRequest)[] = [
  'requestedBy', 'approvedBy', 'previousState', 'nextState', 'reason', 'timestamp', 'auditTrailId',
];

const REASON_BY_FIELD: Record<string, BlockedReason> = {
  requestedBy: 'F009_PHASE5C_RESET_TXN_MISSING_REQUESTED_BY',
  approvedBy: 'F009_PHASE5C_RESET_TXN_MISSING_APPROVED_BY',
  reason: 'F009_PHASE5C_RESET_TXN_MISSING_REASON',
  previousState: 'F009_PHASE5C_RESET_TXN_MISSING_PREVIOUS_STATE',
  nextState: 'F009_PHASE5C_RESET_TXN_MISSING_NEXT_STATE',
  auditTrailId: 'F009_PHASE5C_RESET_TXN_MISSING_AUDIT_TRAIL_ID',
};

// ─── Idempotency ledger (pure data — models prior reset attempts) ───────────

export interface KillSwitchResetIdempotencyLedger {
  readonly _kind: 'f009_phase5c_kill_switch_reset_idempotency_ledger';
  /** auditTrailIds of resets already completed/recorded */
  consumedAuditTrailIds: string[];
}

// ─── Core evaluation ─────────────────────────────────────────────────────────

export interface KillSwitchResetTransactionEvaluationInput {
  request: KillSwitchResetTransactionRequest | null | undefined;
  /** The kill switch state observed at read time — must match request.previousState */
  observedCurrentState: KillSwitchState | 'MISSING' | 'UNKNOWN';
  ledger: KillSwitchResetIdempotencyLedger | null | undefined;
  plan: KillSwitchResetTransactionPlan | null | undefined;
  /** Modeled outcome of the (never-executed) audit write */
  auditWriteWouldSucceed: boolean;
  /** Modeled outcome of the (never-executed) state write */
  stateWriteWouldSucceed: boolean;
}

export interface KillSwitchResetTransactionEvaluationResult {
  readonly _kind: 'f009_phase5c_kill_switch_reset_transaction_evaluation_result';
  readonly executable: false;
  readonly aiCanExecute: false;
  /** true ONLY when every check passes AND both writes would succeed atomically */
  passed: boolean;
  blockedReasons: BlockedReason[];
  missingFields: string[];
  /** true when this exact auditTrailId was already consumed (idempotent no-op) */
  isDuplicate: boolean;
  /** true when evaluation determined no inconsistent state would result */
  consistencyPreserved: boolean;
}

/**
 * Evaluates a kill switch reset transaction request end-to-end as a pure,
 * non-executable model. Collects ALL applicable blocked reasons (never
 * short-circuits on the first). Default-deny: any missing/ambiguous/AI-origin
 * input blocks.
 *
 * Failure-consistency invariant modeled here: if EITHER the audit write or
 * the state write would fail, the WHOLE transaction is blocked — atomicity
 * means neither side-effect occurs, so no inconsistent state can result.
 */
export function evaluateKillSwitchResetTransaction(
  input: KillSwitchResetTransactionEvaluationInput,
): KillSwitchResetTransactionEvaluationResult {
  const blocked: BlockedReason[] = [];
  const missing: string[] = [];

  const req = input.request;
  if (!req || (req as { _kind?: string })._kind !== 'f009_phase5c_kill_switch_reset_transaction_request') {
    return {
      _kind: 'f009_phase5c_kill_switch_reset_transaction_evaluation_result',
      executable: false,
      aiCanExecute: false,
      passed: false,
      blockedReasons: ['F009_PHASE5C_RESET_TXN_MISSING_AUDIT_TRAIL_ID'],
      missingFields: ['_request'],
      isDuplicate: false,
      consistencyPreserved: true, // nothing attempted → nothing inconsistent
    };
  }

  // ── AI boundary — AI can never request or approve a reset ──────────────────
  if (req.requestedByContext?.callerType === 'AI' || req.requestedByContext?.callerType === 'SERVICE_ACCOUNT' || req.requestedByContext?.callerType === 'ADMIN_SDK') {
    blocked.push('F009_PHASE5C_RESET_TXN_AI_CALLER_BLOCKED');
  }
  if (req.approvedByContext?.callerType === 'AI' || req.approvedByContext?.callerType === 'SERVICE_ACCOUNT' || req.approvedByContext?.callerType === 'ADMIN_SDK') {
    blocked.push('F009_PHASE5C_RESET_TXN_AI_APPROVAL_BLOCKED');
  }
  if (req.requestedByContext?.callerType === 'UNKNOWN' || req.approvedByContext?.callerType === 'UNKNOWN') {
    blocked.push('F009_PHASE5C_RESET_TXN_AI_CALLER_BLOCKED');
  }

  // ── Required field presence ─────────────────────────────────────────────────
  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmpty(req[field] as unknown as string)) {
      missing.push(field as string);
      blocked.push(REASON_BY_FIELD[field as string]);
    }
  }

  // ── Two-person integrity ────────────────────────────────────────────────────
  if (isNonEmpty(req.requestedBy) && isNonEmpty(req.approvedBy) && req.requestedBy === req.approvedBy) {
    blocked.push('F009_PHASE5C_RESET_TXN_TWO_PERSON_REQUIRED');
  }

  // ── previousState / nextState consistency vs observed read-set ─────────────
  if (isNonEmpty(req.previousState) && req.previousState !== input.observedCurrentState) {
    blocked.push('F009_PHASE5C_RESET_TXN_PREVIOUS_STATE_MISMATCH');
  }
  if (isNonEmpty(req.nextState) && isNonEmpty(req.previousState) && req.nextState === req.previousState) {
    blocked.push('F009_PHASE5C_RESET_TXN_NEXT_STATE_MISMATCH');
  }

  // ── Idempotency ─────────────────────────────────────────────────────────────
  let isDuplicate = false;
  const ledger = input.ledger;
  if (ledger && (ledger as { _kind?: string })._kind === 'f009_phase5c_kill_switch_reset_idempotency_ledger') {
    if (isNonEmpty(req.auditTrailId) && ledger.consumedAuditTrailIds.includes(req.auditTrailId)) {
      isDuplicate = true;
      blocked.push('F009_PHASE5C_RESET_TXN_DUPLICATE_BLOCKED_BY_IDEMPOTENCY');
    }
  } else {
    // Missing ledger → cannot prove idempotency → default-deny
    blocked.push('F009_PHASE5C_RESET_TXN_DUPLICATE_BLOCKED_BY_IDEMPOTENCY');
  }

  // ── Read-set / write-set structural validation ─────────────────────────────
  const plan = input.plan;
  let readSetValid = false;
  let writeSetValid = false;
  if (!plan || (plan as { _kind?: string })._kind !== 'f009_phase5c_kill_switch_reset_transaction_plan') {
    blocked.push('F009_PHASE5C_RESET_TXN_READ_SET_INVALID', 'F009_PHASE5C_RESET_TXN_WRITE_SET_INVALID');
  } else {
    const rs = evaluateReadSet(plan.readSet);
    const ws = evaluateWriteSet(plan.writeSet);
    readSetValid = rs.valid;
    writeSetValid = ws.valid;
    blocked.push(...rs.blockedReasons, ...ws.blockedReasons);

    // Cross-check: write-set audit trail id must equal request's auditTrailId
    if (rs.valid && ws.valid && plan.writeSet.auditDocWrite.auditTrailId !== req.auditTrailId) {
      blocked.push('F009_PHASE5C_RESET_TXN_WRITE_SET_INVALID');
    }
    // Cross-check: write-set next state must equal request's nextState
    if (ws.valid && plan.writeSet.killSwitchDocWrite.state !== req.nextState) {
      blocked.push('F009_PHASE5C_RESET_TXN_WRITE_SET_INVALID');
    }
  }

  // ── Atomicity / failure-consistency modeling ───────────────────────────────
  // The transaction is atomic: BOTH writes succeed, or NEITHER is applied.
  // Any single-sided failure must hard-block the whole transition.
  let consistencyPreserved = true;
  if (input.auditWriteWouldSucceed !== input.stateWriteWouldSucceed) {
    // Asymmetric outcome would be inconsistent if not for atomicity — model
    // blocks the whole transaction so no inconsistent state ever results.
    consistencyPreserved = true; // preserved BECAUSE we block below
    if (!input.auditWriteWouldSucceed) {
      blocked.push('F009_PHASE5C_RESET_TXN_AUDIT_WRITE_FAILED');
    }
    if (!input.stateWriteWouldSucceed) {
      blocked.push('F009_PHASE5C_RESET_TXN_STATE_WRITE_FAILED');
    }
    blocked.push('F009_PHASE5C_RESET_TXN_INCONSISTENT_STATE_BLOCKED');
  } else if (input.auditWriteWouldSucceed === false && input.stateWriteWouldSucceed === false) {
    blocked.push('F009_PHASE5C_RESET_TXN_AUDIT_WRITE_FAILED', 'F009_PHASE5C_RESET_TXN_STATE_WRITE_FAILED');
  }

  const uniqueBlocked = [...new Set(blocked)];

  return {
    _kind: 'f009_phase5c_kill_switch_reset_transaction_evaluation_result',
    executable: false,
    aiCanExecute: false,
    passed: uniqueBlocked.length === 0 && readSetValid && writeSetValid && !isDuplicate,
    blockedReasons: uniqueBlocked,
    missingFields: missing,
    isDuplicate,
    consistencyPreserved,
  };
}

// ─── Reset audit payload (atomic with state transition) ─────────────────────

export interface KillSwitchResetAuditTrailPayload {
  readonly _kind: 'f009_phase5c_kill_switch_reset_audit_trail_payload';
  readonly executable: false;
  readonly aiCanExecute: false;
  scope: KillSwitchScope;
  requestedBy: string;
  approvedBy: string;
  previousState: KillSwitchState;
  nextState: KillSwitchState;
  reason: string;
  auditTrailId: string;
  evaluationPassed: boolean;
  blockedReasons: BlockedReason[];
  builtAt: string;
}

/**
 * Builds the reset audit payload. The payload's `evaluationPassed` mirrors the
 * transaction evaluation — the audit write and the state transition are
 * modeled as ATOMIC (audit write failure blocks the state transition; state
 * write failure blocks audit completion).
 */
export function buildKillSwitchResetAuditTrailPayload(input: {
  request: KillSwitchResetTransactionRequest;
  evaluation: KillSwitchResetTransactionEvaluationResult;
  builtAt: string;
}): KillSwitchResetAuditTrailPayload {
  return {
    _kind: 'f009_phase5c_kill_switch_reset_audit_trail_payload',
    executable: false,
    aiCanExecute: false,
    scope: input.request.scope,
    requestedBy: input.request.requestedBy,
    approvedBy: input.request.approvedBy,
    previousState: input.request.previousState,
    nextState: input.request.nextState,
    reason: input.request.reason,
    auditTrailId: input.request.auditTrailId,
    evaluationPassed: input.evaluation.passed,
    blockedReasons: [...input.evaluation.blockedReasons],
    builtAt: input.builtAt,
  };
}
