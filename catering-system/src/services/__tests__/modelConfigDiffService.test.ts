import { canonicalJson, sha256Hash, hashWeights, computeModelConfigDiff } from '../modelConfigDiffService';
import type { ModelWeights } from '../../types/modelConfigApply';
import { asConfigVersion } from '../../types/modelConfigApply';

const TENANT = 'tenant-A' as import('../../types/aiBoundary').TenantId;
const V1 = asConfigVersion('v1');

const WEIGHTS_A: ModelWeights = {
  historicalUsageWeight: 1.0,
  wasteRiskWeight: 1.0,
  receivingDeltaWeight: 1.0,
  safetyStockWeight: 1.0,
};

const WEIGHTS_B: ModelWeights = {
  historicalUsageWeight: 1.2,
  wasteRiskWeight: 0.9,
  receivingDeltaWeight: 1.0,
  safetyStockWeight: 1.0,
};

let pass = 0;
let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- modelConfigDiffService ---');

// canonicalizeObject: same keys different order → same result
const objA = { b: 2, a: 1, c: { y: 9, x: 8 } };
const objB = { a: 1, c: { x: 8, y: 9 }, b: 2 };
expect('same object different key order → same canonical JSON', canonicalJson(objA) === canonicalJson(objB));

// array order preserved
const arr1 = [3, 1, 2];
const arr2 = [1, 2, 3];
const j1 = canonicalJson(arr1);
const j2 = canonicalJson(arr2);
expect('array order preserved (different arrays differ)', j1 !== j2);
expect('array order preserved (same array same)', canonicalJson(arr1) === canonicalJson([3, 1, 2]));

// undefined / function / symbol stripped
const objWithUndef = { a: 1, b: undefined, c: () => {}, d: Symbol('x') };
const canonical = canonicalJson(objWithUndef);
expect('undefined stripped from canonical', !canonical.includes('"b"'));
expect('function stripped from canonical', !canonical.includes('"c"'));
expect('symbol stripped from canonical', !canonical.includes('"d"'));

// SHA-256 stable
const h1 = sha256Hash('hello');
const h2 = sha256Hash('hello');
expect('SHA-256 is stable for same input', h1 === h2);
expect('SHA-256 length is 64 hex chars', h1.length === 64);
expect('SHA-256 differs for different inputs', sha256Hash('hello') !== sha256Hash('world'));

// hashWeights: same weights different key order → same hash
const wA = { historicalUsageWeight: 1.0, wasteRiskWeight: 0.9, receivingDeltaWeight: 1.1, safetyStockWeight: 1.0 };
const wB = { safetyStockWeight: 1.0, receivingDeltaWeight: 1.1, historicalUsageWeight: 1.0, wasteRiskWeight: 0.9 };
expect('hashWeights: same values different key order → same hash', hashWeights(wA) === hashWeights(wB));
expect('hashWeights: different values → different hash', hashWeights(WEIGHTS_A) !== hashWeights(WEIGHTS_B));

// computeModelConfigDiff: changedFields
const diff = computeModelConfigDiff({
  tenantId: TENANT,
  previousVersion: V1,
  previousWeights: WEIGHTS_A,
  proposedWeights: { historicalUsageWeight: 1.2, wasteRiskWeight: 0.9 },
});
expect('diff: changedFields includes historicalUsageWeight', diff.changedFields.includes('historicalUsageWeight'));
expect('diff: changedFields includes wasteRiskWeight', diff.changedFields.includes('wasteRiskWeight'));
expect('diff: changedFields does not include unchanged fields', !diff.changedFields.includes('receivingDeltaWeight'));
expect('diff: configBeforeHash !== configAfterHash', diff.configBeforeHash !== diff.configAfterHash);
expect('diff: diffHash is non-empty', diff.diffHash.length === 64);
expect('diff: tenantId correct', diff.tenantId === TENANT);

// determinism: same diff → same hashes
const diff2 = computeModelConfigDiff({
  tenantId: TENANT,
  previousVersion: V1,
  previousWeights: WEIGHTS_A,
  proposedWeights: { historicalUsageWeight: 1.2, wasteRiskWeight: 0.9 },
});
expect('diff: deterministic configBeforeHash', diff.configBeforeHash === diff2.configBeforeHash);
expect('diff: deterministic configAfterHash', diff.configAfterHash === diff2.configAfterHash);
expect('diff: deterministic diffHash', diff.diffHash === diff2.diffHash);

// no changes
const diffNoChange = computeModelConfigDiff({
  tenantId: TENANT,
  previousVersion: V1,
  previousWeights: WEIGHTS_A,
  proposedWeights: { historicalUsageWeight: 1.0 },
});
expect('diff: no change → changedFields empty', diffNoChange.changedFields.length === 0);
expect('diff: no change → configBefore === configAfter', diffNoChange.configBeforeHash === diffNoChange.configAfterHash);

if (fail === 0) console.log(`\nPASSED — modelConfigDiffService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
