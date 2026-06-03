/**
 * aiContextSnapshotService.test.ts
 *
 * Validation tests for createSnapshotCacheKey(), createAIContextSnapshot(),
 * and generateAIContextSnapshot() (the authorised entry point).
 * Run with: npx tsx src/services/__tests__/aiContextSnapshotService.test.ts
 */

import {
  createSnapshotCacheKey,
  createAIContextSnapshot,
  generateAIContextSnapshot,
  SNAPSHOT_TTL_MS,
  SUMMARY_MODE_RECORD_LIMIT,
} from '../aiContextSnapshotService';
import { validateSnapshotForSuggestion } from '../aiSnapshotValidationService';
import { buildAIContextSummary } from '../aiContextSummaryService';
import { AIOperationBlockedError } from '../aiBoundaryService';
import type { TenantId, AIContextSummary, AIOperationRequest } from '../../types/aiBoundary';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else {
    console.error(`  ❌ ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}
function checkTrue(label: string, v: boolean): void { check(label, v, true); }
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

const TENANT = 'tenant-abc' as TenantId;
const NOW = new Date('2026-06-03T12:00:00.000Z');
const D_START = new Date('2026-06-01T00:00:00.000Z');
const D_END   = new Date('2026-06-07T00:00:00.000Z');

function makeBaseSummary(): AIContextSummary {
  return buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [],
    menus: [],
    inventoryItems: [],
    recentPurchaseOrders: [],
    performanceLogs: [],
    settings: { tenantId: TENANT },
  });
}

function makeBaseOperation(overrides: Partial<AIOperationRequest> = {}): AIOperationRequest {
  return {
    operationId:       'op-snap-001',
    tenantId:          TENANT,
    callerType:        'system',
    callerId:          'snapshot-service',
    targetCollection:  'ai_context_snapshots',
    targetPath:        'ai_context_snapshots/snap-001',
    action:            'create',
    payloadSummary:    { tenantId: TENANT },
    requestId:         'req-snap-001',
    createdAt:         NOW,
    ...overrides,
  };
}

function makeBaseInput() {
  return {
    tenantId: TENANT, mode: 'summary' as const, now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: makeBaseSummary(),
    sourceCollections: ['inventory', 'mealPlans'],
    recordCounts: { inventory: 10, mealPlans: 5 },
    contaminationDetected: false,
    contaminationReasons: [] as import('../../types/aiBoundary').BlockedReason[],
    createdBy: 'system' as const,
  };
}

console.log('\n── aiContextSnapshotService ───────────────────────────────────');

// ── cache key includes tenantId + mode + dateRange ────────────────────────────
{
  const key = createSnapshotCacheKey({ tenantId: TENANT, mode: 'summary', dateRangeStart: D_START, dateRangeEnd: D_END });
  checkTrue('cacheKey includes tenantId', key.includes(TENANT));
  checkTrue('cacheKey includes mode', key.includes('summary'));
  checkTrue('cacheKey includes dateRangeStart', key.includes(D_START.toISOString()));
  checkTrue('cacheKey includes dateRangeEnd', key.includes(D_END.toISOString()));
}

// ── different tenants produce different cache keys ────────────────────────────
{
  const k1 = createSnapshotCacheKey({ tenantId: 'tenant-a' as TenantId, mode: 'summary', dateRangeStart: D_START, dateRangeEnd: D_END });
  const k2 = createSnapshotCacheKey({ tenantId: 'tenant-b' as TenantId, mode: 'summary', dateRangeStart: D_START, dateRangeEnd: D_END });
  checkTrue('different tenants → different cache keys', k1 !== k2);
}

// ── expiresAt = now + 4 hours ─────────────────────────────────────────────────
{
  const snap = createAIContextSnapshot(makeBaseInput());
  check('expiresAt = now + 4h', snap.expiresAt.getTime(), NOW.getTime() + SNAPSHOT_TTL_MS);
  checkTrue('snapshotId starts with snap_', snap.snapshotId.startsWith('snap_'));
}

// ── debug snapshot is created but not usable for suggestion ──────────────────
{
  const snap = createAIContextSnapshot({ ...makeBaseInput(), mode: 'debug' });
  check('debug snapshot: mode = debug', snap.mode, 'debug');
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('debug snapshot: not allowed for suggestion', v.allowed, false);
  checkTrue('debug snapshot: SNAPSHOT_DEBUG_NOT_ALLOWED', v.blockedReasons.includes('SNAPSHOT_DEBUG_NOT_ALLOWED'));
}

// ── sourceCollections includes ocr_staging → contaminationDetected ────────────
{
  const snap = createAIContextSnapshot({
    ...makeBaseInput(),
    sourceCollections: ['inventory', 'ocr_staging'],
    recordCounts: { inventory: 5, ocr_staging: 3 },
  });
  check('ocr_staging: contaminationDetected = true', snap.contaminationDetected, true);
  checkTrue('ocr_staging: UNVERIFIED_OR_CONTAMINATED_SOURCE in contaminationReasons',
    snap.contaminationReasons.includes('UNVERIFIED_OR_CONTAMINATED_SOURCE'));
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('ocr_staging: validation blocked', v.allowed, false);
  checkTrue('ocr_staging: UNVERIFIED_OR_CONTAMINATED_SOURCE in blockedReasons',
    v.blockedReasons.includes('UNVERIFIED_OR_CONTAMINATED_SOURCE'));
}

// ── recordCounts > 500 in summary mode → BLOCKED ─────────────────────────────
{
  const snap = createAIContextSnapshot({ ...makeBaseInput(), recordCounts: { inventory: SUMMARY_MODE_RECORD_LIMIT + 1 } });
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('recordCounts > 500 summary: blocked', v.allowed, false);
  checkTrue('recordCounts > 500 summary: SNAPSHOT_TOO_LARGE', v.blockedReasons.includes('SNAPSHOT_TOO_LARGE'));
}

// ── pending_menu_imports also triggers contamination ─────────────────────────
{
  const snap = createAIContextSnapshot({ ...makeBaseInput(), sourceCollections: ['inventory', 'pending_menu_imports'] });
  check('pending_menu_imports: contaminationDetected = true', snap.contaminationDetected, true);
}

// ─── generateAIContextSnapshot — unique authorised entry point ────────────────
console.log('\n── generateAIContextSnapshot (authorised entry point) ─────────');

// ── valid operation → snapshot + audit event ──────────────────────────────────
{
  const result = generateAIContextSnapshot(makeBaseOperation(), makeBaseInput());
  checkTrue('generate: snapshot returned', !!result.snapshot);
  checkTrue('generate: auditEvent returned', !!result.auditEvent);
  check('generate: auditEvent.eventType = SNAPSHOT_GENERATED', result.auditEvent.eventType, 'SNAPSHOT_GENERATED');
  check('generate: auditEvent.actorType = system', result.auditEvent.actorType, 'system');
  check('generate: auditEvent.eventVersion = 1', result.auditEvent.eventVersion, 1);
  checkTrue('generate: auditEvent.eventHash present', result.auditEvent.eventHash.length > 0);
  check('generate: metadata.tenantId', (result.auditEvent.metadata as Record<string, unknown>)?.tenantId, TENANT);
}

// ── missing callerType → throws AIOperationBlockedError ──────────────────────
{
  checkThrows('generate: missing callerType → throws', () => {
    const op = makeBaseOperation();
    (op as unknown as Record<string, unknown>)['callerType'] = undefined;
    generateAIContextSnapshot(op, makeBaseInput());
  });
}

// ── missing tenantId → throws ─────────────────────────────────────────────────
{
  checkThrows('generate: missing tenantId → throws', () =>
    generateAIContextSnapshot(makeBaseOperation({ tenantId: '' }), makeBaseInput()),
  );
}

// ── missing requestId → throws ────────────────────────────────────────────────
{
  checkThrows('generate: missing requestId → throws', () =>
    generateAIContextSnapshot(makeBaseOperation({ requestId: '' }), makeBaseInput()),
  );
}

// ── missing callerId → throws ─────────────────────────────────────────────────
{
  checkThrows('generate: missing callerId → throws', () =>
    generateAIContextSnapshot(makeBaseOperation({ callerId: '' }), makeBaseInput()),
  );
}

// ── summary with UNVERIFIED_OCR_SOURCE → promotes contaminationDetected ──────
{
  const ocrSummary = buildAIContextSummary({
    tenantId: TENANT, now: NOW,
    activeMealPlans: [],
    menus: [],
    inventoryItems: [{ ingredientId: 'beef', currentStockKg: 5, isOcr: true, verified: false }],
    recentPurchaseOrders: [],
    performanceLogs: [],
    settings: { tenantId: TENANT },
  });
  const result = generateAIContextSnapshot(makeBaseOperation(), { ...makeBaseInput(), summary: ocrSummary });
  check('OCR summary: contaminationDetected promoted', result.snapshot.contaminationDetected, true);
  checkTrue('OCR summary: UNVERIFIED_OR_CONTAMINATED_SOURCE in contaminationReasons',
    result.snapshot.contaminationReasons.includes('UNVERIFIED_OR_CONTAMINATED_SOURCE'));
}

// ── snapshot does NOT contain raw data fields ─────────────────────────────────
{
  const snap = generateAIContextSnapshot(makeBaseOperation(), makeBaseInput()).snapshot;
  const snapKeys = Object.keys(snap);
  const forbidden = ['transactions', 'performanceLogs', 'purchaseOrders', 'ocrText', 'rawBOM', 'customerData'];
  for (const field of forbidden) {
    check(`snapshot has no raw field: ${field}`, snapKeys.includes(field), false);
  }
}

// ── error is AIOperationBlockedError with blockedReasons ──────────────────────
{
  try {
    generateAIContextSnapshot(makeBaseOperation({ tenantId: '' }), makeBaseInput());
    console.error('  ❌ should have thrown');
    failed++;
  } catch (err) {
    if (err instanceof AIOperationBlockedError && err.blockedReasons.includes('MISSING_TENANT_ID')) {
      console.log('  ✅ AIOperationBlockedError with MISSING_TENANT_ID');
      passed++;
    } else {
      console.error(`  ❌ wrong error type or reasons: ${(err as Error).message}`);
      failed++;
    }
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiContextSnapshotService verified');
