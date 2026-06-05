/**
 * realModelConfigCanonicalizationService.ts
 *
 * Feature 007 Phase 1: Canonicalization Validator
 *
 * Produces a deterministic, transaction-safe canonical JSON representation
 * of a model config object for hash computation.
 *
 * Spec v1.2 rules:
 *  - Keys sorted lexicographically at every nesting level
 *  - Arrays preserve order (not sorted)
 *  - Date → ISO 8601 string (deterministic)
 *  - BigInt → BLOCKED (REAL_EXEC_CANONICAL_BIGINT_BLOCKED)
 *  - NaN → BLOCKED (REAL_EXEC_CANONICAL_NAN_BLOCKED)
 *  - Infinity / -Infinity → BLOCKED (REAL_EXEC_CANONICAL_INFINITY_BLOCKED)
 *  - undefined → BLOCKED (REAL_EXEC_CANONICAL_UNDEFINED_BLOCKED)
 *  - function → BLOCKED (REAL_EXEC_CANONICAL_FUNCTION_BLOCKED)
 *  - symbol → BLOCKED (REAL_EXEC_CANONICAL_SYMBOL_BLOCKED)
 *  - circular reference → BLOCKED (REAL_EXEC_CANONICAL_CIRCULAR_REFERENCE)
 *  - null → preserved as JSON null
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - Pure synchronous function — no I/O, no side effects
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { DiffHash } from '../types/modelConfigApply';
import type {
  CanonicalizedModelConfigHashInput,
  CanonicalizationGuardResult,
} from '../types/realModelConfigApplyExecution';
import { asDiffHash } from '../types/modelConfigApply';

// Simple deterministic hash (djb2 variant) — pure, no crypto dependency
function djb2Hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

type SerializeResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: BlockedReason };

function serializeValue(
  value: unknown,
  seen: Set<object>,
): SerializeResult {
  if (value === null) return { ok: true, value: null };

  const t = typeof value;

  if (t === 'undefined') return { ok: false, reason: 'REAL_EXEC_CANONICAL_UNDEFINED_BLOCKED' };
  if (t === 'function') return { ok: false, reason: 'REAL_EXEC_CANONICAL_FUNCTION_BLOCKED' };
  if (t === 'symbol') return { ok: false, reason: 'REAL_EXEC_CANONICAL_SYMBOL_BLOCKED' };
  if (t === 'bigint') return { ok: false, reason: 'REAL_EXEC_CANONICAL_BIGINT_BLOCKED' };

  if (t === 'number') {
    if (Number.isNaN(value as number)) return { ok: false, reason: 'REAL_EXEC_CANONICAL_NAN_BLOCKED' };
    if (!Number.isFinite(value as number)) return { ok: false, reason: 'REAL_EXEC_CANONICAL_INFINITY_BLOCKED' };
    return { ok: true, value };
  }

  if (t === 'boolean' || t === 'string') return { ok: true, value };

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return { ok: false, reason: 'REAL_EXEC_CANONICAL_DATE_NOT_SERIALIZABLE' };
    return { ok: true, value: value.toISOString() };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return { ok: false, reason: 'REAL_EXEC_CANONICAL_CIRCULAR_REFERENCE' };
    seen.add(value);
    const items: unknown[] = [];
    for (const item of value) {
      const r = serializeValue(item, seen);
      if (!r.ok) { seen.delete(value); return r; }
      items.push(r.value);
    }
    seen.delete(value);
    return { ok: true, value: items };
  }

  if (t === 'object') {
    if (seen.has(value as object)) return { ok: false, reason: 'REAL_EXEC_CANONICAL_CIRCULAR_REFERENCE' };
    seen.add(value as object);
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as object).sort();
    for (const key of keys) {
      const r = serializeValue((value as Record<string, unknown>)[key], seen);
      if (!r.ok) { seen.delete(value as object); return r; }
      sorted[key] = r.value;
    }
    seen.delete(value as object);
    return { ok: true, value: sorted };
  }

  return { ok: false, reason: 'REAL_EXEC_CANONICAL_UNDEFINED_BLOCKED' };
}

/**
 * Validates and canonicalizes a model config object for transaction-safe hashing.
 *
 * Returns a CanonicalizationGuardResult with:
 *  - valid: true → canonicalized is set, blockedReasons is empty
 *  - valid: false → canonicalized is null, blockedReasons lists all violations
 */
export function validateCanonicalModelConfigHashInput(
  input: unknown,
): CanonicalizationGuardResult {
  const seen = new Set<object>();
  const result = serializeValue(input, seen);

  if (!result.ok) {
    return {
      valid: false,
      blockedReasons: [result.reason],
      canonicalized: null,
    };
  }

  const canonicalJson = JSON.stringify(result.value);
  const inputHash = asDiffHash(djb2Hash(canonicalJson));
  const deterministicKeys = input !== null && typeof input === 'object' && !Array.isArray(input)
    ? Object.keys(input as object).sort()
    : [];

  const canonicalized: CanonicalizedModelConfigHashInput = {
    _kind: 'canonicalized_model_config_hash_input',
    canonicalJson,
    inputHash,
    deterministicKeys,
    warnings: [],
  };

  return { valid: true, blockedReasons: [], canonicalized };
}

/**
 * Validates that a caller-supplied configHash matches the canonical hash of a config object.
 * Returns a CanonicalizationGuardResult — blocked if mismatch.
 */
export function canonicalizeModelConfigForTransaction(
  configObject: unknown,
  expectedHash: DiffHash,
): CanonicalizationGuardResult {
  const result = validateCanonicalModelConfigHashInput(configObject);
  if (!result.valid || !result.canonicalized) return result;

  if ((result.canonicalized.inputHash as string) !== (expectedHash as string)) {
    return {
      valid: false,
      blockedReasons: ['REAL_EXEC_CONFIG_HASH_MISMATCH'],
      canonicalized: null,
    };
  }

  return result;
}
