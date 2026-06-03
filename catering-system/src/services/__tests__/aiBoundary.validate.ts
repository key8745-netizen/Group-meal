/**
 * aiBoundary.validate.ts
 *
 * Runnable validation examples for Phase 1 AI Decision Boundary services.
 * No test framework required — runs with tsx.
 *
 * Usage:
 *   npx tsx src/services/__tests__/aiBoundary.validate.ts
 *
 * Each section mirrors the Spec v1.3 acceptance criteria.
 * Output: PASS / FAIL per case with reason on failure.
 */

import {
  GRAMS_PER_KG,
  GRAMS_PER_TAIJIN,
  taijinToGrams,
  kgToGrams,
  gramsToKg,
  gramsToTaijin,
  toGrams,
  assertKnownUnit,
  assertIntegerGrams,
  asGrams,
  isGrams,
} from '../unitConversionService';

import {
  readQuantityAsGrams,
  canUseForAISuggestion,
} from '../quantityMigrationHelper';

import {
  validateOperation,
  validateAIOperationOrThrow,
  AIOperationBlockedError,
} from '../aiBoundaryService';

import {
  createAuditEvent,
  validateAuditAppend,
  computeAuditEventHash,
} from '../aiAuditTrailHelper';

import type { Grams } from '../../types/aiBoundary';

// ─── Mini test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function checkThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    console.error(`  ❌ ${label} — expected throw but did not throw`);
    failed++;
  } catch (err) {
    console.log(`  ✅ ${label} (threw: ${(err as Error).message.slice(0, 80)})`);
    passed++;
  }
}

function checkThrowsType<T extends Error>(
  label: string,
  fn: () => unknown,
  check_: (err: T) => boolean,
): void {
  try {
    fn();
    console.error(`  ❌ ${label} — expected throw but did not throw`);
    failed++;
  } catch (err) {
    if (check_(err as T)) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.error(`  ❌ ${label} — threw but check failed: ${(err as Error).message}`);
      failed++;
    }
  }
}

// ─── 1. unitConversionService ─────────────────────────────────────────────────

console.log('\n── unitConversionService ──────────────────────────────────────');

// Constants
check('GRAMS_PER_KG === 1000', GRAMS_PER_KG, 1000);
check('GRAMS_PER_TAIJIN === 600', GRAMS_PER_TAIJIN, 600);

// taijinToGrams
check('1 台斤 = 600 grams', taijinToGrams(1), 600);
check('0.5 台斤 = 300 grams', taijinToGrams(0.5), 300);
check('2 台斤 = 1200 grams', taijinToGrams(2), 1200);
check('1.5 台斤 = 900 grams', taijinToGrams(1.5), 900);

// kgToGrams
check('1 kg = 1000 grams', kgToGrams(1), 1000);
check('0.5 kg = 500 grams', kgToGrams(0.5), 500);
check('1.2345 kg rounds to 1235 grams', kgToGrams(1.2345), 1235);

// gramsToKg (display)
check('1000 grams → 1 kg', gramsToKg(1000 as Grams), 1);
check('600 grams → 0.6 kg', gramsToKg(600 as Grams), 0.6);

// gramsToTaijin (display)
check('600 grams → 1 台斤', gramsToTaijin(600 as Grams), 1);
check('300 grams → 0.5 台斤', gramsToTaijin(300 as Grams), 0.5);

// toGrams dispatch
check('toGrams(1, kg) = 1000', toGrams(1, 'kg'), 1000);
check('toGrams(1, taijin) = 600', toGrams(1, 'taijin'), 600);
check('toGrams(500, grams) = 500', toGrams(500, 'grams'), 500);

// Unknown unit
checkThrows('assertKnownUnit throws for unknown unit "pound"', () => assertKnownUnit('pound'));

// Non-integer grams
checkThrows('assertIntegerGrams throws for 1.5', () => assertIntegerGrams(1.5));

