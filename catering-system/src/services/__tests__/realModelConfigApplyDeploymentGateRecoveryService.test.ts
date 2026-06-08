import {
  evaluateCiInterruption,
  detectOrphanedToken,
  evaluateTokenGateCrossState,
  evaluateDeploymentAbortScenario,
  evaluateRetryRequiresFreshApproval,
  evaluateGateStaleness,
  buildDeploymentAbortedAuditPayload,
  buildGateAutoInvalidateAuditPayload,
  buildSelfInvalidateAuditPayload,
  type CiInterruptionInput,
  type OrphanedTokenCandidate,
  type TokenGateCrossStateInput,
  type DeploymentAbortScenarioInput,
  type RetryAttemptInput,
  type GateStalenessInput,
} from '../realModelConfigApplyDeploymentGateRecoveryService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5D: Deployment Gate Recovery ---');

// ── CI interruption ──────────────────────────────────────────────────────────
const before: CiInterruptionInput = { _kind: 'f009_phase5d_ci_interruption_input', reachedStage: 'BEFORE_TOKEN_INJECTION', interrupted: true };
const r1 = evaluateCiInterruption(before);
expect('CI interrupted before token injection blocked', r1.blocked === true);
expect('CI interrupted before injection reason present', r1.blockedReasons.includes('F009_PHASE5D_CI_INTERRUPTED_BEFORE_TOKEN_INJECTION'));
expect('CI interrupted before injection: no orphan suspected', r1.orphanedTokenSuspected === false);

const afterTok: CiInterruptionInput = { _kind: 'f009_phase5d_ci_interruption_input', reachedStage: 'TOKEN_INJECTED', interrupted: true };
const r2 = evaluateCiInterruption(afterTok);
expect('CI interrupted after token injection blocked', r2.blocked === true);
expect('CI interrupted after injection reason present', r2.blockedReasons.includes('F009_PHASE5D_CI_INTERRUPTED_AFTER_TOKEN_INJECTION'));
expect('CI interrupted after injection: orphan suspected', r2.orphanedTokenSuspected === true);

const afterGate: CiInterruptionInput = { _kind: 'f009_phase5d_ci_interruption_input', reachedStage: 'GATE_UPDATED', interrupted: true };
const r3 = evaluateCiInterruption(afterGate);
expect('CI interrupted after gate update blocked', r3.blocked === true);
expect('CI interrupted after gate update reason present', r3.blockedReasons.includes('F009_PHASE5D_CI_INTERRUPTED_AFTER_GATE_UPDATE'));
expect('CI interrupted after gate update: orphan suspected', r3.orphanedTokenSuspected === true);

expect('CI interruption fails closed always', r1.blockedReasons.includes('F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED')
  && r2.blockedReasons.includes('F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED')
  && r3.blockedReasons.includes('F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED'));

expect('CI interruption: malformed input default-deny', evaluateCiInterruption(null).blocked === true);
expect('CI interruption: not-interrupted input still blocked (ambiguous)', evaluateCiInterruption({ _kind: 'f009_phase5d_ci_interruption_input', reachedStage: 'TOKEN_INJECTED', interrupted: false }).blocked === true);

// ── Orphaned token detection + SELF_INVALIDATE ──────────────────────────────
const orphanCandidate: OrphanedTokenCandidate = {
  _kind: 'f009_phase5d_orphaned_token_candidate',
  tokenId: 'tok-1',
  gateRecordMissing: true,
  gateRecordTokenMismatch: false,
  ciRunTerminated: false,
  issuedAt: '2026-06-08T00:00:00.000Z',
  now: '2026-06-08T00:05:00.000Z',
  staleAfterSeconds: 600,
};
const orphanResult = detectOrphanedToken(orphanCandidate);
expect('Orphaned token detected (gate record missing)', orphanResult.isOrphaned === true);
expect('Orphaned token must SELF_INVALIDATE', orphanResult.selfInvalidate === true);
expect('Orphaned token detection reason present', orphanResult.blockedReasons.includes('F009_PHASE5D_ORPHANED_TOKEN_DETECTED'));
expect('SELF_INVALIDATE reason present', orphanResult.blockedReasons.includes('F009_PHASE5D_SELF_INVALIDATE'));

