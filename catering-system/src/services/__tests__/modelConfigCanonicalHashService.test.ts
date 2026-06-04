import { canonicalizeValue, hashCanonicalObject } from '../modelConfigCanonicalHashService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigCanonicalHashService ===\n');

// null
const nullResult = canonicalizeValue(null);
expect('null → ok=true, value=null', nullResult.ok === true && nullResult.ok && nullResult.value === null);

// boolean
const trueResult = canonicalizeValue(true);
expect('true → ok=true, value=true', trueResult.ok === true && trueResult.ok && trueResult.value === true);
const falseResult = canonicalizeValue(false);
expect('false → ok=true, value=false', falseResult.ok === true && falseResult.ok && falseResult.value === false);

// number valid
const numResult = canonicalizeValue(42);
expect('42 → ok=true, value=42', numResult.ok === true && numResult.ok && numResult.value === 42);

// NaN
const nanResult = canonicalizeValue(NaN);
expect('NaN → blocked CANONICAL_NAN_NOT_SUPPORTED', !nanResult.ok && nanResult.reason === 'CANONICAL_NAN_NOT_SUPPORTED');

// Infinity
const infResult = canonicalizeValue(Infinity);
expect('Infinity → blocked CANONICAL_INFINITY_NOT_SUPPORTED', !infResult.ok && infResult.reason === 'CANONICAL_INFINITY_NOT_SUPPORTED');
const negInfResult = canonicalizeValue(-Infinity);
expect('-Infinity → blocked CANONICAL_INFINITY_NOT_SUPPORTED', !negInfResult.ok && negInfResult.reason === 'CANONICAL_INFINITY_NOT_SUPPORTED');

// string
const strResult = canonicalizeValue('hello');
expect('string → ok=true', strResult.ok === true && strResult.ok && strResult.value === 'hello');

// Date
const date = new Date('2024-01-01T00:00:00.000Z');
const dateResult = canonicalizeValue(date);
expect('Date → ISO string', dateResult.ok === true && dateResult.ok && dateResult.value === '2024-01-01T00:00:00.000Z');

// Array
const arrResult = canonicalizeValue([1, 'a', null]);
expect('Array → ok=true', arrResult.ok === true && arrResult.ok && JSON.stringify(arrResult.value) === '[1,"a",null]');

// Nested array
const nestedArrResult = canonicalizeValue([[1, 2], [3, 4]]);
expect('nested Array → ok=true', nestedArrResult.ok === true);

// Object with sorted keys
const objResult = canonicalizeValue({ z: 1, a: 2 });
expect('object keys sorted', objResult.ok === true && objResult.ok && JSON.stringify(objResult.value) === '{"a":2,"z":1}');

// Deeply nested object
const deepResult = canonicalizeValue({ b: { d: 3, c: 2 }, a: 1 });
expect('deeply nested keys sorted', deepResult.ok === true && deepResult.ok && JSON.stringify(deepResult.value) === '{"a":1,"b":{"c":2,"d":3}}');

// BigInt
const bigintResult = canonicalizeValue(BigInt(42));
expect('BigInt → blocked CANONICAL_BIGINT_NOT_SUPPORTED', !bigintResult.ok && bigintResult.reason === 'CANONICAL_BIGINT_NOT_SUPPORTED');

// undefined
const undefResult = canonicalizeValue(undefined);
expect('undefined → blocked CANONICAL_UNDEFINED_NOT_SUPPORTED', !undefResult.ok && undefResult.reason === 'CANONICAL_UNDEFINED_NOT_SUPPORTED');

// function
const fnResult = canonicalizeValue(() => {});
expect('function → blocked CANONICAL_FUNCTION_NOT_SUPPORTED', !fnResult.ok && fnResult.reason === 'CANONICAL_FUNCTION_NOT_SUPPORTED');

// symbol
const symResult = canonicalizeValue(Symbol('test'));
expect('symbol → blocked CANONICAL_SYMBOL_NOT_SUPPORTED', !symResult.ok && symResult.reason === 'CANONICAL_SYMBOL_NOT_SUPPORTED');

// circular reference
const obj: Record<string, unknown> = {};
obj['self'] = obj;
const circResult = canonicalizeValue(obj);
expect('circular reference → blocked CANONICAL_CIRCULAR_REFERENCE', !circResult.ok && circResult.reason === 'CANONICAL_CIRCULAR_REFERENCE');

// Hash determinism
const h1 = hashCanonicalObject({ a: 1, b: 2 });
const h2 = hashCanonicalObject({ b: 2, a: 1 });
expect('hash deterministic (key order insensitive)', h1.ok && h2.ok && h1.ok && h2.ok && h1.hash === h2.hash);

// Different values produce different hashes
const h3 = hashCanonicalObject({ a: 1 });
const h4 = hashCanonicalObject({ a: 2 });
expect('different values → different hashes', h3.ok && h4.ok && h3.ok && h4.ok && h3.hash !== h4.hash);

// Hash is 64 hex chars (SHA-256)
expect('hash is 64 hex chars', h1.ok && h1.hash.length === 64 && /^[0-9a-f]+$/.test(h1.hash));

// hashCanonicalObject with NaN returns blocked
const badHash = hashCanonicalObject({ x: NaN });
expect('hashCanonicalObject with NaN → blocked', !badHash.ok && badHash.reason === 'CANONICAL_NAN_NOT_SUPPORTED');

if (fail === 0) console.log(`\nPASSED — modelConfigCanonicalHashService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