// Negative grams
checkThrows('assertIntegerGrams throws for -1', () => assertIntegerGrams(-1));

// Non-integer input to toGrams(unit=grams)
checkThrows('toGrams(1.5, grams) throws — grams must already be integer', () => toGrams(1.5, 'grams'));

// asGrams
check('asGrams(500) = 500', asGrams(500), 500);
checkThrows('asGrams(-1) throws', () => asGrams(-1));
checkThrows('asGrams(1.5) throws', () => asGrams(1.5));
checkThrows('asGrams(NaN) throws', () => asGrams(NaN));
checkThrows('asGrams(Infinity) throws', () => asGrams(Infinity));

// isGrams
check('isGrams(500) = true', isGrams(500), true);
check('isGrams(0) = true', isGrams(0), true);
check('isGrams(-1) = false', isGrams(-1), false);
check('isGrams(1.5) = false', isGrams(1.5), false);
check('isGrams(NaN) = false', isGrams(NaN), false);
check('isGrams("500") = false', isGrams('500'), false);

// ─── 2. quantityMigrationHelper ───────────────────────────────────────────────

console.log('\n── quantityMigrationHelper ────────────────────────────────────');

// Case A: only grams
{
  const r = readQuantityAsGrams({ grams: 600, fieldName: 'testField' });
  check('only grams: valueGrams = 600', r.valueGrams, 600);
  check('only grams: no blocked', r.blockedReasons, []);
  check('only grams: no fallback', r.usedLegacyFallback, false);
  check('only grams: canUseForAISuggestion = true', canUseForAISuggestion(r), true);
}

// Case B: only kg → fallback + BLOCKED for AI
{
  const r = readQuantityAsGrams({ kg: 1, fieldName: 'testField' });
  check('only kg: valueGrams = 1000', r.valueGrams, 1000);
  check('only kg: blockedReasons has LEGACY_KG_FALLBACK_USED', r.blockedReasons.includes('LEGACY_KG_FALLBACK_USED'), true);
  check('only kg: blockedReasons has LEGACY_QUANTITY_BLOCKED_FOR_AI', r.blockedReasons.includes('LEGACY_QUANTITY_BLOCKED_FOR_AI'), true);
  check('only kg: LEGACY_KG_FALLBACK_USED warning', r.warnings, ['LEGACY_KG_FALLBACK_USED']);
  check('only kg: usedLegacyFallback = true', r.usedLegacyFallback, true);
  check('only kg: canUseForAISuggestion = false', canUseForAISuggestion(r), false);
}

// Case C: grams + kg consistent (1 kg → 1000 g, stored grams = 1000)
{
  const r = readQuantityAsGrams({ grams: 1000, kg: 1, fieldName: 'testField' });
  check('grams+kg consistent: valueGrams = 1000', r.valueGrams, 1000);
  check('grams+kg consistent: no blocked', r.blockedReasons, []);
  check('grams+kg consistent: no fallback', r.usedLegacyFallback, false);
  check('grams+kg consistent: canUseForAISuggestion = true', canUseForAISuggestion(r), true);
}

// Case D: grams + kg inconsistent (1 kg → 1000 g, but stored grams = 500)
{
  const r = readQuantityAsGrams({ grams: 500, kg: 1, fieldName: 'testField' });
  check('grams+kg mismatch: valueGrams undefined', r.valueGrams, undefined);
  check('grams+kg mismatch: UNIT_MIGRATION_MISMATCH', r.blockedReasons, ['UNIT_MIGRATION_MISMATCH']);
  check('grams+kg mismatch: canUseForAISuggestion = false', canUseForAISuggestion(r), false);
}

// Case E: neither grams nor kg
{
  const r = readQuantityAsGrams({ fieldName: 'testField' });
  check('missing both: valueGrams undefined', r.valueGrams, undefined);
  check('missing both: MISSING_GRAMS_FIELD', r.blockedReasons, ['MISSING_GRAMS_FIELD']);
  check('missing both: canUseForAISuggestion = false', canUseForAISuggestion(r), false);
}

