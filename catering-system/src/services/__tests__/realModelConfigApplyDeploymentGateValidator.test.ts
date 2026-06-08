/**
 * Feature 009 Phase 5C: Deployment Gate Validator tests
 * Pure runner — no test framework. npx tsx from repo root.
 */
import {
  validateDeploymentToken,
  evaluateSecurityCoordinatorConsistency,
  evaluateDevelopmentFallback,
  buildDeploymentGateAuditPayload,
  evaluateDeploymentGateAuditPayloadCompleteness,
  evaluateHardenedDeploymentGate,
  buildDeploymentGateBlockedEventPayload,
} from '../realModelConfigApplyDeploymentGateValidator';
import type {
  DeploymentTokenContract,
  DeploymentTokenExpectation,
  DeploymentGateLifecycleRecord,
  CiTokenInjectionLifecycle,
  DevelopmentFallbackContext,
} from '../realModelConfigApplyDeploymentGateValidator';
import type { TenantId } from '../../types/aiBoundary';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5C: Deployment Gate Validator ===\n');

const now = '2026-06-08T12:00:00Z';
const tenantId = 'tenant-5c' as TenantId;

const expectation: DeploymentTokenExpectation = {
  expectedProjectId: 'umas-booking-manager',
  expectedEnvironment: 'production',
  expectedHmacSignatureHex: 'deadbeef00112233',
  expectedKmsKeyId: 'kms-key-1',
  now,
};

const validToken: DeploymentTokenContract = {
  _kind: 'f009_phase5c_deployment_token_contract',
  executable: false,
  present: true,
  tokenId: 'token-1',
  projectId: 'umas-booking-manager',
  environment: 'production',
  issuedAt: '2026-06-08T11:55:00Z',
  staleAfterSeconds: 600,
  hmacSignatureHex: 'deadbeef00112233',
  kmsKeyId: 'kms-key-1',
  kmsVerificationStatus: 'VERIFIED',
  injectedByCi: true,
  localBypassAttempted: false,
  ciBypassAttempted: false,
};

console.log('[Deployment Token]\n');

const t1 = validateDeploymentToken(validToken, expectation);
expect('valid deployment token passes', t1.passed === true);

