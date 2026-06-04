import type { BlockedReason } from '../types/aiBoundary';

export type CanonicalizeResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: BlockedReason };

/**
 * Canonicalizes a value for deterministic JSON serialization.
 * Rules:
 * - null → null
 * - boolean, number (finite non-NaN) → as-is
 * - string → as-is
 * - Date → .toISOString()
 * - Array → each element recursively canonicalized
 * - plain object → keys sorted, values recursively canonicalized
 * - BigInt → blocked (CANONICAL_BIGINT_NOT_SUPPORTED)
 * - NaN → blocked (CANONICAL_NAN_NOT_SUPPORTED)
 * - Infinity / -Infinity → blocked (CANONICAL_INFINITY_NOT_SUPPORTED)
 * - undefined → blocked (CANONICAL_UNDEFINED_NOT_SUPPORTED)
 * - function → blocked (CANONICAL_FUNCTION_NOT_SUPPORTED)
 * - symbol → blocked (CANONICAL_SYMBOL_NOT_SUPPORTED)
 * - circular reference → blocked (CANONICAL_CIRCULAR_REFERENCE)
 */
export function canonicalizeValue(
  value: unknown,
  seen?: WeakSet<object>,
): CanonicalizeResult {
  // undefined
  if (value === undefined) return { ok: false, reason: 'CANONICAL_UNDEFINED_NOT_SUPPORTED' };
  // function
  if (typeof value === 'function') return { ok: false, reason: 'CANONICAL_FUNCTION_NOT_SUPPORTED' };
  // symbol
  if (typeof value === 'symbol') return { ok: false, reason: 'CANONICAL_SYMBOL_NOT_SUPPORTED' };
  // bigint
  if (typeof value === 'bigint') return { ok: false, reason: 'CANONICAL_BIGINT_NOT_SUPPORTED' };
  // null
  if (value === null) return { ok: true, value: null };
  // boolean
  if (typeof value === 'boolean') return { ok: true, value };
  // number
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { ok: false, reason: 'CANONICAL_NAN_NOT_SUPPORTED' };
    if (!Number.isFinite(value)) return { ok: false, reason: 'CANONICAL_INFINITY_NOT_SUPPORTED' };
    return { ok: true, value };
  }
  // string
  if (typeof value === 'string') return { ok: true, value };
  // object (non-null)
  const seenSet = seen ?? new WeakSet<object>();
  if (seenSet.has(value as object)) return { ok: false, reason: 'CANONICAL_CIRCULAR_REFERENCE' };
  seenSet.add(value as object);

  // Date
  if (value instanceof Date) return { ok: true, value: value.toISOString() };

  // Array
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value as unknown[]) {
      const r = canonicalizeValue(item, seenSet);
      if (!r.ok) return r;
      result.push(r.value);
    }
    return { ok: true, value: result };
  }

  // plain object
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const r = canonicalizeValue(obj[key], seenSet);
    if (!r.ok) return r;
    sorted[key] = r.value;
  }
  return { ok: true, value: sorted };
}

/**
 * Pure SHA-256 implementation (no Node.js crypto — browser-compatible).
 * Operates on a UTF-8 string.
 */
function sha256(message: string): string {
  // Convert string to UTF-8 bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  // SHA-256 constants
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Initial hash values
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const length = data.length;
  const bitLength = length * 8;

  // Pre-process: padding
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000) >>> 0, false);

  // Process blocks
  for (let i = 0; i < padded.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) w.push(view.getUint32(i + j * 4, false));
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w.push((w[j - 16] + s0 + w[j - 7] + s1) >>> 0);
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => v.toString(16).padStart(8, '0'))
    .join('');
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

export type HashResult =
  | { ok: true; hash: string }
  | { ok: false; reason: BlockedReason };

/**
 * Produce a deterministic SHA-256 hash of any canonicalizable object.
 * Returns blocked reason if the object contains non-canonicalizable values.
 */
export function hashCanonicalObject(value: unknown): HashResult {
  const result = canonicalizeValue(value);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, hash: sha256(JSON.stringify(result.value)) };
}
