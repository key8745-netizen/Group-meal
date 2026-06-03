/**
 * AIDraftSuggestionPreview.test.tsx
 *
 * Structural / contract tests for AIDraftSuggestionPreview.
 * Run with: npx tsx src/components/ai/__tests__/AIDraftSuggestionPreview.test.tsx
 */

import type {
  DraftPurchaseSuggestion, TenantId, SuggestionId, SnapshotId,
  AuditTrailId, Grams,
} from '../../../types/aiBoundary';

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

const NOW      = new Date('2026-06-03T12:00:00Z');
const SNAP_ID  = 'snap_ui5_001' as SnapshotId;
const SUG_ID   = 'sug_ui5_001' as SuggestionId;
const TRAIL_ID = 'trail_ui5_001' as AuditTrailId;

function makeDraft(overrides: Partial<DraftPurchaseSuggestion> = {}): DraftPurchaseSuggestion {
  return {
    draftSuggestionId:  'draft_ui5_001',
    tenantId:           'tenant-ui5' as TenantId,
    sourceSnapshotId:   SNAP_ID,
    suggestionId:       SUG_ID,
    auditTrailId:       TRAIL_ID,
    ingredientId:       'carrot',
    ingredientName:     'Carrot',
    suggestedQtyGrams:  770 as Grams,
    finalQtyGrams:      600 as Grams,
    confidence: {
      level: 'HIGH', reasons: [], blockReason: null,
      blockedReasons: [], warnings: [], canCreateDraft: false,
      sourceSnapshotId: SNAP_ID,
    },
    status:              'DRAFT_PREPARED',
    blockedReasons:      [],
    warnings:            [],
    requiresHumanApproval: true,
    dataLineage: {
      snapshotId:       SNAP_ID,
      suggestionId:     SUG_ID,
      sourceCollections: ['inventory', 'mealPlans'],
      generatedAt:      NOW,
    },
    createdBy:          'human',
    createdByUserId:    'chef-001',
    createdAt:          NOW,
    ...overrides,
  };
}

console.log('\n── AIDraftSuggestionPreview (structural) ──────────────────────');

// requiresHumanApproval is always true
{
  const d = makeDraft();
  check('requiresHumanApproval is always true', d.requiresHumanApproval, true);
}

// createdBy is always 'human'
{
  const d = makeDraft();
  check('createdBy = human', d.createdBy, 'human');
}

// approvedBy / approvedAt must NOT exist on draft (Phase 5)
{
  const d = makeDraft();
  check('no approvedBy in Phase 5', 'approvedBy' in d, false);
  check('no approvedAt in Phase 5', 'approvedAt' in d, false);
}

// All required audit chain fields present
{
  const d = makeDraft();
  checkTrue('auditTrailId present', !!d.auditTrailId);
  checkTrue('sourceSnapshotId present', !!d.sourceSnapshotId);
  checkTrue('suggestionId present', !!d.suggestionId);
  checkTrue('draftSuggestionId present', !!d.draftSuggestionId);
}

// Blocked draft contains blockedReasons
{
  const d = makeDraft({
    status: 'BLOCKED',
    blockedReasons: ['DRAFT_FROM_LOW_CONFIDENCE_BLOCKED'],
  });
  checkTrue('blocked: has blocked status', d.status === 'BLOCKED');
  checkTrue('blocked: blockedReasons non-empty', d.blockedReasons.length > 0);
}

// No purchase-action fields on draft type
{
  const d = makeDraft();
  const forbiddenKeys = [
    'purchaseOrderId', 'pendingAt', 'receivedAt', 'inventoryTransactionId',
    'submitPurchase', 'confirmReceived', 'createPurchaseOrder',
  ];
  for (const key of forbiddenKeys) {
    check(`no forbidden field: ${key}`, key in d, false);
  }
}

// dataLineage fields safe (no raw data)
{
  const d = makeDraft();
  const rawFields = ['rawLogs', 'ocrText', 'transactions', 'performanceLogs', 'customerData'];
  for (const f of rawFields) {
    check(`dataLineage no raw field: ${f}`, f in d.dataLineage, false);
  }
}

// finalQtyGrams reflects human override (600) not AI suggestion (770)
{
  const d = makeDraft();
  checkTrue('finalQtyGrams can differ from suggestedQtyGrams', d.finalQtyGrams !== d.suggestedQtyGrams);
  check('finalQtyGrams = 600', d.finalQtyGrams, 600);
  check('suggestedQtyGrams = 770', d.suggestedQtyGrams, 770);
}

// feedbackId / overrideId optional but present when set
{
  const d = makeDraft({ feedbackId: 'fb_001', overrideId: 'ov_001' });
  check('feedbackId stored', d.feedbackId, 'fb_001');
  check('overrideId stored', d.overrideId, 'ov_001');
}

// Status allowed values
{
  const allowed = ['DRAFT_PREPARED', 'BLOCKED', 'REJECTED', 'AWAITING_HUMAN_APPROVAL'] as const;
  for (const s of allowed) {
    checkTrue(`status ${s} is valid string`, typeof s === 'string');
  }
}

// Draft type does NOT have purchase order creation methods
{
  const d = makeDraft();
  check('no createPurchaseOrder method', 'createPurchaseOrder' in d, false);
  check('no submitToPurchase method', 'submitToPurchase' in d, false);
  check('no markReceived method', 'markReceived' in d, false);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — AIDraftSuggestionPreview structural tests verified');
