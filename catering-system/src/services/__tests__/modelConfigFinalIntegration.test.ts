/**
 * Feature 004 Phase 4 — Final Dry-run Integration Test
 *
 * Verifies the full pipeline:
 *   Feature 003 ModelConfigRecommendation
 *   → createSimulatedHumanApproval()
 *   → createApplyPlanFromRecommendation()
 *   → createRollbackPlanFromApplyPlan()
 *   + audit event
 *
 * All outputs must remain non-executable (dry-run only).
 * No Firestore. No real apply. No real rollback.
 */

import {
  createSimulatedHumanApproval,
  createApplyPlanFromRecommendation,
  createRollbackPlanFromApplyPlan,
} from '../modelConfigRecommendationApplyAdapterService';
import { generateApplyToken, generateRollbackToken, hashWeights } from '../modelConfigDiffService';
import {
  asConfigVersion,
  asModelConfigRecommendationId,
  asDiffHash,
} from '../../types/modelConfigApply';
import type {
  ModelConfigVersion,
  SimulatedHumanModelConfigApproval,
  ModelConfigApplyPlan,
  ModelConfigRollbackPlan,
} from '../../types/modelConfigApply';
import type { ModelConfigRecommendation } from '../../types/predictionEngine';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT = 'tenant-acme' as TenantId;
const AUDIT_ID = 'audit-trail-001' as AuditTrailId;
const V1 = asConfigVersion('v1');
const V2 = asConfigVersion('v2');
const REC_ID = asModelConfigRecommendationId('rec-feature003-001');
const NOW = new Date('2026-06-04T00:00:00.000Z');

const CURRENT_WEIGHTS = {
  historicalUsageWeight: 1.0,
  wasteRiskWeight: 1.0,
  receivingDeltaWeight: 1.0,
  safetyStockWeight: 1.0,
};

const CURRENT_CONFIG: ModelConfigVersion = {
  version: V1,
  tenantId: TENANT,
  weights: CURRENT_WEIGHTS,
  weightMode: 'independent_multiplier',
  createdAt: NOW,
  createdByHumanUserId: 'admin-user',
  auditTrailId: AUDIT_ID,
  sourceRecommendationId: null,
  configHash: hashWeights(CURRENT_WEIGHTS),
};

// Feature 003 recommendation (always aiCanApply=false, requiresHumanApproval=true)
const RECOMMENDATION: ModelConfigRecommendation = {
  _kind: 'recommendation',
  recommendationId: REC_ID as string,
  tenantId: TENANT,
  auditTrailId: AUDIT_ID,
  proposedWeights: {
    historicalUsageWeight: 1.2,
    wasteRiskWeight: 0.8,
    receivingDeltaWeight: 1.1,
  },
  rationale: ['usage trend indicates weight adjustment needed'],
  blockedReasons: [],
  warnings: [],
  aiCanApply: false,
  requiresHumanApproval: true,
  createdAt: NOW,
};

let pass = 0;
let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 004 Final Dry-run Integration ---');

// ─── Step 1: Feature 003 recommendation guard invariants ──────────────────────

console.log('\n[1: Recommendation guard invariants]');

expect('recommendation._kind is recommendation', RECOMMENDATION._kind === 'recommendation');
expect('recommendation.aiCanApply is false', RECOMMENDATION.aiCanApply === false);
expect('recommendation.requiresHumanApproval is true', RECOMMENDATION.requiresHumanApproval === true);
expect('recommendation.tenantId matches', RECOMMENDATION.tenantId === TENANT);
expect('recommendation.auditTrailId matches', RECOMMENDATION.auditTrailId === AUDIT_ID);

// ─── Step 2: createSimulatedHumanApproval ─────────────────────────────────────

console.log('\n[2: createSimulatedHumanApproval]');

const precomputedDiffHash = asDiffHash('d'.repeat(64));