const validCandidate: OrphanedTokenCandidate = {
  ...orphanCandidate,
  gateRecordMissing: false,
  now: '2026-06-08T00:01:00.000Z',
};
const validResult = detectOrphanedToken(validCandidate);
expect('Non-orphaned token not flagged', validResult.isOrphaned === false);
expect('Non-orphaned token does not self-invalidate', validResult.selfInvalidate === false);

const expiredCandidate: OrphanedTokenCandidate = { ...orphanCandidate, gateRecordMissing: false, now: '2026-06-08T01:00:00.000Z' };
const expiredResult = detectOrphanedToken(expiredCandidate);
expect('Expired token detected as orphaned', expiredResult.isOrphaned === true);
expect('Expired token mid-flow reason present', expiredResult.blockedReasons.includes('F009_PHASE5D_TOKEN_EXPIRED_MID_FLOW'));

expect('Malformed orphan candidate default-denies to orphaned', detectOrphanedToken({ ...orphanCandidate, tokenId: '' }).isOrphaned === true);
expect('Null candidate default-denies to orphaned + self-invalidate', detectOrphanedToken(null).selfInvalidate === true);

// ── Token / gate cross-state partial failure ─────────────────────────────────
const tokenInjectedGateFailed: TokenGateCrossStateInput = {
  _kind: 'f009_phase5d_token_gate_cross_state_input',
  tokenInjected: true, tokenValid: true, tokenExpiredMidFlow: false,
  gateUpdateAttempted: true, gateUpdateSucceeded: false,
};
const cs1 = evaluateTokenGateCrossState(tokenInjectedGateFailed);
expect('Token injected, gate update failed → BLOCKED', cs1.blocked === true);
expect('Token injected, gate update failed → invalidate token', cs1.invalidateToken === true);
expect('Token injected, gate update failed → reason present', cs1.blockedReasons.includes('F009_PHASE5D_TOKEN_INJECTED_GATE_UPDATE_FAILED'));

const gateUpdatedTokenInvalid: TokenGateCrossStateInput = {
  _kind: 'f009_phase5d_token_gate_cross_state_input',
  tokenInjected: true, tokenValid: false, tokenExpiredMidFlow: false,
  gateUpdateAttempted: true, gateUpdateSucceeded: true,
};
const cs2 = evaluateTokenGateCrossState(gateUpdatedTokenInvalid);
expect('Gate updated, token invalid → BLOCKED', cs2.blocked === true);
expect('Gate updated, token invalid → reason present', cs2.blockedReasons.includes('F009_PHASE5D_GATE_UPDATED_TOKEN_INVALID'));

const expiredMidFlow: TokenGateCrossStateInput = {
  _kind: 'f009_phase5d_token_gate_cross_state_input',
  tokenInjected: true, tokenValid: true, tokenExpiredMidFlow: true,
  gateUpdateAttempted: true, gateUpdateSucceeded: true,
};
const cs3 = evaluateTokenGateCrossState(expiredMidFlow);
expect('Token expires mid-flow → BLOCKED', cs3.blocked === true);
expect('Token expires mid-flow → reason present', cs3.blockedReasons.includes('F009_PHASE5D_TOKEN_EXPIRED_MID_FLOW'));

const consistent: TokenGateCrossStateInput = {
  _kind: 'f009_phase5d_token_gate_cross_state_input',
  tokenInjected: true, tokenValid: true, tokenExpiredMidFlow: false,
  gateUpdateAttempted: true, gateUpdateSucceeded: true,
};
const cs4 = evaluateTokenGateCrossState(consistent);
expect('Consistent state not blocked', cs4.blocked === false);
expect('Consistent state outcome CONSISTENT', cs4.outcome === 'CONSISTENT');

expect('Cross-state: every non-consistent fails closed', [cs1, cs2, cs3].every((r) => r.blockedReasons.includes('F009_PHASE5D_PARTIAL_FAILURE_FAIL_CLOSED') || r.blocked === true));
expect('Cross-state: malformed default-denies', evaluateTokenGateCrossState(null).blocked === true);

// ── Manual approval granted but deploy fails → DEPLOYMENT_ABORTED ────────────
const abortInput: DeploymentAbortScenarioInput = {
  _kind: 'f009_phase5d_deployment_abort_scenario_input',
  manualApprovalGranted: true, approvalId: 'appr-1', deploymentSucceeded: false,
  deploymentId: 'deploy-1', operatorId: 'op-1', auditTrailId: 'audit-1',
};
const abortResult = evaluateDeploymentAbortScenario(abortInput);
expect('Manual approval granted but deploy fails → ABORTED', abortResult.aborted === true);
expect('DEPLOYMENT_ABORTED reason present', abortResult.blockedReasons.includes('F009_PHASE5D_DEPLOYMENT_ABORTED'));

