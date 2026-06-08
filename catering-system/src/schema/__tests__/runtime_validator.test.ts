/**
 * runtime_validator.test.ts — Feature 009 Phase 5F
 * Pure runner pattern: `npx tsx`, passed/failed counters, throw on failure.
 */
import {
  IS_PRODUCTION_READINESS_ONLY,
  SCHEMA_VERSION,
  buildSocAuditPayload,
  validateRuntimeToken,
  validateRuntimeFlag,
  type RuntimeToken,
  type RuntimeFlag,
  type TokenValidationInput,
  type FlagValidationInput,
  type SocAuditPayloadInput,
} from '../runtime_validator';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5F: Runtime Validator ---');

const NOW = '2026-06-08T00:50:00.000Z';
const FRESH_ISSUED = '2026-06-08T00:00:00.000Z';
const STALE_ISSUED = '2026-06-01T00:00:00.000Z';

expect('IS_PRODUCTION_READINESS_ONLY is true', IS_PRODUCTION_READINESS_ONLY === true);

// ── SOC audit payload completeness ───────────────────────────────────────────
const socInput: SocAuditPayloadInput = {
  eventType: 'TOKEN_VALIDATION_REJECTED', tenantId: 't1', operatorId: 'op-1', decision: 'DENY',
  blockedReason: 'F009_PHASE5F_TOKEN_MALFORMED', source: 'runtime_validator', occurredAt: NOW,
  traceId: 'trace-1', version: SCHEMA_VERSION, expectedState: 'VALID', observedState: 'MALFORMED',
};
const socResult = buildSocAuditPayload(socInput);
expect('SOC payload built ok', socResult.ok === true);
for (const field of ['eventType', 'tenantId', 'operatorId', 'decision', 'blockedReason', 'source', 'occurredAt', 'traceId', 'version', 'expectedState', 'observedState']) {
  expect(`SOC payload contains required field "${field}"`, socResult.payload != null && field in socResult.payload);
}
expect('SOC payload never authorizes production write', socResult.payload?.authorizesProductionWrite === false);
const socMalformed = buildSocAuditPayload({ ...socInput, tenantId: '' });
expect('SOC payload missing field → not ok (default-deny)', socMalformed.ok === false && socMalformed.payload === null);

// ── Token validation ──────────────────────────────────────────────────────────
function token(overrides: Partial<RuntimeToken> = {}): RuntimeToken {
  return {
    _kind: 'f009_phase5f_runtime_token',
    tokenId: 'tok-1', tenantId: 't1', operatorId: 'op-1',
    issuedAt: FRESH_ISSUED, version: SCHEMA_VERSION, context: 'staging',
    ...overrides,
  };
}
function tokenInput(overrides: Partial<TokenValidationInput> = {}): TokenValidationInput {
  return {
    _kind: 'f009_phase5f_token_validation_input',
    token: token(), now: NOW, expectedVersion: SCHEMA_VERSION, traceId: 'trace-tok-1',
    ...overrides,
  };
}

const validToken = validateRuntimeToken(tokenInput());
expect('Valid token in allowed readiness context → ALLOW', validToken.decision === 'ALLOW');
expect('Valid token → state VALID', validToken.state === 'VALID');
expect('Valid token → no SOC audit emitted', validToken.socAudit === null);

const malformedToken = validateRuntimeToken(tokenInput({ token: token({ tokenId: '' }) }));
expect('Malformed token → BLOCKED/DENY', malformedToken.decision === 'DENY');
expect('Malformed token → TOKEN_MALFORMED reason', malformedToken.blockedReasons.includes('F009_PHASE5F_TOKEN_MALFORMED'));
expect('Malformed token → SOC audit emitted', malformedToken.socAudit !== null);
expect('Malformed token → SOC decision DENY', malformedToken.socAudit?.decision === 'DENY');

const missingToken = validateRuntimeToken(tokenInput({ token: null }));
expect('Missing token → BLOCKED/DENY', missingToken.decision === 'DENY');
expect('Missing token → TOKEN_MISSING reason', missingToken.blockedReasons.includes('F009_PHASE5F_TOKEN_MISSING'));
expect('Missing token → SOC audit emitted', missingToken.socAudit !== null);

