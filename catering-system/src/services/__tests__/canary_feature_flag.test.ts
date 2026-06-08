import {
  evaluateCanaryFeatureFlagGate,
  buildDefaultOffCanaryFeatureFlag,
  type CanaryFeatureFlag,
  type CanaryFeatureFlagGateInput,
} from '../canary_feature_flag';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- Feature 009 Phase 5E: Canary Feature Flag Gate ---');

const NOW = '2026-06-08T00:10:00.000Z';

function flag(overrides: Partial<CanaryFeatureFlag> = {}): CanaryFeatureFlag {
  return {
    _kind: 'f009_phase5e_canary_feature_flag', executable: false,
    enabled: false, environment: 'staging', setBy: 'op-1',
    setAt: '2026-06-08T00:00:00.000Z', expiresAt: '2026-06-08T01:00:00.000Z',
    canEnableProductionWrite: false, canEnableCanaryRollout: false,
    ...overrides,
  };
}

function gateInput(f: CanaryFeatureFlag | null | undefined): CanaryFeatureFlagGateInput {
  return { _kind: 'f009_phase5e_canary_feature_flag_gate_input', flag: f, now: NOW };
}

// Default-off baseline
const defOff = buildDefaultOffCanaryFeatureFlag({ setBy: 'op-1', setAt: '2026-06-08T00:00:00.000Z', expiresAt: '2026-06-08T01:00:00.000Z' });
expect('Default-off flag is enabled:false', defOff.enabled === false);
expect('Default-off flag canEnableProductionWrite:false', defOff.canEnableProductionWrite === false);
expect('Default-off flag canEnableCanaryRollout:false', defOff.canEnableCanaryRollout === false);

const offResult = evaluateCanaryFeatureFlagGate(gateInput(defOff));
expect('Default-off flag → not isolated/ON', offResult.isolated === false && offResult.state === 'OFF');
expect('Default-off → FEATURE_FLAG_DISABLED reason', offResult.blockedReasons.includes('F009_PHASE5E_FEATURE_FLAG_DISABLED'));

// Enabled in staging, well-formed → isolated
const onResult = evaluateCanaryFeatureFlagGate(gateInput(flag({ enabled: true })));
expect('Enabled staging flag → isolated/ON', onResult.isolated === true && onResult.state === 'ON');
expect('Enabled flag still never authorizes production write', onResult.authorizesProductionWrite === false);
expect('Enabled flag still never authorizes canary rollout', onResult.authorizesCanaryRollout === false);

// Production environment → blocked regardless of enabled
const prodResult = evaluateCanaryFeatureFlagGate(gateInput(flag({ enabled: true, environment: 'production' })));
expect('Production environment flag → not isolated', prodResult.isolated === false);
expect('Production environment → cannot enable production write', prodResult.blockedReasons.includes('F009_PHASE5E_FEATURE_FLAG_CANNOT_ENABLE_PRODUCTION_WRITE'));
expect('Production environment → cannot enable canary rollout', prodResult.blockedReasons.includes('F009_PHASE5E_FEATURE_FLAG_CANNOT_ENABLE_CANARY_ROLLOUT'));

// Expired
const expiredResult = evaluateCanaryFeatureFlagGate(gateInput(flag({ enabled: true, expiresAt: '2026-06-08T00:05:00.000Z' })));
expect('Expired flag → state EXPIRED, not isolated', expiredResult.state === 'EXPIRED' && expiredResult.isolated === false);

// Stale (set far in the past)
const staleResult = evaluateCanaryFeatureFlagGate(gateInput(flag({ enabled: true, setAt: '2026-06-01T00:00:00.000Z', expiresAt: '2026-06-09T00:00:00.000Z' })));
expect('Stale flag → state STALE, not isolated', staleResult.state === 'STALE' && staleResult.isolated === false);

// Malformed
const malformed = { ...flag(), canEnableProductionWrite: true } as unknown as CanaryFeatureFlag;
const malformedResult = evaluateCanaryFeatureFlagGate(gateInput(malformed));
expect('Malformed flag (canEnableProductionWrite true) → MALFORMED', malformedResult.state === 'MALFORMED');
expect('Malformed flag → default-deny reason', malformedResult.blockedReasons.includes('F009_PHASE5E_UNKNOWN_STATE_DEFAULT_DENY'));

// Missing
expect('Missing flag → MISSING', evaluateCanaryFeatureFlagGate(gateInput(null)).state === 'MISSING');
expect('Null input → default-deny', evaluateCanaryFeatureFlagGate(null).isolated === false);

// Cannot enable production write or canary rollout, ever
expect('Gate result authorizesProductionWrite always false', onResult.authorizesProductionWrite === false && offResult.authorizesProductionWrite === false);
expect('Gate result authorizesCanaryRollout always false', onResult.authorizesCanaryRollout === false && offResult.authorizesCanaryRollout === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`canary_feature_flag.test.ts: ${fail} assertion(s) failed`);
