import { validateModelConfigApplyPreflight } from '../modelConfigApplyPreflightService';
import type { ApplyPreflightInput } from '../modelConfigApplyPreflightService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import { asModelConfigApprovalId, asModelConfigRecommendationId, asConfigVersion, asDiffHash, asApplyToken } from '../../types/modelConfigApply';
import type { PersistedHumanModelConfigApproval } from '../../types/modelConfigApplyExecution';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigApplyPreflightService ===\n');

const tenantId = 'tenant-001' as TenantId;
const approvalId = asModelConfigApprovalId('approval-001');
const recId = asModelConfigRecommendationId('rec-001');
const version = asConfigVersion('v1');
const diffHash = asDiffHash('abc123');
const configBeforeHash = asDiffHash('before123');
const configAfterHash = asDiffHash('after123');
const applyToken = asApplyToken('token123');
const auditTrailId = 'audit-001' as AuditTrailId;

function makeApproval(overrides: Partial<PersistedHumanModelConfigApproval> = {}): PersistedHumanModelConfigApproval {
  return {
    _kind: 'persisted_human_model_config_approval',
    approvalId,
    tenantId,
    sourceRecommendationId: recId,
    approvedByHumanUserId: 'user-001',
    approvalReason: 'looks good',
    approvedAt: new Date(),
    auditTrailId,
    targetVersion: version,
    expectedCurrentVersion: version,
    diffHash,
    configBeforeHash,
    configAfterHash,
    status: 'APPROVED',
    aiCanApprove: false,
    persisted: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ApplyPreflightInput> = {}): ApplyPreflightInput {
  return {
    tenantId,
    callerType: 'human',
    callerUserId: 'user-001',
    approval: makeApproval(),
    sourceRecommendationId: recId,
    expectedCurrentVersion: version,
    applyToken,
    auditTrailId,
    configBeforeHash,
    configAfterHash,
    diffHash,
    proposedWeights: { historicalUsageWeight: 1.0 },
    ...overrides,
  };
}

// Valid human approval passes
const valid = validateModelConfigApplyPreflight(makeInput());
expect('valid human approval → valid=true', valid.valid === true);
expect('valid human approval → no blocked reasons', valid.blockedReasons.length === 0);

// AI caller blocked
const aiBlocked = validateModelConfigApplyPreflight(makeInput({ callerType: 'ai' }));
expect('AI caller → blocked', aiBlocked.blockedReasons.includes('EXEC_AI_CALLER_BLOCKED'));
expect('AI caller → valid=false', aiBlocked.valid === false);

// Tenant mismatch → early return
const tenantMismatch = validateModelConfigApplyPreflight(makeInput({ tenantId: '' as TenantId }));
expect('empty tenantId → EXEC_TENANT_MISMATCH', tenantMismatch.blockedReasons.includes('EXEC_TENANT_MISMATCH'));
expect('tenant mismatch → valid=false', tenantMismatch.valid === false);

// Approval tenant mismatch
const approvalTenantMismatch = validateModelConfigApplyPreflight(makeInput({
  approval: makeApproval({ tenantId: 'other-tenant' as TenantId }),
}));
expect('approval tenant mismatch → EXEC_APPROVAL_TENANT_MISMATCH', approvalTenantMismatch.blockedReasons.includes('EXEC_APPROVAL_TENANT_MISMATCH'));

// Missing approval ID
const noApprovalId = validateModelConfigApplyPreflight(makeInput({
  approval: makeApproval({ approvalId: '' as ReturnType<typeof asModelConfigApprovalId> }),
}));
expect('empty approvalId → EXEC_MISSING_APPROVAL_ID', noApprovalId.blockedReasons.includes('EXEC_MISSING_APPROVAL_ID'));

// Approval not approved
const notApproved = validateModelConfigApplyPreflight(makeInput({
  approval: makeApproval({ status: 'PENDING_REVIEW' }),
}));
expect('non-APPROVED status → EXEC_APPROVAL_NOT_APPROVED', notApproved.blockedReasons.includes('EXEC_APPROVAL_NOT_APPROVED'));

// sourceRecommendationId mismatch
const recMismatch = validateModelConfigApplyPreflight(makeInput({
  sourceRecommendationId: asModelConfigRecommendationId('different-rec'),
}));
expect('rec ID mismatch → EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH', recMismatch.blockedReasons.includes('EXEC_SOURCE_RECOMMENDATION_ID_MISMATCH'));

// Missing expectedCurrentVersion
const noVersion = validateModelConfigApplyPreflight(makeInput({ expectedCurrentVersion: '' as ReturnType<typeof asConfigVersion> }));
expect('empty expectedCurrentVersion → EXEC_MISSING_EXPECTED_VERSION', noVersion.blockedReasons.includes('EXEC_MISSING_EXPECTED_VERSION'));

// Missing applyToken
const noToken = validateModelConfigApplyPreflight(makeInput({ applyToken: '' as ReturnType<typeof asApplyToken> }));
expect('empty applyToken → EXEC_MISSING_APPLY_TOKEN', noToken.blockedReasons.includes('EXEC_MISSING_APPLY_TOKEN'));

// Missing auditTrailId
const noAudit = validateModelConfigApplyPreflight(makeInput({ auditTrailId: '' as AuditTrailId }));
expect('empty auditTrailId → EXEC_MISSING_AUDIT_TRAIL_ID', noAudit.blockedReasons.includes('EXEC_MISSING_AUDIT_TRAIL_ID'));

// Invalid weights (negative)
const badWeights = validateModelConfigApplyPreflight(makeInput({ proposedWeights: { historicalUsageWeight: -1 } }));
expect('negative weight → EXEC_INVALID_PROPOSED_WEIGHTS', badWeights.blockedReasons.includes('EXEC_INVALID_PROPOSED_WEIGHTS'));

// Invalid weights (NaN)
const nanWeights = validateModelConfigApplyPreflight(makeInput({ proposedWeights: { historicalUsageWeight: NaN } }));
expect('NaN weight → EXEC_INVALID_PROPOSED_WEIGHTS', nanWeights.blockedReasons.includes('EXEC_INVALID_PROPOSED_WEIGHTS'));

if (fail === 0) console.log(`\nPASSED — modelConfigApplyPreflightService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