const { approval, blockedReasons: approvalBlocked } = createSimulatedHumanApproval({
  tenantId: TENANT,
  sourceRecommendationId: REC_ID,
  approvedByHumanUserId: 'admin-user-42',
  approvalReason: 'Weight adjustment approved after weekly review',
  auditTrailId: AUDIT_ID,
  targetVersion: V2,
  diffHash: precomputedDiffHash,
  now: NOW,
});

expect('approval created (no blocked reasons)', approvalBlocked.length === 0 && approval !== null);
expect('approval._kind is simulated_human_model_config_approval', approval!._kind === 'simulated_human_model_config_approval');
expect('approval.persisted is false', approval!.persisted === false);
expect('approval.executable is false', approval!.executable === false);
expect('approval.aiCanApprove is false', approval!.aiCanApprove === false);
expect('approval.tenantId matches', approval!.tenantId === TENANT);
expect('approval.sourceRecommendationId matches recommendation', approval!.sourceRecommendationId === REC_ID);
expect('approval.auditTrailId matches', approval!.auditTrailId === AUDIT_ID);

// Type isolation: simulated approval cannot be confused with persisted approval
expect('_kind not model_config_approval (type-isolated)', (approval!._kind as string) !== 'model_config_approval');

// Structural isolation: persisted and executable fields do not exist on HumanModelConfigApproval
// (validated at TypeScript compile time — _kind discriminant enforces structural incompatibility)
expect('simulated approval has no Firestore path', !('firestorePath' in approval!));
expect('simulated approval has no write method', !('write' in approval!));
expect('simulated approval has no apply method', !('apply' in approval!));
expect('simulated approval has no execute method', !('execute' in approval!));

// ─── Step 3: Generate bound tokens ───────────────────────────────────────────

console.log('\n[3: Token binding]');

const applyToken = generateApplyToken({
  tenantId: TENANT as string,
  sourceRecommendationId: REC_ID as string,
  humanApprovalId: approval!.approvalId as string,
  previousVersion: V1 as string,
  proposedNewVersion: V2 as string,
  auditTrailId: AUDIT_ID as string,
  diffHash: precomputedDiffHash as string,
});

const rollbackToken = generateRollbackToken({
  tenantId: TENANT as string,
  rollbackTargetVersion: V1 as string,
  currentVersion: V2 as string,
  auditTrailId: AUDIT_ID as string,
  rollbackReason: `Rollback plan for apply from ${V1} to ${V2}`,
});

expect('applyToken is 64 chars', applyToken.length === 64);
expect('rollbackToken is 64 chars', rollbackToken.length === 64);
expect('applyToken !== rollbackToken', (applyToken as string) !== (rollbackToken as string));

// Determinism: re-generating same tokens produces same result
const applyToken2 = generateApplyToken({
  tenantId: TENANT as string,
  sourceRecommendationId: REC_ID as string,
  humanApprovalId: approval!.approvalId as string,
  previousVersion: V1 as string,
  proposedNewVersion: V2 as string,
  auditTrailId: AUDIT_ID as string,
  diffHash: precomputedDiffHash as string,
});
expect('applyToken deterministic', applyToken === applyToken2);

// ─── Step 4: createApplyPlanFromRecommendation ────────────────────────────────

console.log('\n[4: createApplyPlanFromRecommendation]');

const { applyPlan, rollbackPlan, auditEvent, blockedReasons } =
  createApplyPlanFromRecommendation({
    recommendation: RECOMMENDATION,
    simulatedApproval: approval!,
    currentConfigVersion: CURRENT_CONFIG,
    planId: 'integration-plan-001',
    rollbackPlanId: 'integration-rollback-001',
    applyToken,
    rollbackToken,
    now: NOW,
  });

expect('no blocked reasons', blockedReasons.length === 0);

// Apply plan invariants
expect('applyPlan._kind is model_config_apply_plan_dry_run', applyPlan._kind === 'model_config_apply_plan_dry_run');
expect('applyPlan.executable is false (literal)', applyPlan.executable === false);
expect('applyPlan.aiCanApply is false (literal)', applyPlan.aiCanApply === false);
expect('applyPlan.requiresHumanApproval is true (literal)', applyPlan.requiresHumanApproval === true);

