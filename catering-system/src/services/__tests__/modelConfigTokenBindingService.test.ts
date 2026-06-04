import { generateApplyToken, generateRollbackToken } from '../modelConfigDiffService';
import { canonicalJson, canonicalizeObject } from '../modelConfigDiffService';
import { asConfigVersion, asModelConfigApprovalId, asModelConfigRecommendationId, asDiffHash } from '../../types/modelConfigApply';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

const T1 = 'tenant-1' as TenantId;
const T2 = 'tenant-2' as TenantId;
const AUDIT1 = 'audit-1' as AuditTrailId;
const AUDIT2 = 'audit-2' as AuditTrailId;
const V1 = asConfigVersion('v1');
const V2 = asConfigVersion('v2');
const V3 = asConfigVersion('v3');
const REC = asModelConfigRecommendationId('rec-1');
const REC2 = asModelConfigRecommendationId('rec-2');
const APPROVAL1 = asModelConfigApprovalId('approval-1');
const APPROVAL2 = asModelConfigApprovalId('approval-2');
const HASH1 = asDiffHash('a'.repeat(64));
const HASH2 = asDiffHash('b'.repeat(64));
let pass = 0;
let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Token Binding ---');
console.log('\n[generateApplyToken]');

const baseApply = {
  tenantId: T1 as string,
  sourceRecommendationId: REC as string,
  humanApprovalId: APPROVAL1 as string,
  previousVersion: V1 as string,
  proposedNewVersion: V2 as string,
  auditTrailId: AUDIT1 as string,
  diffHash: HASH1 as string,
};

const tok1 = generateApplyToken(baseApply);
const tok2 = generateApplyToken(baseApply);
expect('applyToken deterministic: same input → same token', tok1 === tok2);
expect('applyToken is 64 hex chars', tok1.length === 64);

expect('different humanApprovalId → different token', generateApplyToken({ ...baseApply, humanApprovalId: APPROVAL2 as string }) !== tok1);
expect('different proposedNewVersion → different token', generateApplyToken({ ...baseApply, proposedNewVersion: V3 as string }) !== tok1);
expect('different tenantId → different token', generateApplyToken({ ...baseApply, tenantId: T2 as string }) !== tok1);
expect('different auditTrailId → different token', generateApplyToken({ ...baseApply, auditTrailId: AUDIT2 as string }) !== tok1);
expect('different diffHash → different token', generateApplyToken({ ...baseApply, diffHash: HASH2 as string }) !== tok1);
expect('different sourceRecommendationId → different token', generateApplyToken({ ...baseApply, sourceRecommendationId: REC2 as string }) !== tok1);
expect('different previousVersion → different token', generateApplyToken({ ...baseApply, previousVersion: V3 as string }) !== tok1);

// Key order should not matter for token
const reordered = {
  diffHash: HASH1 as string,
  auditTrailId: AUDIT1 as string,
  proposedNewVersion: V2 as string,
  previousVersion: V1 as string,
  humanApprovalId: APPROVAL1 as string,
  sourceRecommendationId: REC as string,
  tenantId: T1 as string,
};
expect('applyToken: key order does not affect token', generateApplyToken(reordered) === tok1);

console.log('\n[generateRollbackToken]');

const baseRollback = {
  tenantId: T1 as string,
  rollbackTargetVersion: V1 as string,
  currentVersion: V2 as string,
  auditTrailId: AUDIT1 as string,
  rollbackReason: 'accuracy dropped',
};

const rtok1 = generateRollbackToken(baseRollback);
const rtok2 = generateRollbackToken(baseRollback);
expect('rollbackToken deterministic: same input → same token', rtok1 === rtok2);
expect('rollbackToken is 64 hex chars', rtok1.length === 64);

