import { generateNextVersion, buildModelConfigVersion } from '../modelConfigVersionService';
import { asConfigVersion } from '../../types/modelConfigApply';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

const T1 = 'tenant-1' as TenantId;
const AUDIT = 'audit-1' as AuditTrailId;
const WEIGHTS = { historicalUsageWeight: 1.0, wasteRiskWeight: 1.0, receivingDeltaWeight: 1.0, safetyStockWeight: 1.0 };

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- modelConfigVersionService ---');

expect('v1 → v2', generateNextVersion(asConfigVersion('v1')) === 'v2');
expect('v9 → v10', generateNextVersion(asConfigVersion('v9')) === 'v10');
expect('v0 → v1', generateNextVersion(asConfigVersion('v0')) === 'v1');
expect('non-standard version → appends -next', generateNextVersion(asConfigVersion('initial')) === 'initial-next');

const v = buildModelConfigVersion({
  version: asConfigVersion('v1'),
  tenantId: T1,
  weights: WEIGHTS,
  weightMode: 'independent_multiplier',
  createdByHumanUserId: 'user-abc',
  auditTrailId: AUDIT,
  sourceRecommendationId: null,
  now: new Date('2026-01-01'),
});
expect('built version has correct tenantId', v.tenantId === T1);
expect('built version has configHash', v.configHash.length === 64);
expect('built version has createdByHumanUserId', v.createdByHumanUserId === 'user-abc');
expect('built version sourceRecommendationId null', v.sourceRecommendationId === null);

// Same weights → same configHash
const v2 = buildModelConfigVersion({
  version: asConfigVersion('v2'),
  tenantId: T1,
  weights: WEIGHTS,
  weightMode: 'independent_multiplier',
  createdByHumanUserId: 'user-abc',
  auditTrailId: AUDIT,
  sourceRecommendationId: null,
  now: new Date('2026-01-02'),
});
expect('same weights → same configHash', v.configHash === v2.configHash);

if (fail === 0) console.log(`\nPASSED — modelConfigVersionService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
