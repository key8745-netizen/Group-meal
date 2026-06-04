import {
  buildSettingsHistoryVersion,
  buildSettingsHistoryWritePlan,
  buildSettingsUpdatePlan,
} from '../modelConfigSettingsHistoryService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import { asModelConfigApprovalId, asModelConfigRecommendationId, asConfigVersion, asDiffHash } from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigSettingsHistoryService ===\n');

const tenantId = 'tenant-001' as TenantId;
const approvalId = asModelConfigApprovalId('approval-001');
const recId = asModelConfigRecommendationId('rec-001');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const configHash = asDiffHash('config123');
const diffHash = asDiffHash('diff123');
const configAfterHash = asDiffHash('after123');
const auditTrailId = 'audit-001' as AuditTrailId;
const now = new Date('2024-01-01T00:00:00.000Z');

const historyVersion = buildSettingsHistoryVersion({
  tenantId,
  version: v2,
  previousVersion: v1,
  configHash,
  diffHash,
  sourceRecommendationId: recId,
  approvalId,
  auditTrailId,
  createdByHumanUserId: 'user-001',
  createdAt: now,
});

expect('buildSettingsHistoryVersion returns immutable=true', historyVersion.immutable === true);
expect('version field correct', historyVersion.version === v2);
expect('previousVersion field correct', historyVersion.previousVersion === v1);
expect('tenantId field correct', historyVersion.tenantId === tenantId);
expect('_kind correct', historyVersion._kind === 'settings_history_version');
expect('createdAt field correct', historyVersion.createdAt === now);

// sourceRecommendationId nullable
const historyVersionNoRec = buildSettingsHistoryVersion({
  tenantId,
  version: v2,
  previousVersion: v1,
  configHash,
  diffHash,
  sourceRecommendationId: null,
  approvalId,
  auditTrailId,
  createdByHumanUserId: 'user-001',
  createdAt: now,
});
expect('sourceRecommendationId can be null', historyVersionNoRec.sourceRecommendationId === null);

// buildSettingsHistoryWritePlan
const writePlan = buildSettingsHistoryWritePlan({
  tenantId,
  version: v2,
  newVersion: v2,
  previousVersion: v1,
  configHash,
  diffHash,
  sourceRecommendationId: recId,
  approvalId,
  auditTrailId,
  createdByHumanUserId: 'user-001',
  createdAt: now,
});

expect('buildSettingsHistoryWritePlan returns immutable=true', writePlan.immutable === true);
expect('buildSettingsHistoryWritePlan returns appendOnly=true', writePlan.appendOnly === true);
expect('writePlan _kind correct', writePlan._kind === 'settings_history_write_plan');
expect('writePlan newVersion correct', writePlan.newVersion === v2);
expect('writePlan previousVersion correct', writePlan.previousVersion === v1);

// buildSettingsUpdatePlan
const updatePlan = buildSettingsUpdatePlan({
  tenantId,
  currentVersion: v1,
  newVersion: v2,
  proposedWeights: { historicalUsageWeight: 1.0 },
  weightMode: 'normalized',
  configAfterHash,
});

expect('buildSettingsUpdatePlan _kind correct', updatePlan._kind === 'settings_update_plan');
expect('updatePlan tenantId correct', updatePlan.tenantId === tenantId);
expect('updatePlan currentVersion correct', updatePlan.currentVersion === v1);
expect('updatePlan newVersion correct', updatePlan.newVersion === v2);
expect('updatePlan weightMode correct', updatePlan.weightMode === 'normalized');

// No delete/overwrite methods on returned objects
expect('historyVersion has no delete method', typeof (historyVersion as unknown as Record<string, unknown>)['delete'] !== 'function');
expect('writePlan has no overwrite method', typeof (writePlan as unknown as Record<string, unknown>)['overwrite'] !== 'function');
expect('updatePlan has no delete method', typeof (updatePlan as unknown as Record<string, unknown>)['delete'] !== 'function');

if (fail === 0) console.log(`\nPASSED — modelConfigSettingsHistoryService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
