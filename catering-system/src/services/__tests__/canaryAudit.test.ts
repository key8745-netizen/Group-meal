import {
  buildExpectedVsActualDiffPayload,
  evaluateTenantBlockOnDifference,
  buildHaltAuditPayload,
  buildRecoveryAuditPayload,
  buildDryRunAuditPayload,
  summarizeAuditReconciliation,
  type ExpectedVsActualDiffInput,
} from '../canaryAudit';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5E: Canary Audit ---');

const NOW = '2026-06-08T00:15:00.000Z';

// Expected vs Actual — no differences
const noDiffInput: ExpectedVsActualDiffInput = {
  _kind: 'f009_phase5e_expected_vs_actual_diff_input',
  tenantId: 'tenant-1', dryRunId: 'dry-1', auditTrailId: 'audit-1',
  expected: { headCount: 100, dishCount: 5 },
  actual: { headCount: 100, dishCount: 5 },
  occurredAt: NOW,
};
const noDiffResult = buildExpectedVsActualDiffPayload(noDiffInput);
expect('No-diff payload builds ok', noDiffResult.ok === true && noDiffResult.payload !== null);
expect('No-diff → differenceCount 0', noDiffResult.payload?.differenceCount === 0);
expect('No-diff → blocksTenant false', noDiffResult.payload?.blocksTenant === false);

// Expected vs Actual — with differences
const diffInput: ExpectedVsActualDiffInput = {
  _kind: 'f009_phase5e_expected_vs_actual_diff_input',
  tenantId: 'tenant-2', dryRunId: 'dry-2', auditTrailId: 'audit-2',
  expected: { headCount: 100, dishCount: 5 },
  actual: { headCount: 120, dishCount: 5 },
  occurredAt: NOW,
};
const diffResult = buildExpectedVsActualDiffPayload(diffInput);
expect('Diff payload builds ok', diffResult.ok === true);
expect('Diff → differenceCount > 0', (diffResult.payload?.differenceCount ?? 0) > 0);
expect('Diff → blocksTenant true', diffResult.payload?.blocksTenant === true);
expect('Diff → AUDIT_DIFFERENCE_DETECTED reason', diffResult.blockedReasons.includes('F009_PHASE5E_AUDIT_DIFFERENCE_DETECTED'));
expect('Diff → TENANT_BLOCKED_ON_DIFFERENCE reason', diffResult.blockedReasons.includes('F009_PHASE5E_TENANT_BLOCKED_ON_DIFFERENCE'));
expect('Diff entries record field/expected/actual', diffResult.payload?.differences[0]?.field === 'headCount');

// Default-deny on malformed diff input
expect('Malformed diff input → not ok', buildExpectedVsActualDiffPayload(null).ok === false);
expect('Malformed diff input → AUDIT_PAYLOAD_INCOMPLETE', buildExpectedVsActualDiffPayload(null).blockedReasons.includes('F009_PHASE5E_AUDIT_PAYLOAD_INCOMPLETE'));

// Tenant-block-on-difference
const blockResult = evaluateTenantBlockOnDifference(diffResult.payload);
expect('Tenant block when difference > 0', blockResult.blocked === true);
const noBlockResult = evaluateTenantBlockOnDifference(noDiffResult.payload);
expect('No tenant block when difference == 0', noBlockResult.blocked === false);
expect('Malformed diff payload → blocked (default-deny)', evaluateTenantBlockOnDifference(null).blocked === true);

// HALT audit payload
const haltResult = buildHaltAuditPayload({
  tenantId: 'tenant-1', reason: 'load exceeded threshold', observedLoad: 500, threshold: 200,
  auditTrailId: 'audit-halt-1', occurredAt: NOW,
});
expect('HALT audit payload builds ok', haltResult.ok === true);
expect('HALT audit payload eventType HALT', haltResult.payload?.eventType === 'HALT');
expect('HALT audit payload never authorizes write', haltResult.payload?.authorizesProductionWrite === false);
expect('HALT audit payload missing fields → not ok', buildHaltAuditPayload(null).ok === false);

// RECOVERY audit payload
const recoveryAligned = buildRecoveryAuditPayload({
  tenantId: 'tenant-1', localVersion: 7, remoteVersion: 7, auditTrailId: 'audit-rec-1', occurredAt: NOW,
});
expect('Recovery payload (aligned) ok', recoveryAligned.ok === true);
expect('Recovery payload aligned → versionAligned true', recoveryAligned.payload?.versionAligned === true);
expect('Recovery payload aligned → gateResetAllowed true', recoveryAligned.payload?.gateResetAllowed === true);
expect('Recovery payload aligned → no blocked reasons', recoveryAligned.blockedReasons.length === 0);

const recoveryMismatch = buildRecoveryAuditPayload({
  tenantId: 'tenant-1', localVersion: 7, remoteVersion: 8, auditTrailId: 'audit-rec-2', occurredAt: NOW,
});
expect('Recovery payload (mismatch) ok build', recoveryMismatch.ok === true);
expect('Recovery payload mismatch → versionAligned false', recoveryMismatch.payload?.versionAligned === false);
expect('Recovery payload mismatch → gateResetAllowed false', recoveryMismatch.payload?.gateResetAllowed === false);
expect('Recovery payload mismatch → VERSION_ALIGNMENT_MISMATCH', recoveryMismatch.blockedReasons.includes('F009_PHASE5E_VERSION_ALIGNMENT_MISMATCH'));
expect('Recovery payload mismatch → GATE_RESET_BLOCKED', recoveryMismatch.blockedReasons.includes('F009_PHASE5E_GATE_RESET_BLOCKED'));

// DRY_RUN audit payload
const dryRunResult = buildDryRunAuditPayload({
  tenantId: 'tenant-1', dryRunId: 'dry-1', differenceCount: 0, blocksTenant: false,
  auditTrailId: 'audit-dr-1', occurredAt: NOW,
});
expect('Dry-run audit payload ok', dryRunResult.ok === true);
expect('Dry-run audit payload stagingOnly true', dryRunResult.payload?.stagingOnly === true);
expect('Dry-run audit payload never authorizes write', dryRunResult.payload?.authorizesProductionWrite === false);

const dryRunBlockedResult = buildDryRunAuditPayload({
  tenantId: 'tenant-1', dryRunId: 'dry-2', differenceCount: 3, blocksTenant: true,
  auditTrailId: 'audit-dr-2', occurredAt: NOW,
});
expect('Dry-run audit payload with diff → tenant block reasons present', dryRunBlockedResult.blockedReasons.includes('F009_PHASE5E_TENANT_BLOCKED_ON_DIFFERENCE'));

// Audit reconciliation summary — 100% target
const summary = summarizeAuditReconciliation([noDiffResult, diffResult, haltResult, recoveryAligned, dryRunResult]);
expect('Audit reconciliation summary 100% complete', summary.fullyReconciled === true);
expect('Audit reconciliation summary counts match', summary.totalPayloads === 5 && summary.completePayloads === 5);

const partialSummary = summarizeAuditReconciliation([noDiffResult, buildExpectedVsActualDiffPayload(null)]);
expect('Audit reconciliation summary not fully reconciled with incomplete payload', partialSummary.fullyReconciled === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`canaryAudit.test.ts: ${fail} assertion(s) failed`);
