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

// ─── Phase 3: Complex nested config regression ────────────────────────────────

console.log('\n[Phase 3: Complex nested config regression]\n');

// Deeply nested object — hash is deterministic
const deep = { a: { b: { c: { d: { e: 'leaf' } } } } };
const dA = validateCanonicalModelConfigHashInput(deep);
const dB = validateCanonicalModelConfigHashInput({ a: { b: { c: { d: { e: 'leaf' } } } } });
expect('deeply nested → valid', dA.valid === true);
expect('deeply nested → deterministic hash', dA.canonicalized !== null && dB.canonicalized !== null && (dA.canonicalized.inputHash as string) === (dB.canonicalized.inputHash as string));

// Nested arrays — order preserved, hash deterministic
const arrA = validateCanonicalModelConfigHashInput({ items: [3, 1, 2], meta: { tags: ['b', 'a'] } });
const arrB = validateCanonicalModelConfigHashInput({ items: [3, 1, 2], meta: { tags: ['b', 'a'] } });
expect('nested arrays → valid', arrA.valid === true);
expect('nested arrays → deterministic hash', arrA.canonicalized !== null && arrB.canonicalized !== null && (arrA.canonicalized.inputHash as string) === (arrB.canonicalized.inputHash as string));

// Array order matters — different order = different hash
const arrC = validateCanonicalModelConfigHashInput({ items: [1, 2, 3] });
const arrD = validateCanonicalModelConfigHashInput({ items: [3, 2, 1] });
expect('different array order → different hash', arrC.canonicalized !== null && arrD.canonicalized !== null && (arrC.canonicalized.inputHash as string) !== (arrD.canonicalized.inputHash as string));

// Key order is normalized — different key order = same hash
const keyA = validateCanonicalModelConfigHashInput({ z: 1, a: 2, m: 3 });
const keyB = validateCanonicalModelConfigHashInput({ a: 2, m: 3, z: 1 });
expect('key order normalized → same hash', keyA.canonicalized !== null && keyB.canonicalized !== null && (keyA.canonicalized.inputHash as string) === (keyB.canonicalized.inputHash as string));

// null values preserved deterministically
const nullA = validateCanonicalModelConfigHashInput({ x: null, y: null });
const nullB = validateCanonicalModelConfigHashInput({ x: null, y: null });
expect('null values → valid', nullA.valid === true);
expect('null values → deterministic', nullA.canonicalized !== null && nullB.canonicalized !== null && (nullA.canonicalized.inputHash as string) === (nullB.canonicalized.inputHash as string));

// null vs omitted key → different
const nullC = validateCanonicalModelConfigHashInput({ x: null });
const nullD = validateCanonicalModelConfigHashInput({});
expect('null value vs omitted → different hash', nullC.canonicalized !== null && nullD.canonicalized !== null && (nullC.canonicalized.inputHash as string) !== (nullD.canonicalized.inputHash as string));

// boolean / number / string deterministic
const primA = validateCanonicalModelConfigHashInput({ b: true, n: 42, s: 'hello' });
const primB = validateCanonicalModelConfigHashInput({ b: true, n: 42, s: 'hello' });
expect('bool/number/string → deterministic', primA.canonicalized !== null && primB.canonicalized !== null && (primA.canonicalized.inputHash as string) === (primB.canonicalized.inputHash as string));

// false vs true → different hash
const boolA = validateCanonicalModelConfigHashInput({ flag: false });
const boolB = validateCanonicalModelConfigHashInput({ flag: true });
expect('false vs true → different hash', boolA.canonicalized !== null && boolB.canonicalized !== null && (boolA.canonicalized.inputHash as string) !== (boolB.canonicalized.inputHash as string));

// unicode / CJK string deterministic
const uniA = validateCanonicalModelConfigHashInput({ name: '團膳管理系統', emoji: '🍜' });
const uniB = validateCanonicalModelConfigHashInput({ name: '團膳管理系統', emoji: '🍜' });
expect('unicode/CJK → deterministic', uniA.canonicalized !== null && uniB.canonicalized !== null && (uniA.canonicalized.inputHash as string) === (uniB.canonicalized.inputHash as string));
expect('unicode/CJK → valid', uniA.valid === true);

// special characters deterministic
const specA = validateCanonicalModelConfigHashInput({ v: '\n\t\r\\" ' });
const specB = validateCanonicalModelConfigHashInput({ v: '\n\t\r\\" ' });
expect('special chars → deterministic', specA.canonicalized !== null && specB.canonicalized !== null && (specA.canonicalized.inputHash as string) === (specB.canonicalized.inputHash as string));

// unsupported values still BLOCKED per Spec v1.2
const bigIntInNested = validateCanonicalModelConfigHashInput({ cfg: { val: BigInt(99) } });
expect('nested BigInt → blocked', bigIntInNested.valid === false);
expect('nested BigInt → REAL_EXEC_CANONICAL_BIGINT_BLOCKED', bigIntInNested.blockedReasons.includes('REAL_EXEC_CANONICAL_BIGINT_BLOCKED'));

const nanInArray = validateCanonicalModelConfigHashInput({ arr: [1, NaN, 3] });
expect('NaN in array → blocked', nanInArray.valid === false);
expect('NaN in array → REAL_EXEC_CANONICAL_NAN_BLOCKED', nanInArray.blockedReasons.includes('REAL_EXEC_CANONICAL_NAN_BLOCKED'));

const infInObj = validateCanonicalModelConfigHashInput({ deep: { deeper: { v: Infinity } } });
expect('Infinity in deep obj → blocked', infInObj.valid === false);
expect('Infinity in deep obj → REAL_EXEC_CANONICAL_INFINITY_BLOCKED', infInObj.blockedReasons.includes('REAL_EXEC_CANONICAL_INFINITY_BLOCKED'));

// mixed complex valid config — deeply nested + arrays + CJK + numbers
const complex = {
  metadata: { locale: 'zh-TW', tags: ['生產', 'config', 'v2'], version: 3 },
  weights: { ingredients: { rice: 1.5, meat: 2.0 }, overhead: 0.1 },
  flags: { enabled: true, debug: false },
  thresholds: [10, 20, 30],
  notes: null,
};
const cplxA = validateCanonicalModelConfigHashInput(complex);
const cplxB = validateCanonicalModelConfigHashInput({
  flags: { debug: false, enabled: true },
  metadata: { locale: 'zh-TW', tags: ['生產', 'config', 'v2'], version: 3 },
  notes: null,
  thresholds: [10, 20, 30],
  weights: { ingredients: { meat: 2.0, rice: 1.5 }, overhead: 0.1 },
});
expect('complex config → valid', cplxA.valid === true);
expect('complex config key reorder → same hash', cplxA.canonicalized !== null && cplxB.canonicalized !== null && (cplxA.canonicalized.inputHash as string) === (cplxB.canonicalized.inputHash as string));

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1+3 Canonicalization (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