const t2 = validateDeploymentToken(null, expectation);
expect('missing deployment token BLOCKED', t2.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_MISSING'));

const t3 = validateDeploymentToken({ ...validToken, issuedAt: '2026-06-08T11:00:00Z' }, expectation);
expect('stale deployment token BLOCKED', t3.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_STALE'));

const t4 = validateDeploymentToken({ ...validToken, hmacSignatureHex: 'not-hex!!' }, expectation);
expect('malformed deployment token BLOCKED', t4.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_MALFORMED'));

const t5 = validateDeploymentToken({ ...validToken, hmacSignatureHex: 'aaaaaaaaaaaaaaaa' }, expectation);
expect('invalid HMAC BLOCKED', t5.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_INVALID_HMAC'));

const t6 = validateDeploymentToken({ ...validToken, kmsVerificationStatus: 'MISMATCH' }, expectation);
expect('KMS mismatch BLOCKED', t6.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_KMS_MISMATCH'));

const t7 = validateDeploymentToken({ ...validToken, projectId: 'wrong-project' }, expectation);
expect('wrong project ID BLOCKED', t7.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_PROJECT'));

const t8 = validateDeploymentToken({ ...validToken, environment: 'staging' }, expectation);
expect('wrong environment BLOCKED', t8.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_ENVIRONMENT'));

const t9 = validateDeploymentToken({ ...validToken, localBypassAttempted: true }, expectation);
expect('local bypass BLOCKED', t9.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_LOCAL_BYPASS_BLOCKED'));

const t10 = validateDeploymentToken({ ...validToken, injectedByCi: false }, expectation);
expect('not injected by CI treated as local bypass BLOCKED', t10.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_LOCAL_BYPASS_BLOCKED'));

const t11 = validateDeploymentToken({ ...validToken, ciBypassAttempted: true }, expectation);
expect('CI bypass BLOCKED', t11.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_CI_BYPASS_BLOCKED'));

console.log('\n[SecurityCoordinator]\n');

const activeGate: DeploymentGateLifecycleRecord = {
  _kind: 'f009_phase5c_deployment_gate_lifecycle_record',
  present: true,
  state: 'ACTIVE',
  authorizingTokenId: 'token-1',
  projectId: 'umas-booking-manager',
  environment: 'production',
  lastUpdatedAt: now,
  lastUpdateFailed: false,
};

const okLifecycle: CiTokenInjectionLifecycle = {
  _kind: 'f009_phase5c_ci_token_injection_lifecycle',
  executable: false,
  phase: 'GATE_UPDATE_SUCCEEDED',
  pipelineRunId: 'run-1',
  tokenId: 'token-1',
  gateUpdateAttempted: true,
  gateUpdateSucceeded: true,
  networkPartialFailureObserved: false,
  observedAt: now,
};

const sc1 = evaluateSecurityCoordinatorConsistency({
  token: validToken, tokenExpectation: expectation, gate: activeGate, ciLifecycle: okLifecycle,
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('valid token passes only with all other gates (consistent)', sc1.consistent === true);

const sc2 = evaluateSecurityCoordinatorConsistency({
  token: validToken, tokenExpectation: expectation, gate: null, ciLifecycle: okLifecycle,
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('missing deployment gate BLOCKED', sc2.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_GATE_MISSING'));

const sc3 = evaluateSecurityCoordinatorConsistency({
  token: validToken, tokenExpectation: expectation,
  gate: { ...activeGate, state: 'NOT_CREATED', authorizingTokenId: null },
  ciLifecycle: { ...okLifecycle, phase: 'TOKEN_INJECTED' },
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('token injected but Firestore gate missing BLOCKED', sc3.blockedReasons.includes('F009_PHASE5C_TOKEN_INJECTED_GATE_MISSING'));

const invalidToken: DeploymentTokenContract = { ...validToken, kmsVerificationStatus: 'MISMATCH' };
const sc4 = evaluateSecurityCoordinatorConsistency({
  token: invalidToken, tokenExpectation: expectation, gate: activeGate, ciLifecycle: okLifecycle,
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('Firestore gate updated but token invalid BLOCKED', sc4.blockedReasons.includes('F009_PHASE5C_GATE_UPDATED_TOKEN_INVALID'));

const sc5 = evaluateSecurityCoordinatorConsistency({
  token: validToken, tokenExpectation: expectation,
  gate: { ...activeGate, state: 'UPDATE_FAILED', lastUpdateFailed: true, authorizingTokenId: 'token-1' },
  ciLifecycle: { ...okLifecycle, phase: 'GATE_UPDATE_FAILED', tokenId: 'token-1', gateUpdateSucceeded: false },
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('token injected but gate update failed BLOCKED / token invalidated', sc5.blockedReasons.includes('F009_PHASE5C_TOKEN_INJECTED_GATE_UPDATE_FAILED'));

const sc6 = evaluateSecurityCoordinatorConsistency({
  token: validToken, tokenExpectation: expectation, gate: activeGate,
  ciLifecycle: { ...okLifecycle, phase: 'NETWORK_PARTIAL_FAILURE', networkPartialFailureObserved: true },
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('network / partial failure modeled and BLOCKED', sc6.blockedReasons.includes('F009_PHASE5C_NETWORK_PARTIAL_FAILURE'));

const sc7 = evaluateSecurityCoordinatorConsistency({
  token: { ...validToken, projectId: 'wrong-project' }, tokenExpectation: { ...expectation, expectedProjectId: 'wrong-project' },
  gate: { ...activeGate, projectId: 'other-project' }, ciLifecycle: okLifecycle,
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('wrong project ID BLOCKED via coordinator', sc7.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_PROJECT'));

const sc8 = evaluateSecurityCoordinatorConsistency({
  token: validToken, tokenExpectation: expectation, gate: { ...activeGate, environment: 'staging' }, ciLifecycle: okLifecycle,
  expectedEnvironment: 'production', expectedProjectId: 'umas-booking-manager',
});
expect('wrong environment BLOCKED via coordinator', sc8.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_ENVIRONMENT'));

console.log('\n[Development Fallback]\n');

const devCtx: DevelopmentFallbackContext = {
  _kind: 'f009_phase5c_development_fallback_context',
  isDevelopmentContext: true,
  attemptedProductionWritePath: true,
  resolvedEnvironment: 'production',
};
const f1 = evaluateDevelopmentFallback(devCtx);
expect('dev fallback attempting production write path BLOCKED', f1.blockedReasons.includes('F009_PHASE5C_DEV_FALLBACK_PRODUCTION_PATH_BLOCKED'));
expect('dev fallback never creates a production write path (invariant)', f1.createsProductionWritePath === false);

const f2 = evaluateDevelopmentFallback(null);
expect('missing dev fallback context default-denies', f2.blockedReasons.includes('F009_PHASE5C_UNKNOWN_ENVIRONMENT_DEFAULT_DENY'));

console.log('\n[Audit Payload]\n');

const auditPayload = buildDeploymentGateAuditPayload({
  tenantId, pipelineRunId: 'run-1', token: validToken, tokenResult: t1, gate: activeGate,
  coordinatorResult: sc1, ciLifecycle: okLifecycle, evaluatedAt: now, auditTrailId: 'audit-gate-1',
});
expect('deployment gate audit payload complete', evaluateDeploymentGateAuditPayloadCompleteness(auditPayload).passed === true);
expect('deployment gate audit payload is non-executable', auditPayload.executable === false);

const incompletePayload = { ...auditPayload, pipelineRunId: '' };
expect('incomplete audit payload BLOCKED', evaluateDeploymentGateAuditPayloadCompleteness(incompletePayload).passed === false);

console.log('\n[Composed Hardened Evaluation]\n');

const composed1 = evaluateHardenedDeploymentGate({
  tenantId, pipelineRunId: 'run-1', token: validToken, tokenExpectation: expectation, gate: activeGate,
  ciLifecycle: okLifecycle, developmentFallback: { _kind: 'f009_phase5c_development_fallback_context', isDevelopmentContext: false, attemptedProductionWritePath: false, resolvedEnvironment: 'production' },
  expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production', evaluatedAt: now, auditTrailId: 'audit-gate-2',
});
expect('composed hardened evaluation passes when everything aligns', composed1.passed === true);
expect('composed evaluation is non-executable', composed1.executable === false);

const composed2 = evaluateHardenedDeploymentGate({
  tenantId, pipelineRunId: 'run-1', token: null, tokenExpectation: expectation, gate: null, ciLifecycle: null,
  developmentFallback: null, expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production', evaluatedAt: now, auditTrailId: 'audit-gate-3',
});
expect('composed evaluation BLOCKED when everything missing', composed2.passed === false);
expect('composed evaluation BLOCKED includes missing token', composed2.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_TOKEN_MISSING'));
expect('composed evaluation BLOCKED includes missing gate', composed2.blockedReasons.includes('F009_PHASE5C_DEPLOYMENT_GATE_MISSING'));

const blockedEvent = buildDeploymentGateBlockedEventPayload({
  blockedReasons: composed2.blockedReasons, auditPayload: composed2.auditPayload, blockedAt: now,
});
expect('deployment gate blocked event payload complete', blockedEvent.blockedReasons.length > 0 && !!blockedEvent.auditPayload);
expect('deployment gate blocked event payload non-executable / aiCanExecute false', blockedEvent.executable === false && blockedEvent.aiCanExecute === false);

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5C Deployment Gate Validator (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