const staleToken = validateRuntimeToken(tokenInput({ token: token({ issuedAt: STALE_ISSUED }) }));
expect('Stale token → BLOCKED/DENY', staleToken.decision === 'DENY');
expect('Stale token → TOKEN_STALE reason', staleToken.blockedReasons.includes('F009_PHASE5F_TOKEN_STALE'));
expect('Stale token → SOC audit emitted', staleToken.socAudit !== null);

const mismatchToken = validateRuntimeToken(tokenInput({ token: token({ version: 99 }) }));
expect('Version-mismatch token → BLOCKED/DENY', mismatchToken.decision === 'DENY');
expect('Version-mismatch token → VERSION_MISMATCH reason', mismatchToken.blockedReasons.includes('F009_PHASE5F_VERSION_MISMATCH'));
expect('Version-mismatch token → SOC audit emitted', mismatchToken.socAudit !== null);

const malformedShapeToken = validateRuntimeToken(null);
expect('Malformed input shape → default-deny BLOCKED', malformedShapeToken.decision === 'DENY');
expect('Malformed input shape → UNKNOWN_STATE_DEFAULT_DENY', malformedShapeToken.blockedReasons.includes('F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY'));

// ── Flag validation ───────────────────────────────────────────────────────────
function flag(overrides: Partial<RuntimeFlag> = {}): RuntimeFlag {
  return {
    _kind: 'f009_phase5f_runtime_flag',
    flagId: 'flag-1', tenantId: 't1', operatorId: 'op-1',
    setAt: FRESH_ISSUED, version: SCHEMA_VERSION, context: 'staging',
    ...overrides,
  };
}
function flagInput(overrides: Partial<FlagValidationInput> = {}): FlagValidationInput {
  return {
    _kind: 'f009_phase5f_flag_validation_input',
    flag: flag(), now: NOW, expectedVersion: SCHEMA_VERSION, traceId: 'trace-flag-1',
    ...overrides,
  };
}

const validFlag = validateRuntimeFlag(flagInput());
expect('Valid flag in allowed readiness context → ALLOW', validFlag.decision === 'ALLOW');
expect('Valid flag → no SOC audit emitted', validFlag.socAudit === null);

const malformedFlag = validateRuntimeFlag(flagInput({ flag: flag({ flagId: '' }) }));
expect('Malformed flag → BLOCKED/DENY', malformedFlag.decision === 'DENY');
expect('Malformed flag → FLAG_MALFORMED reason', malformedFlag.blockedReasons.includes('F009_PHASE5F_FLAG_MALFORMED'));
expect('Malformed flag → SOC audit emitted', malformedFlag.socAudit !== null);

const missingFlag = validateRuntimeFlag(flagInput({ flag: undefined }));
expect('Missing flag → BLOCKED/DENY', missingFlag.decision === 'DENY');
expect('Missing flag → FLAG_MISSING reason', missingFlag.blockedReasons.includes('F009_PHASE5F_FLAG_MISSING'));

const staleFlag = validateRuntimeFlag(flagInput({ flag: flag({ setAt: STALE_ISSUED }) }));
expect('Stale flag → BLOCKED/DENY', staleFlag.decision === 'DENY');
expect('Stale flag → FLAG_STALE reason', staleFlag.blockedReasons.includes('F009_PHASE5F_FLAG_STALE'));

const mismatchFlag = validateRuntimeFlag(flagInput({ flag: flag({ version: 7 }) }));
expect('Version-mismatch flag → BLOCKED/DENY', mismatchFlag.decision === 'DENY');
expect('Version-mismatch flag → VERSION_MISMATCH reason', mismatchFlag.blockedReasons.includes('F009_PHASE5F_VERSION_MISMATCH'));

const malformedShapeFlag = validateRuntimeFlag(undefined);
expect('Malformed flag input shape → default-deny BLOCKED', malformedShapeFlag.decision === 'DENY');
expect('Malformed flag input shape → SOC audit emitted', malformedShapeFlag.socAudit !== null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`runtime_validator.test.ts: ${fail} assertion(s) failed`);
