/**
 * Feature 007 Phase 1: Canonicalization tests
 */
import {
  validateCanonicalModelConfigHashInput,
  canonicalizeModelConfigForTransaction,
} from '../realModelConfigCanonicalizationService';
import { asDiffHash } from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 007 Phase 1: Canonicalization ===\n');

// 1. Deterministic hashing of simple object
const obj1 = { b: 2, a: 1 };
const r1 = validateCanonicalModelConfigHashInput(obj1);
expect('simple object → valid=true', r1.valid === true);
expect('simple object → canonicalized set', r1.canonicalized !== null);

// 2. Key order determinism — same keys different order → same hash
const obj2a = { a: 1, b: 2, c: 3 };
const obj2b = { c: 3, a: 1, b: 2 };
const r2a = validateCanonicalModelConfigHashInput(obj2a);
const r2b = validateCanonicalModelConfigHashInput(obj2b);
expect('key order → same hash', r2a.canonicalized !== null && r2b.canonicalized !== null && r2a.canonicalized.inputHash === r2b.canonicalized.inputHash);
expect('key order → keys sorted', r2a.canonicalized !== null && r2a.canonicalized.deterministicKeys.join(',') === 'a,b,c');

// 3. Nested arrays preserve order
const obj3a = { arr: [3, 1, 2] };
const obj3b = { arr: [1, 2, 3] };
const r3a = validateCanonicalModelConfigHashInput(obj3a);
const r3b = validateCanonicalModelConfigHashInput(obj3b);
expect('arrays preserve order → different hash', r3a.canonicalized?.inputHash !== r3b.canonicalized?.inputHash);

// 4. Date → deterministic ISO string
const d = new Date('2026-06-04T10:00:00.000Z');
const r4a = validateCanonicalModelConfigHashInput({ ts: d });
const r4b = validateCanonicalModelConfigHashInput({ ts: d });
expect('Date → same hash twice', r4a.canonicalized?.inputHash === r4b.canonicalized?.inputHash);
expect('Date → ISO string in canonical', r4a.canonicalized !== null && r4a.canonicalized.canonicalJson.includes('2026-06-04T10:00:00.000Z'));

// 5. BigInt → blocked
const r5 = validateCanonicalModelConfigHashInput({ n: BigInt(42) });
expect('BigInt → REAL_EXEC_CANONICAL_BIGINT_BLOCKED', r5.blockedReasons.includes('REAL_EXEC_CANONICAL_BIGINT_BLOCKED'));
expect('BigInt → valid=false', r5.valid === false);
expect('BigInt → canonicalized=null', r5.canonicalized === null);

// 6. NaN → blocked
const r6 = validateCanonicalModelConfigHashInput({ n: NaN });
expect('NaN → REAL_EXEC_CANONICAL_NAN_BLOCKED', r6.blockedReasons.includes('REAL_EXEC_CANONICAL_NAN_BLOCKED'));

// 7. Infinity → blocked
const r7 = validateCanonicalModelConfigHashInput({ n: Infinity });
expect('Infinity → REAL_EXEC_CANONICAL_INFINITY_BLOCKED', r7.blockedReasons.includes('REAL_EXEC_CANONICAL_INFINITY_BLOCKED'));

// 8. -Infinity → blocked
const r7b = validateCanonicalModelConfigHashInput({ n: -Infinity });
expect('-Infinity → REAL_EXEC_CANONICAL_INFINITY_BLOCKED', r7b.blockedReasons.includes('REAL_EXEC_CANONICAL_INFINITY_BLOCKED'));

// 9. undefined → blocked
const r8 = validateCanonicalModelConfigHashInput({ n: undefined });
expect('undefined value → REAL_EXEC_CANONICAL_UNDEFINED_BLOCKED', r8.blockedReasons.includes('REAL_EXEC_CANONICAL_UNDEFINED_BLOCKED'));

// 10. function → blocked
const r9 = validateCanonicalModelConfigHashInput({ fn: () => 1 });
expect('function → REAL_EXEC_CANONICAL_FUNCTION_BLOCKED', r9.blockedReasons.includes('REAL_EXEC_CANONICAL_FUNCTION_BLOCKED'));

// 11. symbol → blocked
const r10 = validateCanonicalModelConfigHashInput({ s: Symbol('x') });
expect('symbol → REAL_EXEC_CANONICAL_SYMBOL_BLOCKED', r10.blockedReasons.includes('REAL_EXEC_CANONICAL_SYMBOL_BLOCKED'));

// 12. circular reference → blocked
const circ: Record<string, unknown> = { a: 1 };
circ['self'] = circ;
const r11 = validateCanonicalModelConfigHashInput(circ);
expect('circular → REAL_EXEC_CANONICAL_CIRCULAR_REFERENCE', r11.blockedReasons.includes('REAL_EXEC_CANONICAL_CIRCULAR_REFERENCE'));

// 13. null preserved
const r12 = validateCanonicalModelConfigHashInput({ v: null });
expect('null → valid=true', r12.valid === true);
expect('null → in canonical json', r12.canonicalized !== null && r12.canonicalized.canonicalJson.includes('null'));

// 14. canonicalizeModelConfigForTransaction: correct hash passes
const testObj = { weights: { a: 1, b: 2 } };
const refResult = validateCanonicalModelConfigHashInput(testObj);
const refHash = refResult.canonicalized!.inputHash;
const r14 = canonicalizeModelConfigForTransaction(testObj, refHash);
expect('correct hash → valid=true', r14.valid === true);

// 15. canonicalizeModelConfigForTransaction: wrong hash → REAL_EXEC_CONFIG_HASH_MISMATCH
const wrongHash = asDiffHash('00000000');
const r15 = canonicalizeModelConfigForTransaction(testObj, wrongHash);
expect('wrong hash → REAL_EXEC_CONFIG_HASH_MISMATCH', r15.blockedReasons.includes('REAL_EXEC_CONFIG_HASH_MISMATCH'));
expect('wrong hash → valid=false', r15.valid === false);

// 16. Invalid date → blocked
const invalidDate = new Date('not-a-date');
const r16 = validateCanonicalModelConfigHashInput({ d: invalidDate });
expect('invalid Date → REAL_EXEC_CANONICAL_DATE_NOT_SERIALIZABLE', r16.blockedReasons.includes('REAL_EXEC_CANONICAL_DATE_NOT_SERIALIZABLE'));

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1 Canonicalization (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
