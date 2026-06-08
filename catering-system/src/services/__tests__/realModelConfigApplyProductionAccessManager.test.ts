/**
 * Feature 009 Phase 5B: Production Access Manager tests
 * Pure runner — no test framework. npx tsx from repo root.
 *
 * Covers the SSOT "Required Tests" list for the top-level access manager:
 * production disabled-by-default, unknown environment, missing gate config,
 * missing deployment gate, production-disabled flag, missing tenant/operator
 * allowlist, missing operator confirmation, kill switch ON/missing/OFF+valid,
 * AI / Service Account / Admin SDK callers.
 */
import { evaluateProductionAccess } from '../realModelConfigApplyProductionAccessManager';
import type {
  ProductionGateConfig, ProductionAccessManagerInput,
} from '../realModelConfigApplyProductionAccessManager';
import type {
  DeploymentPipelineGate, KillSwitchRecord, EmergencyDisableContract,
} from '../realModelConfigApplyProductionGateService';
import type {
  TenantAllowlist, OperatorAllowlist, OperatorConfirmation, OperatorConfirmationExpectation,
} from '../realModelConfigApplyOperatorConfirmationService';
import type { TenantId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId, asConfigVersion, asDiffHash, asApplyToken,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5B: Production Access Manager ===\n');

const tenantId = 'tenant-5b' as TenantId;
const operatorUserId = 'operator-1';
const approvalId = asModelConfigApprovalId('approval-5b');
const applyToken = asApplyToken('token-5b');
const v1 = asConfigVersion('v1');
const hashBefore = asDiffHash('hash-before');
const hashAfter = asDiffHash('hash-after');
const hashDiff = asDiffHash('hash-diff');
const now = '2026-06-08T12:00:00Z';

const validGate: DeploymentPipelineGate = {
  _kind: 'f009_phase5b_deployment_pipeline_gate',
  present: true,
  projectId: 'umas-booking-manager',
  environment: 'production',
  approvedForProductionRollout: true,
};

const offKillSwitch: KillSwitchRecord = {
  _kind: 'f009_phase5b_kill_switch_record',
  present: true,
  state: 'OFF',
  scope: { kind: 'global' },
  lastUpdatedAt: '2026-06-08T11:00:00Z',
  staleAfterSeconds: 86400,
};

const inactiveEmergencyDisable: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract',
  executable: false,
  active: false,
  disabledBy: '',
  reason: '',
  disabledAt: '',
  auditTrailId: '',
};

const tenantAllowlist: TenantAllowlist = {
  _kind: 'f009_phase5b_tenant_allowlist',
  present: true,
  loadedSuccessfully: true,
  tenantIds: [tenantId],
};

const operatorAllowlist: OperatorAllowlist = {
  _kind: 'f009_phase5b_operator_allowlist',
  present: true,
  loadedSuccessfully: true,
  operatorUserIds: [operatorUserId],
};

const confirmationExpectation: OperatorConfirmationExpectation = {
  tenantId, approvalId, applyToken,
  expectedCurrentVersion: v1,
  configBeforeHash: hashBefore,
  configAfterHash: hashAfter,
  diffHash: hashDiff,
  operatorUserId,
};

const validConfirmation: OperatorConfirmation = {
  _kind: 'f009_phase5b_operator_confirmation',
  tenantId, approvalId, applyToken,
  expectedCurrentVersion: v1,
  configBeforeHash: hashBefore,
  configAfterHash: hashAfter,
  diffHash: hashDiff,
  operatorUserId,
  timestamp: now,
};

const fullyValidConfig: ProductionGateConfig = {
  _kind: 'f009_phase5b_production_gate_config',
  present: true,
  productionEnabled: true,
  expectedProjectId: 'umas-booking-manager',
  expectedEnvironment: 'production',
  deploymentGate: validGate,
  killSwitch: offKillSwitch,
  emergencyDisable: inactiveEmergencyDisable,
  tenantAllowlist,
  operatorAllowlist,
};

function baseInput(overrides: Partial<ProductionAccessManagerInput> = {}): ProductionAccessManagerInput {
  return {
    config: fullyValidConfig,
    resolvedEnvironment: 'production',
    now,
    tenantId,
    operatorUserId,
    callerContext: { callerType: 'HUMAN', callerUserId: operatorUserId },
    operatorConfirmation: validConfirmation,
    confirmationExpectation,
    ...overrides,
  };
}

console.log('[All gates valid]\n');
const allValid = evaluateProductionAccess(baseInput());
expect('all gates valid + kill switch OFF → access granted', allValid.accessGranted === true);
expect('all gates valid → no blocked reasons', allValid.blockedReasons.length === 0);

console.log('\n[Production disabled by default]\n');
const disabledByDefault = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, productionEnabled: false },
}));
expect('production disabled flag → BLOCKED', disabledByDefault.blockedReasons.includes('F009_PHASE5B_PRODUCTION_DISABLED'));
expect('production disabled flag → access denied', disabledByDefault.accessGranted === false);