expect('different tenantId → different token', generateRollbackToken({ ...baseRollback, tenantId: T2 as string }) !== rtok1);
expect('different rollbackTargetVersion → different token', generateRollbackToken({ ...baseRollback, rollbackTargetVersion: V3 as string }) !== rtok1);
expect('different currentVersion → different token', generateRollbackToken({ ...baseRollback, currentVersion: V3 as string }) !== rtok1);
expect('different auditTrailId → different token', generateRollbackToken({ ...baseRollback, auditTrailId: AUDIT2 as string }) !== rtok1);
expect('different rollbackReason → different token', generateRollbackToken({ ...baseRollback, rollbackReason: 'other reason' }) !== rtok1);

// Key order should not matter
const reorderedRollback = {
  rollbackReason: 'accuracy dropped',
  auditTrailId: AUDIT1 as string,
  currentVersion: V2 as string,
  rollbackTargetVersion: V1 as string,
  tenantId: T1 as string,
};
expect('rollbackToken: key order does not affect token', generateRollbackToken(reorderedRollback) === rtok1);

// apply token != rollback token for different purposes
expect('applyToken !== rollbackToken (different namespaces)', (tok1 as string) !== (rtok1 as string));

console.log('\n[canonicalJson extreme edge cases]');

// Deeply nested objects
const deep = { a: { b: { c: { d: { z: 9, y: 8 }, x: 7 }, w: 6 }, v: 5 }, u: 4 };
const deep2 = { u: 4, a: { v: 5, b: { w: 6, c: { x: 7, d: { y: 8, z: 9 } } } } };
expect('deeply nested: same logical object different key order → same hash', canonicalJson(deep) === canonicalJson(deep2));

// Arrays with nested objects preserve order
const arrObj1 = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
const arrObj2 = [{ a: 1, b: 2 }, { c: 3, d: 4 }];
const arrObj3 = [{ d: 4, c: 3 }, { b: 2, a: 1 }];
expect('array with objects: inner keys sorted', canonicalJson(arrObj1) === canonicalJson(arrObj2));
expect('array order preserved: different order → different', canonicalJson(arrObj1) !== canonicalJson(arrObj3));

// Date deterministic
const d1 = new Date('2026-01-01T00:00:00.000Z');
const d2 = new Date('2026-01-01T00:00:00.000Z');
const d3 = new Date('2026-01-02T00:00:00.000Z');
expect('Date serializes deterministically', canonicalJson(d1) === canonicalJson(d2));
expect('Different Date produces different hash', canonicalJson(d1) !== canonicalJson(d3));
expect('Date in object is deterministic', canonicalJson({ t: d1, a: 1 }) === canonicalJson({ a: 1, t: d2 }));

// Undefined / function / symbol stripped consistently
const withExtras = { a: 1, b: undefined, c: () => {}, d: Symbol('x'), e: 2 };
const withoutExtras = { a: 1, e: 2 };
expect('undefined/function/symbol stripped: matches clean object', canonicalJson(withExtras) === canonicalJson(withoutExtras));

// Circular reference throws
let threw = false;
try {
  const circ: Record<string, unknown> = { a: 1 };
  circ.self = circ;
  canonicalizeObject(circ);
} catch {
  threw = true;
}
expect('circular reference throws', threw);

// Circular in array throws
let threwArr = false;
try {
  const arr: unknown[] = [1, 2];
  arr.push(arr);
  canonicalizeObject(arr);
} catch {
  threwArr = true;
}
expect('circular reference in array throws', threwArr);

// Same logical diff with different key order → same SHA-256 hash
const weightsDiff1 = { historicalUsageWeight: 1.2, wasteRiskWeight: 0.9, receivingDeltaWeight: 1.0 };
const weightsDiff2 = { receivingDeltaWeight: 1.0, historicalUsageWeight: 1.2, wasteRiskWeight: 0.9 };
expect('same logical diff different key order → same canonical JSON', canonicalJson(weightsDiff1) === canonicalJson(weightsDiff2));

// Null handling
expect('null stays null', canonicalJson(null) === 'null');
expect('null in object kept', canonicalJson({ a: null }) === '{"a":null}');

// Number edge cases
expect('0 serializes correctly', canonicalJson(0) === '0');
expect('negative number correct', canonicalJson(-1.5) === '-1.5');

if (fail === 0) console.log(`\nPASSED — token binding + canonical JSON edge cases verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
