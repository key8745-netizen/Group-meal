/**
 * Feature 009 Phase 5C: Kill Switch Reset Transaction Protection tests
 * Pure runner — no test framework. npx tsx from repo root.
 */
import {
  evaluateKillSwitchResetTransaction,
  evaluateReadSet,
  evaluateWriteSet,
  buildKillSwitchResetAuditTrailPayload,
} from '../realModelConfigApplyKillSwitchResetTransactionService';
import type {
  KillSwitchResetTransactionRequest,
  KillSwitchResetReadSet,
  KillSwitchResetWriteSet,
  KillSwitchResetTransactionPlan,
  KillSwitchResetIdempotencyLedger,
  KillSwitchResetCallerContext,
} from '../realModelConfigApplyKillSwitchResetTransactionService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5C: Kill Switch Reset Transaction Protection ===\n');

const now = '2026-06-08T12:00:00Z';
const human = (id: string): KillSwitchResetCallerContext => ({ callerType: 'HUMAN', callerUserId: id });
const ai = (id: string): KillSwitchResetCallerContext => ({ callerType: 'AI', callerUserId: id });

const baseRequest: KillSwitchResetTransactionRequest = {
  _kind: 'f009_phase5c_kill_switch_reset_transaction_request',
  scope: { kind: 'global' },
  requestedBy: 'operator-a',
  approvedBy: 'operator-b',
  previousState: 'ON',
  nextState: 'OFF',
  reason: 'incident resolved',
  timestamp: now,
  auditTrailId: 'audit-reset-tx-1',
  requestedByContext: human('operator-a'),
  approvedByContext: human('operator-b'),
};

const readSet: KillSwitchResetReadSet = {
  _kind: 'f009_phase5c_kill_switch_reset_read_set',
  executable: false,
  killSwitchDocPath: 'settings/kill_switch',
  observedCurrentState: 'ON',
  observedAuditTrailIds: ['audit-old-1'],
};

const writeSet: KillSwitchResetWriteSet = {
  _kind: 'f009_phase5c_kill_switch_reset_write_set',
  executable: false,
  killSwitchDocPath: 'settings/kill_switch',
  killSwitchDocWrite: { state: 'OFF', lastUpdatedAt: now },
  auditDocPath: 'kill_switch_audit/audit-reset-tx-1',
  auditDocWrite: { auditTrailId: 'audit-reset-tx-1', requestedBy: 'operator-a', approvedBy: 'operator-b', reason: 'incident resolved' },
};

const plan: KillSwitchResetTransactionPlan = {
  _kind: 'f009_phase5c_kill_switch_reset_transaction_plan',
  executable: false,
  readSet,
  writeSet,
};

const emptyLedger: KillSwitchResetIdempotencyLedger = {
  _kind: 'f009_phase5c_kill_switch_reset_idempotency_ledger',
  consumedAuditTrailIds: [],
};

function evalValid(overrides: Partial<KillSwitchResetTransactionRequest> = {}, opts: Partial<{ observedCurrentState: any; ledger: any; plan: any; auditOk: boolean; stateOk: boolean }> = {}) {
  return evaluateKillSwitchResetTransaction({
    request: { ...baseRequest, ...overrides },
    observedCurrentState: opts.observedCurrentState ?? 'ON',
    ledger: 'ledger' in opts ? opts.ledger : emptyLedger,
    plan: 'plan' in opts ? opts.plan : plan,
    auditWriteWouldSucceed: opts.auditOk ?? true,
    stateWriteWouldSucceed: opts.stateOk ?? true,
  });
}

console.log('[Valid reset]\n');
const v1 = evalValid();
expect('valid reset with TPI passes', v1.passed === true);
expect('valid reset → consistency preserved', v1.consistencyPreserved === true);
expect('valid reset → not duplicate', v1.isDuplicate === false);

console.log('\n[Two-person integrity]\n');
const v2 = evalValid({ requestedBy: 'same', approvedBy: 'same', requestedByContext: human('same'), approvedByContext: human('same') });
expect('requestedBy === approvedBy BLOCKED', v2.blockedReasons.includes('F009_PHASE5C_RESET_TXN_TWO_PERSON_REQUIRED'));

