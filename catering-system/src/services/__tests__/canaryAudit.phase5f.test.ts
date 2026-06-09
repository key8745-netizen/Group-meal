/**
 * canaryAudit.phase5f.test.ts — Feature 009 Phase 5F additive extensions
 * Pure runner pattern: `npx tsx`, passed/failed counters, throw on failure.
 */
import {
  buildExpectedVsActualDiffPayload,
  evaluateF009Phase5FDryRunDifferenceThreshold,
  buildF009Phase5FDryRunAuditPayload,
  type F009Phase5FDryRunDifferenceInput,
} from '../canaryAudit';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5F: canaryAudit additive extensions ---');

const NOW = '2026-06-08T01:10:00.000Z';

// ── No regression: Phase 5E diff payload builder still present/working ───────
expect('Phase 5E buildExpectedVsActualDiffPayload still importable (no regression)', typeof buildExpectedVsActualDiffPayload === 'function');

// ── Dry-run audit difference threshold: Difference > 0 = Block ───────────────
function diffInput(differenceCount: number): F009Phase5FDryRunDifferenceInput {
  return {
    _kind: 'f009_phase5f_dry_run_difference_input',
    tenantId: 't1', dryRunId: 'dr-1', auditTrailId: 'audit-1', differenceCount, occurredAt: NOW,
  };
}

const zeroDiff = evaluateF009Phase5FDryRunDifferenceThreshold(diffInput(0));
expect('Difference = 0 → allowed (not blocked) in dry-run readiness context', zeroDiff.blocked === false);
expect('Difference = 0 → no production write authorized', zeroDiff.authorizesProductionWrite === false);
expect('Difference = 0 → threshold not configurable', zeroDiff.thresholdConfigurable === false);
expect('Difference = 0 → no blocked reasons', zeroDiff.blockedReasons.length === 0);

const positiveDiff = evaluateF009Phase5FDryRunDifferenceThreshold(diffInput(1));
expect('Difference > 0 → BLOCKED (Difference > 0 = Block)', positiveDiff.blocked === true);
expect('Difference > 0 → AUDIT_DIFFERENCE_DETECTED reason', positiveDiff.blockedReasons.includes('F009_PHASE5F_AUDIT_DIFFERENCE_DETECTED'));
expect('Difference > 0 → DRY_RUN_DIFFERENCE_BLOCK reason', positiveDiff.blockedReasons.includes('F009_PHASE5F_DRY_RUN_DIFFERENCE_BLOCK'));
expect('Difference > 0 → never authorizes production write/mutation', positiveDiff.authorizesProductionWrite === false);

const largeDiff = evaluateF009Phase5FDryRunDifferenceThreshold(diffInput(7));
expect('Larger difference (7) → still BLOCKED', largeDiff.blocked === true);

const malformedDiff = evaluateF009Phase5FDryRunDifferenceThreshold(null);
expect('Malformed diff input → default-deny BLOCKED', malformedDiff.blocked === true);
expect('Malformed diff input → UNKNOWN_STATE_DEFAULT_DENY reason', malformedDiff.blockedReasons.includes('F009_PHASE5F_UNKNOWN_STATE_DEFAULT_DENY'));

const negativeDiff = evaluateF009Phase5FDryRunDifferenceThreshold(diffInput(-1));
expect('Negative difference → default-deny BLOCKED', negativeDiff.blocked === true);

// ── Phase 5F SOC/audit-style payload for dry-run difference decisions ────────
const auditAllow = buildF009Phase5FDryRunAuditPayload({
  tenantId: 't1', operatorId: 'op-1', differenceCount: 0, occurredAt: NOW, traceId: 'trace-1',
});
expect('Audit payload built for difference = 0', auditAllow.ok === true);
expect('Audit payload (diff=0) decision ALLOW', auditAllow.payload?.decision === 'ALLOW');
expect('Audit payload (diff=0) never authorizes write', auditAllow.payload?.authorizesProductionWrite === false);

const auditBlock = buildF009Phase5FDryRunAuditPayload({
  tenantId: 't1', operatorId: 'op-1', differenceCount: 3, occurredAt: NOW, traceId: 'trace-2',
});
expect('Audit payload built for difference > 0', auditBlock.ok === true);
expect('Audit payload (diff>0) decision BLOCK', auditBlock.payload?.decision === 'BLOCK');
expect('Audit payload (diff>0) blockedReason DRY_RUN_DIFFERENCE_BLOCK', auditBlock.payload?.blockedReason === 'F009_PHASE5F_DRY_RUN_DIFFERENCE_BLOCK');
for (const field of ['eventType', 'tenantId', 'operatorId', 'decision', 'blockedReason', 'source', 'occurredAt', 'traceId', 'version', 'expectedState', 'observedState']) {
  expect(`Audit payload contains required SOC field "${field}"`, auditBlock.payload != null && field in auditBlock.payload);
}

const auditMalformed = buildF009Phase5FDryRunAuditPayload(null);
expect('Malformed audit payload input → not ok', auditMalformed.ok === false && auditMalformed.payload === null);
expect('Malformed audit payload input → AUDIT_PAYLOAD_INCOMPLETE reason', auditMalformed.blockedReasons.includes('F009_PHASE5F_AUDIT_PAYLOAD_INCOMPLETE'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`canaryAudit.phase5f.test.ts: ${fail} assertion(s) failed`);