// ─── 3. aiBoundaryService ─────────────────────────────────────────────────────

console.log('\n── aiBoundaryService ──────────────────────────────────────────');

type OpRequest = Parameters<typeof validateOperation>[0];

function makeBaseRequest(overrides: Partial<OpRequest> = {}): OpRequest {
  return {
    operationId:       'op-001',
    tenantId:          'tenant-abc',
    callerType:        'ai',
    callerId:          'ai-service-001',
    targetCollection:  'ai_suggestions',
    targetPath:        'ai_suggestions/doc001',
    action:            'create',
    payloadSummary:    { tenantId: 'tenant-abc' },
    sourceSnapshotId:  'snap-001',
    auditTrailId:      'audit-001',
    suggestionId:      'sug-001',
    requestId:         'req-001',
    createdAt:         new Date(),
    ...overrides,
  };
}

// AI writing to inventory → BLOCKED
{
  const r = validateOperation(makeBaseRequest({
    targetCollection: 'inventory',
    targetPath:       'inventory/carrot',
    action:           'update',
    payloadSummary:   { tenantId: 'tenant-abc', currentStockGrams: 5000 },
  }));
  check('AI → inventory: not allowed', r.allowed, false);
  check('AI → inventory: AI_FORBIDDEN_WRITE_ATTEMPT', r.blockedReasons.includes('AI_FORBIDDEN_WRITE_ATTEMPT'), true);
}

// AI writing to settings → BLOCKED
{
  const r = validateOperation(makeBaseRequest({
    targetCollection: 'settings',
    targetPath:       'settings/tenant-abc',
    action:           'update',
    payloadSummary:   { tenantId: 'tenant-abc', threshold: 0.1 },
  }));
  check('AI → settings: not allowed', r.allowed, false);
  check('AI → settings: AI_FORBIDDEN_WRITE_ATTEMPT', r.blockedReasons.includes('AI_FORBIDDEN_WRITE_ATTEMPT'), true);
}

// AI creating ai_suggestions, missing sourceSnapshotId → BLOCKED with MISSING_SNAPSHOT_ID
{
  const r = validateOperation(makeBaseRequest({
    sourceSnapshotId: undefined,
    auditTrailId:     'audit-001',
  }));
  check('AI create suggestion, no snapshotId: not allowed', r.allowed, false);
  check('AI create suggestion, no snapshotId: MISSING_SNAPSHOT_ID', r.blockedReasons.includes('MISSING_SNAPSHOT_ID'), true);
}

// AI creating ai_suggestions, missing auditTrailId → BLOCKED with MISSING_AUDIT_TRAIL_ID
{
  const r = validateOperation(makeBaseRequest({
    sourceSnapshotId: 'snap-001',
    auditTrailId:     undefined,
  }));
  check('AI create suggestion, no auditTrailId: not allowed', r.allowed, false);
  check('AI create suggestion, no auditTrailId: MISSING_AUDIT_TRAIL_ID', r.blockedReasons.includes('MISSING_AUDIT_TRAIL_ID'), true);
}

// AI create ai_suggestions, tenantId consistent, snapshotId + auditTrailId present → ALLOWED
{
  const r = validateOperation(makeBaseRequest());
  check('AI create ai_suggestion (valid): allowed', r.allowed, true);
  check('AI create ai_suggestion (valid): no blocked', r.blockedReasons, []);
}

// Tenant mismatch
{
  const r = validateOperation(makeBaseRequest({
    payloadSummary: { tenantId: 'tenant-OTHER' },
  }));
  check('Tenant mismatch: not allowed', r.allowed, false);
  check('Tenant mismatch: TENANT_MISMATCH', r.blockedReasons.includes('TENANT_MISMATCH'), true);
}

