import {
  buildSecurityAlertPayload,
  buildDeploymentGateFailureAlert,
  buildObservationConcurrencyAlert,
  type SecurityAlertPayloadInput,
} from '../securityAudit';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5D: Security Audit Helpers ---');

const fullInput: SecurityAlertPayloadInput = {
  deploymentId: 'deploy-1',
  operatorId: 'op-1',
  systemState: 'DEPLOYMENT_GATE_PARTIAL_FAILURE',
  errorType: 'TOKEN_INJECTED_GATE_UPDATE_FAILED',
  auditTrailId: 'audit-1',
  occurredAt: 1749340800000,
  tenantId: 'tenant-1',
  gateState: 'UPDATE_FAILED',
  observationModeVersion: 3,
};

const built = buildSecurityAlertPayload(fullInput);
expect('Full payload builds ok', built.ok === true);
expect('Full payload not null', built.payload !== null);
expect('Full payload deploymentId correct', built.payload?.deploymentId === 'deploy-1');
expect('Full payload operatorId correct', built.payload?.operatorId === 'op-1');
expect('Full payload systemState correct', built.payload?.systemState === 'DEPLOYMENT_GATE_PARTIAL_FAILURE');
expect('Full payload errorType correct', built.payload?.errorType === 'TOKEN_INJECTED_GATE_UPDATE_FAILED');
expect('Full payload auditTrailId correct', built.payload?.auditTrailId === 'audit-1');
expect('Full payload occurredAt correct', built.payload?.occurredAt === 1749340800000);
expect('Full payload tenantId correct (optional present)', built.payload?.tenantId === 'tenant-1');
expect('Full payload gateState correct (optional present)', built.payload?.gateState === 'UPDATE_FAILED');
expect('Full payload observationModeVersion correct (optional present)', built.payload?.observationModeVersion === 3);
expect('Full payload non-executable', built.payload?.executable === false);
expect('Full payload _kind correct', built.payload?._kind === 'f009_phase5d_security_alert_payload');

// ── Minimal payload (optional fields absent) ─────────────────────────────────
const minimalInput: SecurityAlertPayloadInput = {
  deploymentId: 'deploy-2', operatorId: 'op-2', systemState: 'X', errorType: 'Y',
  auditTrailId: 'audit-2', occurredAt: 1,
};
const minimalBuilt = buildSecurityAlertPayload(minimalInput);
expect('Minimal payload builds ok', minimalBuilt.ok === true);
expect('Minimal payload optional fields undefined', minimalBuilt.payload?.tenantId === undefined && minimalBuilt.payload?.gateState === undefined);

// ── Default-deny on missing required fields ──────────────────────────────────
expect('Null input → not ok, default-deny', buildSecurityAlertPayload(null).ok === false);
expect('Missing deploymentId → blocked', buildSecurityAlertPayload({ ...fullInput, deploymentId: '' }).blockedReasons.includes('F009_PHASE5D_MISSING_DEPLOYMENT_ID'));
expect('Missing operatorId → blocked', buildSecurityAlertPayload({ ...fullInput, operatorId: '' }).blockedReasons.includes('F009_PHASE5D_MISSING_OPERATOR_ID'));
expect('Missing auditTrailId → blocked', buildSecurityAlertPayload({ ...fullInput, auditTrailId: '' }).blockedReasons.includes('F009_PHASE5D_MISSING_AUDIT_TRAIL_ID'));
expect('Invalid occurredAt → blocked, no payload', buildSecurityAlertPayload({ ...fullInput, occurredAt: NaN }).payload === null);
expect('Missing required field never produces partial payload', buildSecurityAlertPayload({ ...fullInput, deploymentId: '' }).payload === null);

// ── Convenience builders ──────────────────────────────────────────────────────
const gateAlert = buildDeploymentGateFailureAlert({
  deploymentId: 'deploy-3', operatorId: 'op-3', auditTrailId: 'audit-3',
  occurredAt: 100, errorType: 'GATE_AUTO_INVALIDATE', gateState: 'STALE', tenantId: 'tenant-3',
});
expect('Deployment gate failure alert builds ok', gateAlert.ok === true);
expect('Deployment gate failure alert systemState set', gateAlert.payload?.systemState === 'DEPLOYMENT_GATE_PARTIAL_FAILURE');
expect('Deployment gate failure alert gateState propagated', gateAlert.payload?.gateState === 'STALE');

const concurrencyAlert = buildObservationConcurrencyAlert({
  deploymentId: 'deploy-4', operatorId: 'op-4', auditTrailId: 'audit-4',
  occurredAt: 200, errorType: 'CONCURRENCY_VIOLATION', observationModeVersion: 7, tenantId: 'tenant-4',
});
expect('Observation concurrency alert builds ok', concurrencyAlert.ok === true);
expect('Observation concurrency alert systemState set', concurrencyAlert.payload?.systemState === 'OBSERVATION_MODE_CONCURRENCY_VIOLATION');
expect('Observation concurrency alert version propagated', concurrencyAlert.payload?.observationModeVersion === 7);

// ── Non-executable / non-AI-executable invariants ────────────────────────────
expect('Build result non-executable', built.executable === false);
expect('Build result aiCanExecute false', built.aiCanExecute === false);

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5D Security Audit (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