console.log('\n[Required fields]\n');
expect('missing requestedBy BLOCKED', evalValid({ requestedBy: '' }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_MISSING_REQUESTED_BY'));
expect('missing approvedBy BLOCKED', evalValid({ approvedBy: '' }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_MISSING_APPROVED_BY'));
expect('missing reason BLOCKED', evalValid({ reason: '' }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_MISSING_REASON'));
expect('missing previousState BLOCKED', evalValid({ previousState: '' as any }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_MISSING_PREVIOUS_STATE'));
expect('missing nextState BLOCKED', evalValid({ nextState: '' as any }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_MISSING_NEXT_STATE'));
expect('missing auditTrailId BLOCKED', evalValid({ auditTrailId: '' }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_MISSING_AUDIT_TRAIL_ID'));

console.log('\n[State consistency]\n');
const v3 = evalValid({}, { observedCurrentState: 'OFF' });
expect('previousState mismatch BLOCKED', v3.blockedReasons.includes('F009_PHASE5C_RESET_TXN_PREVIOUS_STATE_MISMATCH'));

const v4 = evalValid({ nextState: 'ON' });
expect('nextState mismatch (same as previous) BLOCKED', v4.blockedReasons.includes('F009_PHASE5C_RESET_TXN_NEXT_STATE_MISMATCH'));

console.log('\n[Idempotency]\n');
const dupLedger: KillSwitchResetIdempotencyLedger = { _kind: 'f009_phase5c_kill_switch_reset_idempotency_ledger', consumedAuditTrailIds: ['audit-reset-tx-1'] };
const v5 = evalValid({}, { ledger: dupLedger });
expect('duplicate reset idempotency modeled / BLOCKED', v5.blockedReasons.includes('F009_PHASE5C_RESET_TXN_DUPLICATE_BLOCKED_BY_IDEMPOTENCY') && v5.isDuplicate === true);

const v5b = evalValid({}, { ledger: null });
expect('missing ledger → cannot prove idempotency → default-deny', v5b.blockedReasons.includes('F009_PHASE5C_RESET_TXN_DUPLICATE_BLOCKED_BY_IDEMPOTENCY'));

console.log('\n[Atomicity / failure consistency]\n');
const v6 = evalValid({}, { auditOk: false, stateOk: true });
expect('reset audit failure blocks state transition', v6.blockedReasons.includes('F009_PHASE5C_RESET_TXN_AUDIT_WRITE_FAILED') && v6.passed === false);
expect('reset audit failure → inconsistency blocked, no inconsistent state', v6.blockedReasons.includes('F009_PHASE5C_RESET_TXN_INCONSISTENT_STATE_BLOCKED') && v6.consistencyPreserved === true);

const v7 = evalValid({}, { auditOk: true, stateOk: false });
expect('reset state failure blocks audit completion', v7.blockedReasons.includes('F009_PHASE5C_RESET_TXN_STATE_WRITE_FAILED') && v7.passed === false);
expect('reset failure leaves no inconsistent state (modeled)', v7.consistencyPreserved === true);

const v8 = evalValid({}, { auditOk: false, stateOk: false });
expect('both writes failing → both reasons present, blocked', v8.blockedReasons.includes('F009_PHASE5C_RESET_TXN_AUDIT_WRITE_FAILED') && v8.blockedReasons.includes('F009_PHASE5C_RESET_TXN_STATE_WRITE_FAILED'));

console.log('\n[Read-set / Write-set]\n');
expect('reset transaction read set modeled', evaluateReadSet(readSet).valid === true);
expect('reset transaction write set modeled', evaluateWriteSet(writeSet).valid === true);
expect('malformed read set BLOCKED', evaluateReadSet({ ...readSet, killSwitchDocPath: '' }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_READ_SET_INVALID'));
expect('malformed write set BLOCKED', evaluateWriteSet({ ...writeSet, auditDocPath: '' }).blockedReasons.includes('F009_PHASE5C_RESET_TXN_WRITE_SET_INVALID'));

const v9 = evalValid({}, { plan: null });
expect('missing plan → read/write set BLOCKED', v9.blockedReasons.includes('F009_PHASE5C_RESET_TXN_READ_SET_INVALID') && v9.blockedReasons.includes('F009_PHASE5C_RESET_TXN_WRITE_SET_INVALID'));

console.log('\n[AI boundary]\n');
const v10 = evalValid({ requestedByContext: ai('ai-1') });
expect('AI cannot request a kill switch reset', v10.blockedReasons.includes('F009_PHASE5C_RESET_TXN_AI_CALLER_BLOCKED'));

const v11 = evalValid({ approvedByContext: ai('ai-2') });
expect('AI cannot approve a kill switch reset', v11.blockedReasons.includes('F009_PHASE5C_RESET_TXN_AI_APPROVAL_BLOCKED'));

console.log('\n[Audit payload]\n');
const auditPayload = buildKillSwitchResetAuditTrailPayload({ request: baseRequest, evaluation: v1, builtAt: now });
expect('reset audit trail payload non-executable / aiCanExecute false', auditPayload.executable === false && auditPayload.aiCanExecute === false);
expect('reset audit trail payload carries auditTrailId + requestedBy/approvedBy', auditPayload.auditTrailId === 'audit-reset-tx-1' && auditPayload.requestedBy === 'operator-a' && auditPayload.approvedBy === 'operator-b');

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5C Kill Switch Reset Transaction Protection (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