// Missing callerType
{
  const req = makeBaseRequest();
  (req as unknown as Record<string, unknown>)['callerType'] = undefined;
  const r = validateOperation(req);
  check('Missing callerType: not allowed', r.allowed, false);
  check('Missing callerType: MISSING_CALLER_TYPE', r.blockedReasons.includes('MISSING_CALLER_TYPE'), true);
}

// Forbidden field in payload (currentStockGrams)
{
  const r = validateOperation(makeBaseRequest({
    payloadSummary: { tenantId: 'tenant-abc', currentStockGrams: 9000 },
  }));
  check('Forbidden field currentStockGrams: not allowed', r.allowed, false);
  check('Forbidden field: FORBIDDEN_FIELD_IN_PAYLOAD', r.blockedReasons.includes('FORBIDDEN_FIELD_IN_PAYLOAD'), true);
}

// AI setting purchaseOrders.status = RECEIVED → BLOCKED
{
  const r = validateOperation(makeBaseRequest({
    targetCollection: 'purchaseOrders',
    targetPath:       'purchaseOrders/po-001',
    action:           'update',
    payloadSummary:   { tenantId: 'tenant-abc', status: 'RECEIVED' },
  }));
  check('AI → purchaseOrders RECEIVED: not allowed', r.allowed, false);
  check('AI → purchaseOrders RECEIVED: AI_FORBIDDEN_WRITE_ATTEMPT', r.blockedReasons.includes('AI_FORBIDDEN_WRITE_ATTEMPT'), true);
}

// AI creating audit trail (no snapshotId/auditTrailId required for first event)
{
  const r = validateOperation(makeBaseRequest({
    targetCollection:  'ai_audit_trails',
    targetPath:        'ai_audit_trails/trail-001',
    action:            'create',
    sourceSnapshotId:  undefined,
    auditTrailId:      undefined,
    payloadSummary:    { tenantId: 'tenant-abc', status: 'SUGGESTED' },
  }));
  check('AI create audit trail (first event): allowed', r.allowed, true);
}

// draft_purchase_suggestions without suggestionId → BLOCKED
{
  const r = validateOperation(makeBaseRequest({
    targetCollection: 'draft_purchase_suggestions',
    targetPath:       'draft_purchase_suggestions/draft-001',
    suggestionId:     undefined,
  }));
  check('draft_purchase_suggestions, no suggestionId: not allowed', r.allowed, false);
  check('draft_purchase_suggestions, no suggestionId: MISSING_AUDIT_TRAIL_ID', r.blockedReasons.includes('MISSING_AUDIT_TRAIL_ID'), true);
}

// validateAIOperationOrThrow — throws on blocked operation
{
  checkThrowsType<AIOperationBlockedError>(
    'validateAIOperationOrThrow throws AIOperationBlockedError on forbidden collection',
    () => validateAIOperationOrThrow(makeBaseRequest({
      targetCollection: 'inventory',
      targetPath:       'inventory/carrot',
      action:           'update',
      payloadSummary:   { tenantId: 'tenant-abc' },
    })),
    (err) => err instanceof AIOperationBlockedError && err.blockedReasons.includes('AI_FORBIDDEN_WRITE_ATTEMPT'),
  );
}

// validateAIOperationOrThrow — does NOT throw on allowed operation
{
  try {
    validateAIOperationOrThrow(makeBaseRequest());
    console.log('  ✅ validateAIOperationOrThrow does not throw for valid request');
    passed++;
  } catch {
    console.error('  ❌ validateAIOperationOrThrow should not throw for valid request');
    failed++;
  }
}

// ─── 4. aiAuditTrailHelper ────────────────────────────────────────────────────

console.log('\n── aiAuditTrailHelper ─────────────────────────────────────────');

// computeAuditEventHash — deterministic
{
  const event = {
    eventType:    'SUGGESTION_GENERATED',
    actorType:    'ai' as const,
    actorId:      'ai-001',
    at:           new Date('2026-06-03T00:00:00.000Z'),
    eventVersion: 1,
  };
  const h1 = computeAuditEventHash(event);
  const h2 = computeAuditEventHash(event);
  check('computeAuditEventHash is deterministic', h1, h2);
  check('computeAuditEventHash returns 8-char hex string', /^[0-9a-f]{8}$/.test(h1), true);
}