// Apply plan structural isolation — no forbidden fields
expect('applyPlan has no apply method', !('apply' in applyPlan));
expect('applyPlan has no execute method', !('execute' in applyPlan));
expect('applyPlan has no commit method', !('commit' in applyPlan));
expect('applyPlan has no write method', !('write' in applyPlan));
expect('applyPlan has no runTransaction method', !('runTransaction' in applyPlan));
expect('applyPlan has no settingsPath', !('settingsPath' in applyPlan));
expect('applyPlan has no settingsHistoryPath', !('settingsHistoryPath' in applyPlan));
expect('applyPlan has no firestorePath', !('firestorePath' in applyPlan));

// Continuity: tenantId, recommendationId, auditTrailId across pipeline
expect('applyPlan.tenantId continuous', applyPlan.tenantId === TENANT);
expect('applyPlan.auditTrailId continuous', applyPlan.auditTrailId === AUDIT_ID);
expect('applyPlan.sourceRecommendationId continuous', applyPlan.sourceRecommendationId === REC_ID);
expect('applyPlan.humanApprovalId continuous', applyPlan.humanApprovalId === approval!.approvalId);
expect('applyPlan.previousVersion correct', applyPlan.previousVersion === V1);
expect('applyPlan.proposedNewVersion correct', applyPlan.proposedNewVersion === V2);

// Diff hashes
expect('applyPlan.configBeforeHash is 64 chars', applyPlan.configBeforeHash.length === 64);
expect('applyPlan.configAfterHash is 64 chars', applyPlan.configAfterHash.length === 64);
expect('applyPlan.diffHash is 64 chars', applyPlan.diffHash.length === 64);
expect('applyPlan.configBeforeHash !== configAfterHash (weights changed)', applyPlan.configBeforeHash !== applyPlan.configAfterHash);

// ─── Step 5: Rollback plan invariants ─────────────────────────────────────────

console.log('\n[5: Rollback plan invariants]');

expect('rollbackPlan returned on happy path', rollbackPlan !== null);
const rp = rollbackPlan!;

expect('rollbackPlan._kind is model_config_rollback_plan_dry_run', rp._kind === 'model_config_rollback_plan_dry_run');
expect('rollbackPlan.executable is false (literal)', rp.executable === false);
expect('rollbackPlan.aiCanRollback is false (literal)', rp.aiCanRollback === false);
expect('rollbackPlan.humanApprovalRequired is true (literal)', rp.humanApprovalRequired === true);

// Rollback plan structural isolation
expect('rollbackPlan has no rollback method', !('rollback' in rp));
expect('rollbackPlan has no execute method', !('execute' in rp));
expect('rollbackPlan has no commit method', !('commit' in rp));
expect('rollbackPlan has no write method', !('write' in rp));
expect('rollbackPlan has no runTransaction method', !('runTransaction' in rp));
expect('rollbackPlan has no settingsPath', !('settingsPath' in rp));
expect('rollbackPlan has no settingsHistoryPath', !('settingsHistoryPath' in rp));
expect('rollbackPlan has no firestorePath', !('firestorePath' in rp));

// Version continuity: rollback must revert from V2 back to V1
expect('rollbackPlan.currentVersion is V2', rp.currentVersion === V2);
expect('rollbackPlan.rollbackTargetVersion is V1', rp.rollbackTargetVersion === V1);
expect('rollbackPlan.tenantId continuous', rp.tenantId === TENANT);
expect('rollbackPlan.auditTrailId continuous', rp.auditTrailId === AUDIT_ID);

// ─── Step 6: Audit event continuity ──────────────────────────────────────────

console.log('\n[6: Audit event continuity]');

expect('auditEvent.eventType is APPLY_PLAN_CREATED', auditEvent.eventType === 'MODEL_CONFIG_APPLY_PLAN_CREATED');
expect('auditEvent.tenantId continuous', auditEvent.tenantId === TENANT);
expect('auditEvent.auditTrailId continuous', auditEvent.auditTrailId === AUDIT_ID);
expect('auditEvent.sourceRecommendationId continuous', auditEvent.sourceRecommendationId === REC_ID);
expect('auditEvent.approvalId continuous', auditEvent.approvalId === approval!.approvalId);
expect('auditEvent.previousVersion continuous', auditEvent.previousVersion === V1);
expect('auditEvent.newVersion continuous', auditEvent.newVersion === V2);

