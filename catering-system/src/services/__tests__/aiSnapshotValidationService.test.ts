/**
 * aiSnapshotValidationService.test.ts
 *
 * Validation tests for validateSnapshotForSuggestion().
 * Run with: npx tsx src/services/__tests__/aiSnapshotValidationService.test.ts
 */

import { createAIContextSnapshot } from '../aiContextSnapshotService';
import { validateSnapshotForSuggestion } from '../aiSnapshotValidationService';
import { buildAIContextSummary } from '../aiContextSummaryService';
import type { TenantId, AIContextSnapshot } from '../../types/aiBoundary';

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

function makeCleanSummary() {
  return buildAIContextSummary({
    tenantId: TENANT, now: NOW,
    activeMealPlans: [], menus: [], inventoryItems: [],
    recentPurchaseOrders: [], performanceLogs: [],
    settings: { tenantId: TENANT },
  });
}

function makeSnap(overrides: Partial<Parameters<typeof createAIContextSnapshot>[0]> = {}) {
  return createAIContextSnapshot({
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: makeCleanSummary(),
    sourceCollections: ['inventory', 'mealPlans'],
    recordCounts: { inventory: 10, mealPlans: 5 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
    ...overrides,
  });
}

console.log('\n── aiSnapshotValidationService ────────────────────────────────');

// ── valid snapshot → allowed ──────────────────────────────────────────────────
{
  const v = validateSnapshotForSuggestion(makeSnap(), NOW);
  check('valid snapshot: allowed', v.allowed, true);
  check('valid snapshot: no blocked', v.blockedReasons, []);
}

// ── expired snapshot → EXPIRED_SNAPSHOT ──────────────────────────────────────
{
  const snap = makeSnap();
  const pastNow = new Date(snap.expiresAt.getTime() + 1);
  const v = validateSnapshotForSuggestion(snap, pastNow);
  check('expired snapshot: not allowed', v.allowed, false);
  checkTrue('expired snapshot: EXPIRED_SNAPSHOT', v.blockedReasons.includes('EXPIRED_SNAPSHOT'));
}

// ── debug snapshot → SNAPSHOT_DEBUG_NOT_ALLOWED ───────────────────────────────
{
  const snap = makeSnap({ mode: 'debug' });
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('debug snapshot: not allowed', v.allowed, false);
  checkTrue('debug snapshot: SNAPSHOT_DEBUG_NOT_ALLOWED', v.blockedReasons.includes('SNAPSHOT_DEBUG_NOT_ALLOWED'));
}

// ── contaminated → UNVERIFIED_OR_CONTAMINATED_SOURCE ─────────────────────────
{
  const snap = makeSnap({ contaminationDetected: true, contaminationReasons: ['UNVERIFIED_OR_CONTAMINATED_SOURCE'] });
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('contaminated: not allowed', v.allowed, false);
  checkTrue('contaminated: UNVERIFIED_OR_CONTAMINATED_SOURCE', v.blockedReasons.includes('UNVERIFIED_OR_CONTAMINATED_SOURCE'));
}

// ── missing summary → INCOMPLETE_BOM ─────────────────────────────────────────
{
  const snap = makeSnap();
  const snapNoSummary: AIContextSnapshot = { ...snap, summary: undefined };
  const v = validateSnapshotForSuggestion(snapNoSummary, NOW);
  check('missing summary: not allowed', v.allowed, false);
  checkTrue('missing summary: INCOMPLETE_BOM', v.blockedReasons.includes('INCOMPLETE_BOM'));
}

// ── summary has blockedReasons → propagated ───────────────────────────────────
{
  const dirtySummary = { ...makeCleanSummary(), blockedReasons: ['MISSING_INGREDIENT_ID' as const] };
  const snap = makeSnap({ summary: dirtySummary });
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('summary with blockedReasons: not allowed', v.allowed, false);
  checkTrue('summary with blockedReasons: MISSING_INGREDIENT_ID propagated',
    v.blockedReasons.includes('MISSING_INGREDIENT_ID'));
}

// ── SNAPSHOT_TOO_LARGE ────────────────────────────────────────────────────────
{
  const snap = makeSnap({ recordCounts: { inventory: 600 } }); // > 500 limit
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('too large: not allowed', v.allowed, false);
  checkTrue('too large: SNAPSHOT_TOO_LARGE', v.blockedReasons.includes('SNAPSHOT_TOO_LARGE'));
}

// ── missing tenantId → MISSING_TENANT_ID ─────────────────────────────────────
{
  const snap = makeSnap();
  const snapNoTenant: AIContextSnapshot = { ...snap, tenantId: '' as TenantId };
  const v = validateSnapshotForSuggestion(snapNoTenant, NOW);
  check('missing tenantId: not allowed', v.allowed, false);
  checkTrue('missing tenantId: MISSING_TENANT_ID', v.blockedReasons.includes('MISSING_TENANT_ID'));
}

// ── summary warnings propagated ───────────────────────────────────────────────
{
  const warnSummary = { ...makeCleanSummary(), warnings: ['LEGACY_KG_FALLBACK_USED' as const] };
  const snap = makeSnap({ summary: warnSummary });
  const v = validateSnapshotForSuggestion(snap, NOW);
  check('summary warnings: allowed (warnings only)', v.allowed, true);
  checkTrue('summary warnings: LEGACY_KG_FALLBACK_USED in warnings', v.warnings.includes('LEGACY_KG_FALLBACK_USED'));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiSnapshotValidationService verified');