const succeeded: DeploymentAbortScenarioInput = { ...abortInput, deploymentSucceeded: true };
expect('Manual approval granted and deploy succeeds → not aborted', evaluateDeploymentAbortScenario(succeeded).aborted === false);

const noApproval: DeploymentAbortScenarioInput = { ...abortInput, manualApprovalGranted: false };
expect('No manual approval → treated as aborted (fail closed)', evaluateDeploymentAbortScenario(noApproval).aborted === true);
expect('Malformed abort scenario default-denies to aborted', evaluateDeploymentAbortScenario(null).aborted === true);

// ── DEPLOYMENT_ABORTED audit payload completeness ────────────────────────────
const abortPayload = buildDeploymentAbortedAuditPayload({
  deploymentId: 'deploy-1', operatorId: 'op-1', approvalId: 'appr-1',
  auditTrailId: 'audit-1', reason: 'deployment job exited non-zero', occurredAt: '2026-06-08T00:00:00.000Z',
});
expect('DEPLOYMENT_ABORTED payload eventType correct', abortPayload.eventType === 'DEPLOYMENT_ABORTED');
expect('DEPLOYMENT_ABORTED payload has deploymentId', abortPayload.deploymentId === 'deploy-1');
expect('DEPLOYMENT_ABORTED payload has operatorId', abortPayload.operatorId === 'op-1');
expect('DEPLOYMENT_ABORTED payload has approvalId', abortPayload.approvalId === 'appr-1');
expect('DEPLOYMENT_ABORTED payload has auditTrailId', abortPayload.auditTrailId === 'audit-1');
expect('DEPLOYMENT_ABORTED payload has reason', typeof abortPayload.reason === 'string' && abortPayload.reason.length > 0);
expect('DEPLOYMENT_ABORTED payload has occurredAt', typeof abortPayload.occurredAt === 'string');
expect('DEPLOYMENT_ABORTED payload requires fresh approval for retry', abortPayload.requiresFreshApprovalForRetry === true);
expect('DEPLOYMENT_ABORTED payload non-executable', abortPayload.executable === false);

// ── Retry without fresh manual approval ──────────────────────────────────────
const retryReused: RetryAttemptInput = {
  _kind: 'f009_phase5d_retry_attempt_input',
  isRetry: true, freshApprovalRequiredForScope: true,
  previousApprovalId: 'appr-1', currentApprovalId: 'appr-1', freshApprovalGranted: false,
};
const retryResult = evaluateRetryRequiresFreshApproval(retryReused);
expect('Retry reusing approval BLOCKED when scoped', retryResult.allowed === false);
expect('Retry reuse reason present', retryResult.blockedReasons.includes('F009_PHASE5D_RETRY_WITHOUT_FRESH_APPROVAL_BLOCKED'));

const retryFresh: RetryAttemptInput = { ...retryReused, currentApprovalId: 'appr-2', freshApprovalGranted: true };
expect('Retry with genuinely fresh approval allowed', evaluateRetryRequiresFreshApproval(retryFresh).allowed === true);

const retryNotScoped: RetryAttemptInput = { ...retryReused, freshApprovalRequiredForScope: false };
expect('Retry not scoped to require fresh approval allowed', evaluateRetryRequiresFreshApproval(retryNotScoped).allowed === true);

const notRetry: RetryAttemptInput = { ...retryReused, isRetry: false };
expect('Non-retry attempt allowed (not evaluated as retry)', evaluateRetryRequiresFreshApproval(notRetry).allowed === true);

expect('Malformed retry input default-denies', evaluateRetryRequiresFreshApproval(null).allowed === false);

