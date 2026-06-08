/**
 * Feature 009 Phase 5B: Production Gate Service tests
 * Pure runner — no test framework. npx tsx from repo root.
 */
import {
  evaluateDeploymentPipelineGate,
  evaluateKillSwitch,
  evaluateKillSwitchResetAuditPayload,
  evaluateEmergencyDisableContract,
  buildEmergencyDisableContract,
} from '../realModelConfigApplyProductionGateService';
import type {
  DeploymentPipelineGate, KillSwitchRecord, KillSwitchResetAuditPayload,
} from '../realModelConfigApplyProductionGateService';
import type { TenantId } from '../../types/aiBoundary';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5B: Production Gate Service ===\n');

const tenantId = 'tenant-5b' as TenantId;

const validGate: DeploymentPipelineGate = {
  _kind: 'f009_phase5b_deployment_pipeline_gate',
  present: true,
  projectId: 'umas-booking-manager',
  environment: 'production',
  approvedForProductionRollout: true,
  approvedByPipelineRunId: 'run-1',
  approvedAt: '2026-06-01T00:00:00Z',
};

console.log('[Deployment Pipeline Gate]\n');

const g1 = evaluateDeploymentPipelineGate({ gate: validGate, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production' });
expect('valid deployment gate passes', g1.passed === true);

const g2 = evaluateDeploymentPipelineGate({ gate: null, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production' });
expect('missing deployment gate BLOCKED', g2.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_MISSING'));
expect('missing deployment gate → not passed', g2.passed === false);

const g3 = evaluateDeploymentPipelineGate({ gate: { ...validGate, projectId: 'wrong-project' }, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production' });
expect('wrong project id BLOCKED', g3.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_WRONG_PROJECT'));

const g4 = evaluateDeploymentPipelineGate({ gate: { ...validGate, environment: 'staging' }, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production' });
expect('wrong environment BLOCKED', g4.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_WRONG_ENVIRONMENT'));

const g5 = evaluateDeploymentPipelineGate({ gate: { ...validGate, environment: 'unknown' }, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production' });
expect('unknown environment in gate BLOCKED', g5.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_WRONG_ENVIRONMENT'));

const g6 = evaluateDeploymentPipelineGate({ gate: { ...validGate, approvedForProductionRollout: false }, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production' });
expect('not approved for production rollout BLOCKED', g6.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_MISSING'));

const g7 = evaluateDeploymentPipelineGate({ gate: { ...validGate, present: false }, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production' });
expect('present=false treated as missing', g7.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_MISSING'));

console.log('\n[Kill Switch]\n');

const now = '2026-06-08T12:00:00Z';

const offSwitch: KillSwitchRecord = {
  _kind: 'f009_phase5b_kill_switch_record',
  present: true,
  state: 'OFF',
  scope: { kind: 'global' },
  lastUpdatedAt: '2026-06-08T11:00:00Z',
  staleAfterSeconds: 86400,
};

const k1 = evaluateKillSwitch({ record: offSwitch, now });
expect('kill switch OFF + fresh passes', k1.passed === true);

const k2 = evaluateKillSwitch({ record: { ...offSwitch, state: 'ON' }, now });
expect('kill switch ON BLOCKED', k2.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_ON'));
expect('kill switch ON → not passed', k2.passed === false);

const k3 = evaluateKillSwitch({ record: null, now });
expect('kill switch missing BLOCKED', k3.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_MISSING'));

const k4 = evaluateKillSwitch({ record: { ...offSwitch, present: false }, now });
expect('kill switch present=false → missing BLOCKED', k4.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_MISSING'));

const k5 = evaluateKillSwitch({ record: { ...offSwitch, lastUpdatedAt: '2025-01-01T00:00:00Z' }, now });
expect('stale kill switch BLOCKED', k5.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_STALE'));

const k6 = evaluateKillSwitch({ record: { ...offSwitch, lastUpdatedAt: 'not-a-date' }, now });
expect('malformed lastUpdatedAt → stale BLOCKED', k6.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_STALE'));

console.log('\n[Kill Switch Reset Audit]\n');

const validReset: KillSwitchResetAuditPayload = {
  _kind: 'f009_phase5b_kill_switch_reset_audit_payload',
  scope: { kind: 'global' },
  requestedBy: 'operator-a',
  approvedBy: 'operator-b',
  previousState: 'ON',
  nextState: 'OFF',
  reason: 'incident resolved',
  timestamp: now,
  auditTrailId: 'audit-reset-1',
};

const r1 = evaluateKillSwitchResetAuditPayload(validReset);
expect('complete reset audit payload passes', r1.passed === true);
expect('complete reset audit payload → no missing fields', r1.missingFields.length === 0);

const r2 = evaluateKillSwitchResetAuditPayload(null);
expect('missing reset audit payload BLOCKED', r2.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_RESET_AUDIT_INCOMPLETE'));

for (const field of ['requestedBy', 'approvedBy', 'previousState', 'nextState', 'reason', 'timestamp', 'auditTrailId'] as const) {
  const incomplete = { ...validReset, [field]: '' };
  const rr = evaluateKillSwitchResetAuditPayload(incomplete);
  expect(`reset missing ${field} BLOCKED`, rr.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_RESET_AUDIT_INCOMPLETE') && rr.missingFields.includes(field));
}

const r3 = evaluateKillSwitchResetAuditPayload({ ...validReset, requestedBy: 'same-person', approvedBy: 'same-person' });
expect('reset two-person integrity required BLOCKED when same person', r3.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_RESET_TWO_PERSON_REQUIRED'));

const r4 = evaluateKillSwitchResetAuditPayload({ ...validReset, scope: { kind: 'tenant', tenantId } });
expect('scoped reset with valid tenant scope passes', r4.passed === true);

const r5 = evaluateKillSwitchResetAuditPayload({ ...validReset, scope: { kind: 'tenant', tenantId: '' as unknown as TenantId } });
expect('scoped reset missing tenantId BLOCKED', r5.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_RESET_AUDIT_INCOMPLETE') && r5.missingFields.includes('scope.tenantId'));

console.log('\n[Emergency Disable]\n');

const e1 = evaluateEmergencyDisableContract(null);
expect('no emergency disable contract → does not block', e1.blocksFutureApplies === false);

const contract = buildEmergencyDisableContract({
  disabledBy: 'admin-x',
  reason: 'critical bug',
  disabledAt: now,
  auditTrailId: 'audit-emerg-1',
});
expect('built emergency disable contract is non-executable', contract.executable === false);
expect('built emergency disable contract is active', contract.active === true);

const e2 = evaluateEmergencyDisableContract(contract);
expect('active emergency disable BLOCKS future applies', e2.blocksFutureApplies === true);
expect('active emergency disable → reason present', e2.blockedReasons.includes('F009_PHASE5B_EMERGENCY_DISABLE_ACTIVE'));

const e3 = evaluateEmergencyDisableContract({ ...contract, active: false });
expect('inactive emergency disable does not block', e3.blocksFutureApplies === false);

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5B Production Gate Service (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
