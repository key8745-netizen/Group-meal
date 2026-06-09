/**
 * canary_feature_flag.phase5f.test.ts — Feature 009 Phase 5F additive extensions
 * Pure runner pattern: `npx tsx`, passed/failed counters, throw on failure.
 */
import {
  evaluateCanaryFeatureFlagGate,
  buildDefaultOffCanaryFeatureFlag,
  evaluateF009Phase5FFeatureFlagIsolation,
  type CanaryFeatureFlag,
  type F009Phase5FFeatureFlagIsolationInput,
} from '../canary_feature_flag';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5F: canary_feature_flag isolation extensions ---');

const NOW = '2026-06-08T01:20:00.000Z';

// ── No regression: Phase 5E gate still importable/working ────────────────────
expect('Phase 5E evaluateCanaryFeatureFlagGate still importable (no regression)', typeof evaluateCanaryFeatureFlagGate === 'function');

const onFlag: CanaryFeatureFlag = {
  _kind: 'f009_phase5e_canary_feature_flag', executable: false,
  enabled: true, environment: 'staging', setBy: 'op-1', setAt: NOW, expiresAt: '2026-06-09T00:00:00.000Z',
  canEnableProductionWrite: false, canEnableCanaryRollout: false,
};

// ── Isolation guarantee: cannot leak into Feature 001-008 core ───────────────
const coreInput: F009Phase5FFeatureFlagIsolationInput = {
  _kind: 'f009_phase5f_feature_flag_isolation_input', flag: onFlag, targetPath: 'FEATURE_001_008_CORE', now: NOW,
};
const coreResult = evaluateF009Phase5FFeatureFlagIsolation(coreInput);
expect('Flag targeting Feature 001-008 core → not isolated (rejected)', coreResult.isolated === false);
expect('Flag targeting core → ISOLATION_VIOLATION reason', coreResult.blockedReasons.includes('F009_PHASE5F_FEATURE_FLAG_ISOLATION_VIOLATION'));
expect('Flag targeting core → cannot override core features', coreResult.canOverrideCoreFeatures === false);
expect('Flag targeting core → cannot enable production write', coreResult.canEnableProductionWrite === false);
expect('Flag targeting core → cannot enable canary write', coreResult.canEnableCanaryWrite === false);

// ── Isolation guarantee: readiness path is isolated, still cannot enable writes ──
const readinessInput: F009Phase5FFeatureFlagIsolationInput = {
  _kind: 'f009_phase5f_feature_flag_isolation_input', flag: onFlag, targetPath: 'PHASE5F_READINESS', now: NOW,
};
const readinessResult = evaluateF009Phase5FFeatureFlagIsolation(readinessInput);
expect('Flag targeting Phase 5F readiness path → isolated', readinessResult.isolated === true);
expect('Readiness-path flag → STILL cannot enable production write', readinessResult.canEnableProductionWrite === false);
expect('Readiness-path flag → STILL cannot enable canary write', readinessResult.canEnableCanaryWrite === false);
expect('Readiness-path flag → STILL cannot override core features', readinessResult.canOverrideCoreFeatures === false);

// ── Default-off baseline + malformed/off flags remain non-isolated ───────────
const offFlag = buildDefaultOffCanaryFeatureFlag({ setBy: 'op-1', setAt: NOW, expiresAt: '2026-06-09T00:00:00.000Z' });
const offResult = evaluateF009Phase5FFeatureFlagIsolation({ _kind: 'f009_phase5f_feature_flag_isolation_input', flag: offFlag, targetPath: 'PHASE5F_READINESS', now: NOW });
expect('Default-off flag → not isolated (gate reports OFF)', offResult.isolated === false);
expect('Default-off flag → still cannot enable production write', offResult.canEnableProductionWrite === false);

const malformedResult = evaluateF009Phase5FFeatureFlagIsolation(null);
expect('Malformed isolation input → default-deny not isolated', malformedResult.isolated === false);
expect('Malformed isolation input → FEATURE_FLAG_DISABLED reason', malformedResult.blockedReasons.includes('F009_PHASE5F_FEATURE_FLAG_DISABLED'));
expect('Malformed isolation input → cannot enable production write', malformedResult.canEnableProductionWrite === false);
expect('Malformed isolation input → cannot enable canary write', malformedResult.canEnableCanaryWrite === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`canary_feature_flag.phase5f.test.ts: ${fail} assertion(s) failed`);
