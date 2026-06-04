import { validateModelConfigRollbackPreflight } from '../modelConfigRollbackPreflightService';
import type { RollbackPreflightInput } from '../modelConfigRollbackPreflightService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import { asModelConfigApprovalId, asConfigVersion, asRollbackToken } from '../../types/modelConfigApply';
import type { PersistedHumanModelConfigRollbackApproval } from '../../types/modelConfigApplyExecution';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigRollbackPreflightService ===\n');

const tenantId = 'tenant-001' as TenantId;
const approvalId = asModelConfigApprovalId('rollback-approval-001');
const targetVersion = asConfigVersion('v1');
const currentVersion = asConfigVersion('v2');
const rollbackToken = asRollbackToken('rollback-token-123');
const auditTrailId = 'audit-rollback-001' as AuditTrailId;

function makeRollbackApproval(overrides: Partial<PersistedHumanModelConfigRollbackApproval> = {}): PersistedHumanModelConfigRollbackApproval {
  return {
    _kind: 'persisted_human_model_config_rollback_approval',
    approvalId,
    tenantId,
    rollbackTargetVersion: targetVersion,
    expectedCurrentVersion: currentVersion,
    approvedByHumanUserId: 'user-001',
    approvalReason: 'need to rollback',
    rollbackReason: 'config caused issues',
    approvedAt: new Date(),
    auditTrailId,
    rollbackToken,
    status: 'APPROVED',
    aiCanApprove: false,
    persisted: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<RollbackPreflightInput> = {}): RollbackPreflightInput {
  return {
    tenantId,
    callerType: 'human',
    callerUserId: 'user-001',
    rollbackApproval: makeRollbackApproval(),
    rollbackTargetVersion: targetVersion,
    expectedCurrentVersion: currentVersion,
    newVersion: currentVersion,
    rollbackToken,
    auditTrailId,
    rollbackReason: 'config caused issues',
    ...overrides,
  };
}

// Valid rollback approval passes
const valid = validateModelConfigRollbackPreflight(makeInput());
expect('valid rollback approval → valid=true', valid.valid === true);
expect('valid rollback → no blocked reasons', valid.blockedReasons.length === 0);

// AI caller blocked
const aiBlocked = validateModelConfigRollbackPreflight(makeInput({ callerType: 'ai' }));
expect('AI caller → ROLLBACK_EXEC_AI_CALLER_BLOCKED', aiBlocked.blockedReasons.includes('ROLLBACK_EXEC_AI_CALLER_BLOCKED'));
expect('AI caller → valid=false', aiBlocked.valid === false);

// Tenant mismatch → early return
const tenantMismatch = validateModelConfigRollbackPreflight(makeInput({ tenantId: '' as TenantId }));
expect('empty tenantId → ROLLBACK_EXEC_TENANT_MISMATCH', tenantMismatch.blockedReasons.includes('ROLLBACK_EXEC_TENANT_MISMATCH'));

// Rollback approval tenant mismatch
const approvalTenantMismatch = validateModelConfigRollbackPreflight(makeInput({
  rollbackApproval: makeRollbackApproval({ tenantId: 'other-tenant' as TenantId }),
}));
expect('approval tenant mismatch → ROLLBACK_EXEC_APPROVAL_TENANT_MISMATCH', approvalTenantMismatch.blockedReasons.includes('ROLLBACK_EXEC_APPROVAL_TENANT_MISMATCH'));

// Approval not approved
const notApproved = validateModelConfigRollbackPreflight(makeInput({
  rollbackApproval: makeRollbackApproval({ status: 'PENDING_REVIEW' }),
}));
expect('non-APPROVED status → ROLLBACK_EXEC_APPROVAL_NOT_APPROVED', notApproved.blockedReasons.includes('ROLLBACK_EXEC_APPROVAL_NOT_APPROVED'));

// Missing rollbackTargetVersion
const noTarget = validateModelConfigRollbackPreflight(makeInput({ rollbackTargetVersion: '' as ReturnType<typeof asConfigVersion> }));
expect('empty rollbackTargetVersion → ROLLBACK_EXEC_MISSING_ROLLBACK_TARGET_VERSION', noTarget.blockedReasons.includes('ROLLBACK_EXEC_MISSING_ROLLBACK_TARGET_VERSION'));

// Missing expectedCurrentVersion
const noExpected = validateModelConfigRollbackPreflight(makeInput({ expectedCurrentVersion: '' as ReturnType<typeof asConfigVersion> }));
expect('empty expectedCurrentVersion → ROLLBACK_EXEC_MISSING_EXPECTED_VERSION', noExpected.blockedReasons.includes('ROLLBACK_EXEC_MISSING_EXPECTED_VERSION'));

// Missing rollbackToken
const noToken = validateModelConfigRollbackPreflight(makeInput({ rollbackToken: '' as ReturnType<typeof asRollbackToken> }));
expect('empty rollbackToken → ROLLBACK_EXEC_MISSING_ROLLBACK_TOKEN', noToken.blockedReasons.includes('ROLLBACK_EXEC_MISSING_ROLLBACK_TOKEN'));

// Missing rollbackReason
const noReason = validateModelConfigRollbackPreflight(makeInput({ rollbackReason: '' }));
expect('empty rollbackReason → ROLLBACK_EXEC_MISSING_ROLLBACK_REASON', noReason.blockedReasons.includes('ROLLBACK_EXEC_MISSING_ROLLBACK_REASON'));

const whitespaceReason = validateModelConfigRollbackPreflight(makeInput({ rollbackReason: '   ' }));
expect('whitespace rollbackReason → ROLLBACK_EXEC_MISSING_ROLLBACK_REASON', whitespaceReason.blockedReasons.includes('ROLLBACK_EXEC_MISSING_ROLLBACK_REASON'));

// Same version blocked
const sameVersion = validateModelConfigRollbackPreflight(makeInput({
  rollbackTargetVersion: currentVersion,
  expectedCurrentVersion: currentVersion,
}));
expect('same version → ROLLBACK_EXEC_SAME_VERSION', sameVersion.blockedReasons.includes('ROLLBACK_EXEC_SAME_VERSION'));

// Rollback modeled as new change (valid path has empty blockedReasons)
expect('valid rollback → blockedReasons is empty array', valid.blockedReasons.length === 0);

if (fail === 0) console.log(`\nPASSED — modelConfigRollbackPreflightService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