// "disabled by default": a config that simply omits productionEnabled=true must deny
const omittedFlag = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, productionEnabled: undefined as unknown as boolean },
}));
expect('production-enabled omitted → disabled-by-default BLOCKED', omittedFlag.blockedReasons.includes('F009_PHASE5B_PRODUCTION_DISABLED'));

console.log('\n[Unknown environment]\n');
const unknownEnv = evaluateProductionAccess(baseInput({ resolvedEnvironment: 'unknown' }));
expect('unknown environment → default-deny BLOCKED', unknownEnv.blockedReasons.includes('F009_PHASE5B_UNKNOWN_ENVIRONMENT_DEFAULT_DENY'));
expect('unknown environment → access denied', unknownEnv.accessGranted === false);

console.log('\n[Missing gate config]\n');
const missingConfig = evaluateProductionAccess(baseInput({ config: null }));
expect('missing gate config → BLOCKED', missingConfig.blockedReasons.includes('F009_PHASE5B_GATE_CONFIG_MISSING'));
expect('missing gate config → access denied', missingConfig.accessGranted === false);

const presentFalseConfig = evaluateProductionAccess(baseInput({ config: { ...fullyValidConfig, present: false } }));
expect('gate config present=false → BLOCKED', presentFalseConfig.blockedReasons.includes('F009_PHASE5B_GATE_CONFIG_MISSING'));

console.log('\n[Missing deployment gate]\n');
const missingDeploymentGate = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, deploymentGate: null },
}));
expect('missing deployment gate → BLOCKED', missingDeploymentGate.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_MISSING'));
expect('missing deployment gate → access denied', missingDeploymentGate.accessGranted === false);

const wrongProjectGate = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, deploymentGate: { ...validGate, projectId: 'wrong-project' } },
}));
expect('deployment gate wrong project id → BLOCKED', wrongProjectGate.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_WRONG_PROJECT'));

console.log('\n[Kill switch]\n');
const killOn = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, killSwitch: { ...offKillSwitch, state: 'ON' } },
}));
expect('kill switch ON → BLOCKED', killOn.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_ON'));
expect('kill switch ON → access denied', killOn.accessGranted === false);

const killMissing = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, killSwitch: null },
}));
expect('kill switch missing → BLOCKED', killMissing.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_MISSING'));

const killOffValid = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, killSwitch: offKillSwitch },
}));
expect('kill switch OFF + all gates valid → access granted', killOffValid.accessGranted === true);

console.log('\n[Emergency disable]\n');
const emergencyActive: EmergencyDisableContract = {
  _kind: 'f009_phase5b_emergency_disable_contract',
  executable: false,
  active: true,
  disabledBy: 'admin-x',
  reason: 'incident',
  disabledAt: now,
  auditTrailId: 'audit-emerg-1',
};
const emergencyBlocked = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, emergencyDisable: emergencyActive },
}));
expect('active emergency disable → BLOCKS future apply', emergencyBlocked.blockedReasons.includes('F009_PHASE5B_EMERGENCY_DISABLE_ACTIVE'));
expect('active emergency disable → access denied', emergencyBlocked.accessGranted === false);

console.log('\n[Tenant allowlist]\n');
const tenantAllowlisted = evaluateProductionAccess(baseInput());
expect('tenant allowlisted → no tenant-allowlist block', !tenantAllowlisted.blockedReasons.some(r => r.startsWith('F009_PHASE5B_TENANT')));

const tenantNotAllowlisted = evaluateProductionAccess(baseInput({ tenantId: 'tenant-other' as TenantId }));
expect('tenant not allowlisted → BLOCKED', tenantNotAllowlisted.blockedReasons.includes('F009_PHASE5B_TENANT_NOT_ALLOWLISTED'));

const missingTenantAllowlist = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, tenantAllowlist: null },
}));
expect('missing tenant allowlist → BLOCKED', missingTenantAllowlist.blockedReasons.includes('F009_PHASE5B_TENANT_ALLOWLIST_MISSING'));
expect('missing tenant allowlist → access denied', missingTenantAllowlist.accessGranted === false);

console.log('\n[Operator allowlist]\n');
const operatorAllowlisted = evaluateProductionAccess(baseInput());
expect('operator allowlisted → no operator-allowlist block', !operatorAllowlisted.blockedReasons.some(r => r.startsWith('F009_PHASE5B_OPERATOR_ALLOWLIST') || r === 'F009_PHASE5B_OPERATOR_NOT_ALLOWLISTED'));

const operatorNotAllowlisted = evaluateProductionAccess(baseInput({ operatorUserId: 'operator-stranger' }));
expect('operator not allowlisted → BLOCKED', operatorNotAllowlisted.blockedReasons.includes('F009_PHASE5B_OPERATOR_NOT_ALLOWLISTED'));