// createAuditEvent — builds complete event with hash
{
  const evt = createAuditEvent({
    eventType:    'SUGGESTION_GENERATED',
    actorType:    'ai',
    actorId:      'ai-service-001',
    at:           new Date('2026-06-03T00:00:00.000Z'),
    eventVersion: 1,
    toState:      'SUGGESTED',
  });
  check('createAuditEvent: eventVersion correct', evt.eventVersion, 1);
  check('createAuditEvent: eventHash present', typeof evt.eventHash === 'string' && evt.eventHash.length > 0, true);
  check('createAuditEvent: actorType correct', evt.actorType, 'ai');
}

// validateAuditAppend — first event (empty trail)
{
  const evt = createAuditEvent({
    eventType:    'SUGGESTION_GENERATED',
    actorType:    'ai',
    actorId:      'ai-001',
    at:           new Date(),
    eventVersion: 1,
  });
  const r = validateAuditAppend({ existingEvents: [], newEvent: evt });
  check('validateAuditAppend: first event allowed', r.allowed, true);
  check('validateAuditAppend: first event no blocked', r.blockedReasons, []);
}

// validateAuditAppend — version conflict
{
  const evt = createAuditEvent({
    eventType:    'HUMAN_OVERRIDE',
    actorType:    'human',
    actorId:      'user-001',
    at:           new Date(),
    eventVersion: 5, // wrong — should be 2
  });
  const first = createAuditEvent({ eventType: 'SUGGESTION_GENERATED', actorType: 'ai', actorId: 'ai-001', at: new Date(), eventVersion: 1 });
  const r = validateAuditAppend({ existingEvents: [first], newEvent: evt });
  check('validateAuditAppend: version conflict blocked', r.allowed, false);
  check('validateAuditAppend: AUDIT_VERSION_CONFLICT', r.blockedReasons.includes('AUDIT_VERSION_CONFLICT'), true);
}

// validateAuditAppend — hash mismatch
{
  const first = createAuditEvent({ eventType: 'SUGGESTION_GENERATED', actorType: 'ai', actorId: 'ai-001', at: new Date(), eventVersion: 1 });
  const second = createAuditEvent({
    eventType:         'HUMAN_OVERRIDE',
    actorType:         'human',
    actorId:           'user-001',
    at:                new Date(),
    eventVersion:      2,
    previousEventHash: 'deadbeef', // wrong hash
  });
  const r = validateAuditAppend({ existingEvents: [first], newEvent: second });
  check('validateAuditAppend: hash mismatch blocked', r.allowed, false);
  check('validateAuditAppend: AUDIT_HASH_MISMATCH', r.blockedReasons.includes('AUDIT_HASH_MISMATCH'), true);
}

// validateAuditAppend — valid second event with correct previousEventHash
{
  const first = createAuditEvent({ eventType: 'SUGGESTION_GENERATED', actorType: 'ai', actorId: 'ai-001', at: new Date('2026-06-03T00:00:00.000Z'), eventVersion: 1 });
  const second = createAuditEvent({
    eventType:         'HUMAN_OVERRIDE',
    actorType:         'human',
    actorId:           'user-001',
    at:                new Date('2026-06-03T01:00:00.000Z'),
    eventVersion:      2,
    previousEventHash: first.eventHash,
  });
  const r = validateAuditAppend({ existingEvents: [first], newEvent: second });
  check('validateAuditAppend: valid chain allowed', r.allowed, true);
  check('validateAuditAppend: valid chain no blocked', r.blockedReasons, []);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('VALIDATION FAILED — Phase 1 Patch not ready');
  throw new Error(`${failed} validation(s) failed`);
} else {
  console.log('VALIDATION PASSED — Phase 1 Patch boundary services verified');
}
