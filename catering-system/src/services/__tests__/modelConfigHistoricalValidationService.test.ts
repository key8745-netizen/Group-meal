import {
  validateRollbackHistoricalConfigHash,
  validateRollbackTargetVersion,
} from '../modelConfigHistoricalValidationService';
import type { SettingsHistorySnapshot } from '../modelConfigHistoricalValidationService';
import type { TenantId } from '../../types/aiBoundary';
import { asConfigVersion, asDiffHash } from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigHistoricalValidationService ===\n');

const tenantId = 'tenant-hist' as TenantId;
const otherTenantId = 'tenant-other' as TenantId;
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const v3 = asConfigVersion('v3');
const configHashV1 = asDiffHash('config-hash-v1');
const wrongHash = asDiffHash('wrong-hash');

const validSnapshot: SettingsHistorySnapshot = {
  _kind: 'settings_history_snapshot',
  tenantId,
  version: v1,
  configHash: configHashV1,
  immutable: true,
  createdAt: new Date(),
  createdByHumanUserId: 'user-001',
};

// ─── validateRollbackHistoricalConfigHash ─────────────────────────────────────

console.log('[validateRollbackHistoricalConfigHash]\n');

// 1. valid snapshot passes
const r1 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: validSnapshot,
});
expect('valid snapshot → valid=true', r1.valid === true);
expect('valid snapshot → 0 blockedReasons', r1.blockedReasons.length === 0);

// 2. missing historical snapshot → blocked
const r2 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: null,
});
expect('missing snapshot → REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND', r2.blockedReasons.includes('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND'));
expect('missing snapshot → valid=false', r2.valid === false);

// 3. tenant mismatch in snapshot → blocked
const r3 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: { ...validSnapshot, tenantId: otherTenantId },
});
expect('snapshot tenant mismatch → REAL_ROLLBACK_TENANT_MISMATCH', r3.blockedReasons.includes('REAL_ROLLBACK_TENANT_MISMATCH'));
expect('snapshot tenant mismatch → valid=false', r3.valid === false);

// 4. snapshot version mismatch → blocked
const r4 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: { ...validSnapshot, version: v2 },
});
expect('snapshot version mismatch → REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND', r4.blockedReasons.includes('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND'));

// 5. configHash mismatch → blocked
const r5 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: { ...validSnapshot, configHash: wrongHash },
});
expect('configHash mismatch → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', r5.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));
expect('configHash mismatch → valid=false', r5.valid === false);

// 6. deleted snapshot → blocked
const r6 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: { ...validSnapshot, deleted: true } as unknown as SettingsHistorySnapshot,
});
expect('deleted snapshot → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', r6.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 7. overwritten snapshot → blocked
const r7 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: { ...validSnapshot, overwritten: true } as unknown as SettingsHistorySnapshot,
});
expect('overwritten snapshot → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', r7.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 8. missing rollbackTargetVersion → blocked
const r8 = validateRollbackHistoricalConfigHash({
  tenantId,
  rollbackTargetVersion: '' as typeof v1,
  expectedHistoricalConfigHash: configHashV1,
  historicalSnapshot: validSnapshot,
});
expect('missing rollbackTargetVersion → blocked', r8.valid === false);

// ─── validateRollbackTargetVersion ────────────────────────────────────────────

console.log('\n[validateRollbackTargetVersion]\n');

// 9. valid version chain passes (v1 < v2 < v3)
const rv1 = validateRollbackTargetVersion({
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v3,
  expectedHistoricalConfigHash: configHashV1,
});
expect('valid version chain → valid=true', rv1.valid === true);
expect('valid version chain → 0 blockedReasons', rv1.blockedReasons.length === 0);

// 10. missing rollbackTargetVersion → blocked
const rv2 = validateRollbackTargetVersion({
  rollbackTargetVersion: null,
  expectedCurrentVersion: v2,
  newVersion: v3,
  expectedHistoricalConfigHash: configHashV1,
});
expect('missing rollbackTargetVersion → blocked', rv2.valid === false);

// 11. rollbackTargetVersion === expectedCurrentVersion → REAL_ROLLBACK_SAME_VERSION
const rv3 = validateRollbackTargetVersion({
  rollbackTargetVersion: v2,
  expectedCurrentVersion: v2,
  newVersion: v3,
  expectedHistoricalConfigHash: configHashV1,
});
expect('same version → REAL_ROLLBACK_SAME_VERSION', rv3.blockedReasons.includes('REAL_ROLLBACK_SAME_VERSION'));

// 12. rollbackTargetVersion > expectedCurrentVersion → ROLLBACK_TARGET_VERSION_INVALID
const rv4 = validateRollbackTargetVersion({
  rollbackTargetVersion: v3,
  expectedCurrentVersion: v2,
  newVersion: v3,
  expectedHistoricalConfigHash: configHashV1,
});
expect('rollbackTarget > current → ROLLBACK_TARGET_VERSION_INVALID', rv4.blockedReasons.includes('ROLLBACK_TARGET_VERSION_INVALID'));

// 13. newVersion <= expectedCurrentVersion → ROLLBACK_TARGET_VERSION_INVALID
const rv5 = validateRollbackTargetVersion({
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v1, // new version must be > current
  expectedHistoricalConfigHash: configHashV1,
});
expect('newVersion <= current → ROLLBACK_TARGET_VERSION_INVALID', rv5.blockedReasons.includes('ROLLBACK_TARGET_VERSION_INVALID'));

// 14. missing historicalConfigHash → blocked
const rv6 = validateRollbackTargetVersion({
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v3,
  expectedHistoricalConfigHash: null,
});
expect('missing historicalConfigHash → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', rv6.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

if (fail === 0) console.log(`\nPASSED — modelConfigHistoricalValidationService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