// ── GATE_AUTO_INVALIDATE — stale gate ────────────────────────────────────────
const staleGate: GateStalenessInput = {
  _kind: 'f009_phase5d_gate_staleness_input',
  gateCreatedAt: '2026-06-08T00:00:00.000Z',
  now: '2026-06-08T00:45:00.000Z',
  reachedEnabled: false,
};
const staleResult = evaluateGateStaleness(staleGate);
expect('Stale gate (>30min, not ENABLED) auto-invalidates', staleResult.autoInvalidate === true);
expect('GATE_AUTO_INVALIDATE reason present', staleResult.blockedReasons.includes('F009_PHASE5D_GATE_AUTO_INVALIDATE'));
expect('GATE_STALE reason present', staleResult.blockedReasons.includes('F009_PHASE5D_GATE_STALE'));

const freshGate: GateStalenessInput = { ...staleGate, now: '2026-06-08T00:10:00.000Z' };
expect('Fresh gate (<30min) does not auto-invalidate', evaluateGateStaleness(freshGate).autoInvalidate === false);

const enabledGate: GateStalenessInput = { ...staleGate, reachedEnabled: true };
expect('Gate that reached ENABLED does not auto-invalidate regardless of age', evaluateGateStaleness(enabledGate).autoInvalidate === false);

expect('Malformed gate staleness input default-denies to auto-invalidate', evaluateGateStaleness(null).autoInvalidate === true);

// ── GATE_AUTO_INVALIDATE audit payload completeness ──────────────────────────
const gateAutoPayload = buildGateAutoInvalidateAuditPayload({
  gateId: 'gate-1', tenantId: 'tenant-1', auditTrailId: 'audit-1',
  gateCreatedAt: '2026-06-08T00:00:00.000Z', invalidatedAt: '2026-06-08T00:45:00.000Z',
  reason: 'gate did not reach ENABLED within 30 minutes',
});
expect('GATE_AUTO_INVALIDATE payload eventType correct', gateAutoPayload.eventType === 'GATE_AUTO_INVALIDATE');
expect('GATE_AUTO_INVALIDATE payload has gateId', gateAutoPayload.gateId === 'gate-1');
expect('GATE_AUTO_INVALIDATE payload has tenantId', gateAutoPayload.tenantId === 'tenant-1');
expect('GATE_AUTO_INVALIDATE payload has auditTrailId', gateAutoPayload.auditTrailId === 'audit-1');
expect('GATE_AUTO_INVALIDATE payload has gateCreatedAt', typeof gateAutoPayload.gateCreatedAt === 'string');
expect('GATE_AUTO_INVALIDATE payload has invalidatedAt', typeof gateAutoPayload.invalidatedAt === 'string');
expect('GATE_AUTO_INVALIDATE payload has reason', gateAutoPayload.reason.length > 0);
expect('GATE_AUTO_INVALIDATE payload failedClosed true', gateAutoPayload.failedClosed === true);
expect('GATE_AUTO_INVALIDATE payload non-executable', gateAutoPayload.executable === false);

// ── SELF_INVALIDATE audit payload completeness ───────────────────────────────
const selfInvalidatePayload = buildSelfInvalidateAuditPayload({
  tokenId: 'tok-1', auditTrailId: 'audit-1',
  detectedAt: '2026-06-08T00:05:00.000Z', reason: 'gate record missing for injected token',
});
expect('SELF_INVALIDATE payload eventType correct', selfInvalidatePayload.eventType === 'SELF_INVALIDATE');
expect('SELF_INVALIDATE payload has tokenId', selfInvalidatePayload.tokenId === 'tok-1');
expect('SELF_INVALIDATE payload has auditTrailId', selfInvalidatePayload.auditTrailId === 'audit-1');
expect('SELF_INVALIDATE payload has detectedAt', typeof selfInvalidatePayload.detectedAt === 'string');
expect('SELF_INVALIDATE payload has reason', selfInvalidatePayload.reason.length > 0);
expect('SELF_INVALIDATE payload tokenRemainsUsable always false', selfInvalidatePayload.tokenRemainsUsable === false);
expect('SELF_INVALIDATE payload non-executable', selfInvalidatePayload.executable === false);

// ── No production write path ─────────────────────────────────────────────────
expect('No production write path: all results are non-executable', [r1, r2, r3, orphanResult, cs1, abortResult, retryResult, staleResult].every((r) => (r as { executable?: boolean }).executable === false));
expect('No production write path: all results forbid AI execution', [r1, r2, r3, orphanResult, cs1, abortResult, retryResult, staleResult].every((r) => (r as { aiCanExecute?: boolean }).aiCanExecute === false));

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5D Deployment Gate Recovery (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