// Audit metadata guard invariants
expect('auditEvent.metadata.aiCanApply is false', auditEvent.metadata.aiCanApply === false);
expect('auditEvent.metadata.aiCanRollback is false', auditEvent.metadata.aiCanRollback === false);
expect('auditEvent.metadata.requiresHumanApproval is true', auditEvent.metadata.requiresHumanApproval === true);
expect('auditEvent.metadata.executable is false', auditEvent.metadata.executable === false);

// Audit metadata completeness
expect('auditEvent.metadata.approvedByHumanUserId present', auditEvent.metadata.approvedByHumanUserId === 'admin-user-42');
expect('auditEvent.metadata.appliedByHumanUserId is null', auditEvent.metadata.appliedByHumanUserId === null);
expect('auditEvent.metadata.configBeforeHash present', auditEvent.metadata.configBeforeHash !== null);
expect('auditEvent.metadata.configAfterHash present', auditEvent.metadata.configAfterHash !== null);
expect('auditEvent.metadata.proposedNewVersion present', auditEvent.metadata.proposedNewVersion === V2);

// ─── Step 7: createRollbackPlanFromApplyPlan standalone ───────────────────────

console.log('\n[7: createRollbackPlanFromApplyPlan standalone]');

const standaloneRollback = createRollbackPlanFromApplyPlan({
  applyPlan,
  rollbackPlanId: 'standalone-rollback-001',
  rollbackToken,
  rollbackReason: 'accuracy degraded after deployment',
  now: NOW,
});

expect('standaloneRollback._kind is model_config_rollback_plan_dry_run', standaloneRollback._kind === 'model_config_rollback_plan_dry_run');
expect('standaloneRollback.executable is false', standaloneRollback.executable === false);
expect('standaloneRollback.aiCanRollback is false', standaloneRollback.aiCanRollback === false);
expect('standaloneRollback.humanApprovalRequired is true', standaloneRollback.humanApprovalRequired === true);
expect('standaloneRollback.rollbackTargetVersion is V1', standaloneRollback.rollbackTargetVersion === V1);
expect('standaloneRollback.currentVersion is V2', standaloneRollback.currentVersion === V2);
expect('standaloneRollback.rollbackReason correct', standaloneRollback.rollbackReason === 'accuracy degraded after deployment');
expect('standaloneRollback.blockedReasons empty', standaloneRollback.blockedReasons.length === 0);

// ─── Step 8: Pipeline determinism ─────────────────────────────────────────────

console.log('\n[8: Pipeline determinism]');

const { applyPlan: applyPlan2 } = createApplyPlanFromRecommendation({
  recommendation: RECOMMENDATION,
  simulatedApproval: approval!,
  currentConfigVersion: CURRENT_CONFIG,
  planId: 'integration-plan-001',
  rollbackPlanId: 'integration-rollback-001',
  applyToken,
  rollbackToken,
  now: NOW,
});

expect('pipeline deterministic: configBeforeHash', applyPlan.configBeforeHash === applyPlan2.configBeforeHash);
expect('pipeline deterministic: configAfterHash', applyPlan.configAfterHash === applyPlan2.configAfterHash);
expect('pipeline deterministic: diffHash', applyPlan.diffHash === applyPlan2.diffHash);

// ─── Step 9: Blocked pipeline invariants ─────────────────────────────────────

console.log('\n[9: Blocked pipeline — guard invariants still hold]');

const WRONG_TENANT = 'tenant-wrong' as TenantId;
const wrongRecTenant: ModelConfigRecommendation = { ...RECOMMENDATION, tenantId: WRONG_TENANT };

