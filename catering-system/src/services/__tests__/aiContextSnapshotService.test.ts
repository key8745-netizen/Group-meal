/**
 * aiContextSnapshotService.test.ts
 *
 * Validation tests for createSnapshotCacheKey() and createAIContextSnapshot().
 * Run with: npx tsx src/services/__tests__/aiContextSnapshotService.test.ts
 */

import {
  createSnapshotCacheKey,
  createAIContextSnapshot,
  SNAPSHOT_TTL_MS,
  SUMMARY_MODE_RECORD_LIMIT,
} from '../aiContextSnapshotService';
import { validateSnapshotForSuggestion } from '../aiSnapshotValidationService';
import { buildAIContextSummary } from '../aiContextSummaryService';
import type { TenantId, AIContextSummary } from '../../types/aiBoundary';

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
  const snap = createAIContextSnapshot({
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: makeBaseSummary(),
    sourceCollections: ['inventory', 'mealPlans'],
    recordCounts: { inventory: 10, mealPlans: 5 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
  });
  check('expiresAt = now + 4h', snap.expiresAt.getTime(), NOW.getTime() + SNAPSHOT_TTL_MS);
  checkTrue('snapshotId starts with snap_', snap.snapshotId.startsWith('snap_'));
}

// ── debug snapshot is created but not usable for suggestion ──────────────────
{
  const snap = createAIContextSnapshot({
    tenantId: TENANT, mode: 'debug', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: makeBaseSummary(),
    sourceCollections: ['inventory'],
    recordCounts: { inventory: 5 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
  });
  check('debug snapshot: mode = debug', snap.mode, 'debug');
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('debug snapshot: not allowed for suggestion', v.allowed, false);
  checkTrue('debug snapshot: SNAPSHOT_DEBUG_NOT_ALLOWED', v.blockedReasons.includes('SNAPSHOT_DEBUG_NOT_ALLOWED'));
}

// ── sourceCollections includes ocr_staging → contaminationDetected ────────────
{
  const snap = createAIContextSnapshot({
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: makeBaseSummary(),
    sourceCollections: ['inventory', 'ocr_staging'],
    recordCounts: { inventory: 5, ocr_staging: 3 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
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
  const largeCounts = { inventory: SUMMARY_MODE_RECORD_LIMIT + 1 };
  const snap = createAIContextSnapshot({
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: makeBaseSummary(),
    sourceCollections: ['inventory'],
    recordCounts: largeCounts,
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
  });
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('recordCounts > 500 summary: blocked', v.allowed, false);
  checkTrue('recordCounts > 500 summary: SNAPSHOT_TOO_LARGE', v.blockedReasons.includes('SNAPSHOT_TOO_LARGE'));
}

// ── pending_menu_imports also triggers contamination ─────────────────────────
{
  const snap = createAIContextSnapshot({
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: makeBaseSummary(),
    sourceCollections: ['inventory', 'pending_menu_imports'],
    recordCounts: { inventory: 5 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
  });
  check('pending_menu_imports: contaminationDetected = true', snap.contaminationDetected, true);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiContextSnapshotService verified');