const missingOperatorAllowlist = evaluateProductionAccess(baseInput({
  config: { ...fullyValidConfig, operatorAllowlist: null },
}));
expect('missing operator allowlist → BLOCKED', missingOperatorAllowlist.blockedReasons.includes('F009_PHASE5B_OPERATOR_ALLOWLIST_MISSING'));
expect('missing operator allowlist → access denied', missingOperatorAllowlist.accessGranted === false);

console.log('\n[Operator confirmation]\n');
const validConfirmationCase = evaluateProductionAccess(baseInput());
expect('valid operator confirmation → no confirmation block', !validConfirmationCase.blockedReasons.some(r => r.startsWith('F009_PHASE5B_CONFIRMATION') || r === 'F009_PHASE5B_OPERATOR_CONFIRMATION_MISSING' || r === 'F009_PHASE5B_OPERATOR_CONFIRMATION_MALFORMED'));

const missingConfirmation = evaluateProductionAccess(baseInput({ operatorConfirmation: null }));
expect('missing operator confirmation → BLOCKED', missingConfirmation.blockedReasons.includes('F009_PHASE5B_OPERATOR_CONFIRMATION_MISSING'));
expect('missing operator confirmation → access denied', missingConfirmation.accessGranted === false);

const malformedConfirmation = evaluateProductionAccess(baseInput({
  operatorConfirmation: { ...validConfirmation, timestamp: 'not-a-date' },
}));
expect('malformed operator confirmation → BLOCKED', malformedConfirmation.blockedReasons.includes('F009_PHASE5B_OPERATOR_CONFIRMATION_MALFORMED'));

console.log('\n[Caller hard-blocks]\n');
const aiCaller = evaluateProductionAccess(baseInput({
  callerContext: { callerType: 'AI', callerUserId: 'ai-agent' },
}));
expect('AI caller → BLOCKED', aiCaller.blockedReasons.includes('F009_PHASE5B_AI_CALLER_BLOCKED'));
expect('AI caller → access denied', aiCaller.accessGranted === false);

const serviceAccountCaller = evaluateProductionAccess(baseInput({
  callerContext: { callerType: 'SERVICE_ACCOUNT', callerUserId: 'svc-acct', isServiceAccount: true },
}));
expect('Service Account caller → BLOCKED', serviceAccountCaller.blockedReasons.includes('F009_PHASE5B_SERVICE_ACCOUNT_BYPASS_BLOCKED'));
expect('Service Account caller → access denied', serviceAccountCaller.accessGranted === false);

const adminSdkCaller = evaluateProductionAccess(baseInput({
  callerContext: { callerType: 'ADMIN_SDK', callerUserId: 'admin-sdk', isAdminSdk: true },
}));
expect('Admin SDK caller → BLOCKED', adminSdkCaller.blockedReasons.includes('F009_PHASE5B_ADMIN_SDK_BYPASS_BLOCKED'));
expect('Admin SDK caller → access denied', adminSdkCaller.accessGranted === false);

const humanFlaggedAsServiceAccount = evaluateProductionAccess(baseInput({
  callerContext: { callerType: 'HUMAN', callerUserId: operatorUserId, isServiceAccount: true },
}));
expect('HUMAN callerType + isServiceAccount=true → bypass attempt BLOCKED', humanFlaggedAsServiceAccount.blockedReasons.includes('F009_PHASE5B_SERVICE_ACCOUNT_BYPASS_BLOCKED'));

const humanFlaggedAsAdminSdk = evaluateProductionAccess(baseInput({
  callerContext: { callerType: 'HUMAN', callerUserId: operatorUserId, isAdminSdk: true },
}));
expect('HUMAN callerType + isAdminSdk=true → bypass attempt BLOCKED', humanFlaggedAsAdminSdk.blockedReasons.includes('F009_PHASE5B_ADMIN_SDK_BYPASS_BLOCKED'));

const unknownCaller = evaluateProductionAccess(baseInput({
  callerContext: { callerType: 'UNKNOWN', callerUserId: 'mystery' },
}));
expect('UNKNOWN callerType → default-deny BLOCKED', unknownCaller.blockedReasons.includes('F009_PHASE5B_UNKNOWN_ENVIRONMENT_DEFAULT_DENY'));
expect('UNKNOWN callerType → access denied', unknownCaller.accessGranted === false);

console.log('\n[Multiple simultaneous failures collected]\n');
const everythingMissing = evaluateProductionAccess(baseInput({
  config: null,
  resolvedEnvironment: 'unknown',
  callerContext: { callerType: 'AI', callerUserId: 'ai-agent' },
}));
expect('multiple failures → all collected (>= 3 reasons)', everythingMissing.blockedReasons.length >= 3);
expect('multiple failures → access denied', everythingMissing.accessGranted === false);
expect('multiple failures → unique reasons (no duplicates)', new Set(everythingMissing.blockedReasons).size === everythingMissing.blockedReasons.length);

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5B Production Access Manager (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