const blockedResult = createApplyPlanFromRecommendation({
  recommendation: wrongRecTenant,
  simulatedApproval: approval!,
  currentConfigVersion: CURRENT_CONFIG,
  planId: 'blocked-plan',
  rollbackPlanId: 'blocked-rp',
  applyToken,
  rollbackToken,
  now: NOW,
});

expect('blocked: blockedReasons non-empty', blockedResult.blockedReasons.length > 0);
expect('blocked: applyPlan._kind still dry_run', blockedResult.applyPlan._kind === 'model_config_apply_plan_dry_run');
expect('blocked: applyPlan.executable still false', blockedResult.applyPlan.executable === false);
expect('blocked: applyPlan.aiCanApply still false', blockedResult.applyPlan.aiCanApply === false);
expect('blocked: rollbackPlan is null', blockedResult.rollbackPlan === null);
expect('blocked: auditEvent is BLOCKED', blockedResult.auditEvent.eventType === 'MODEL_CONFIG_APPLY_BLOCKED');

// ─── Step 10: No Firestore / no real write ────────────────────────────────────

console.log('\n[10: No Firestore / no real write boundary]');

// Verify none of the output objects contain Firestore-like fields
function hasFirestoreFields(obj: object): boolean {
  const forbidden = ['firestorePath', 'collectionPath', 'documentRef', 'db', 'firestore',
    'runTransaction', 'set', 'update', 'delete', 'batch', 'commit'];
  return forbidden.some(f => f in obj);
}

expect('applyPlan has no Firestore fields', !hasFirestoreFields(applyPlan));
expect('rollbackPlan has no Firestore fields', !hasFirestoreFields(rp));
expect('auditEvent has no Firestore fields', !hasFirestoreFields(auditEvent));
expect('approval has no Firestore fields', !hasFirestoreFields(approval!));

// ─── Step 11: Type guard functions ───────────────────────────────────────────

console.log('\n[11: Type-safe discrimination helpers]');

function isSimulatedApproval(x: unknown): x is SimulatedHumanModelConfigApproval {
  return typeof x === 'object' && x !== null &&
    (x as SimulatedHumanModelConfigApproval)._kind === 'simulated_human_model_config_approval' &&
    (x as SimulatedHumanModelConfigApproval).persisted === false &&
    (x as SimulatedHumanModelConfigApproval).executable === false;
}

function isDryRunApplyPlan(x: unknown): x is ModelConfigApplyPlan {
  return typeof x === 'object' && x !== null &&
    (x as ModelConfigApplyPlan)._kind === 'model_config_apply_plan_dry_run' &&
    (x as ModelConfigApplyPlan).executable === false;
}

function isDryRunRollbackPlan(x: unknown): x is ModelConfigRollbackPlan {
  return typeof x === 'object' && x !== null &&
    (x as ModelConfigRollbackPlan)._kind === 'model_config_rollback_plan_dry_run' &&
    (x as ModelConfigRollbackPlan).executable === false;
}

expect('isSimulatedApproval(approval) is true', isSimulatedApproval(approval));
expect('isDryRunApplyPlan(applyPlan) is true', isDryRunApplyPlan(applyPlan));
expect('isDryRunRollbackPlan(rollbackPlan) is true', isDryRunRollbackPlan(rp));

// A plain object does not pass the guard
expect('isSimulatedApproval({}) is false', !isSimulatedApproval({}));
expect('isDryRunApplyPlan({}) is false', !isDryRunApplyPlan({}));
expect('isDryRunRollbackPlan({}) is false', !isDryRunRollbackPlan({}));

// ─── Step 12: Pure functions — no I/O ────────────────────────────────────────

console.log('\n[12: Pure — no I/O]');

expect('createSimulatedHumanApproval is synchronous', !(approval instanceof Promise));
expect('createApplyPlanFromRecommendation is synchronous', !(applyPlan instanceof Promise));
expect('createRollbackPlanFromApplyPlan is synchronous', !(standaloneRollback instanceof Promise));
expect('auditEvent is synchronous', !(auditEvent instanceof Promise));

if (fail === 0) console.log(`\nPASSED — Feature 004 Final Dry-run Integration verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
