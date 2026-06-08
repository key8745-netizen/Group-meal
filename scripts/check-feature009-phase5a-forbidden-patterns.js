#!/usr/bin/env node
/**
 * check-feature009-phase5a-forbidden-patterns.js
 *
 * Feature 009 Phase 5A: Static Guard / CI Regression
 *
 * Phase 5A is the FIRST phase allowed to introduce a real `runTransaction`
 * for the model-config-apply flow — but ONLY behind a hard emulator/test
 * environment guard. This script statically verifies that the physical
 * hard-block is actually present in the source, not just documented.
 *
 * Checks performed on each Phase 5A file that may contain `runTransaction`:
 *  1. If `runTransaction(` appears, the file MUST also reference the
 *     production environment guard (by name) — i.e. the guard call exists
 *     in the same file as the real transaction call.
 *  2. The guard reference must textually appear BEFORE the first
 *     `runTransaction(` occurrence (guard-first ordering).
 *  3. No hardcoded production project id literal (e.g. 'umas-booking-manager')
 *     may appear anywhere EXCEPT inside the designated forbidden/blocked
 *     project-id list constant in the guard file itself (where it is the
 *     subject of a hard-block, not a target to allow).
 *  4. No direct unconditional `.doc('settings/...')` / `.doc('settingsHistory/...')`
 *     writes outside of the executor's transaction-scoped write phase guarded
 *     by the production guard.
 *  5. No `ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY` is ever hardcoded to 'true'
 *     as a literal default (it must come from the environment).
 *
 * Exits with code 1 if any violation is found.
 */

const fs = require('fs');
const path = require('path');

const PHASE5A_FILES = [
  'catering-system/src/services/realModelConfigApplyProductionEnvironmentGuard.ts',
  'catering-system/src/services/realModelConfigApplyTransactionExecutorService.ts',
];

const PRODUCTION_PROJECT_ID_LITERALS = [
  'umas-booking-manager',
];

const GUARD_REFERENCE_PATTERNS = [
  /evaluateProductionEnvironmentGuard/,
  /assertProductionEnvironmentGuardAllowed/,
  /ProductionEnvironmentGuard/,
];

const root = path.resolve(__dirname, '..');
let violations = 0;

function fail(rel, message) {
  console.error(`[VIOLATION] ${rel}: ${message}`);
  violations++;
}

for (const rel of PHASE5A_FILES) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    fail(rel, 'expected Phase 5A file does not exist');
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const isGuardFile = rel.endsWith('ProductionEnvironmentGuard.ts');
  const isExecutorFile = rel.endsWith('TransactionExecutorService.ts');

  // ── Check 1 + 2: guard-first contract around runTransaction ──────────────
  // Match actual invocations (e.g. `deps.runTransaction(`, `fsRunTransaction(`,
  // `.runTransaction(`) — exclude type/interface declarations such as
  // `runTransaction: <T>(...) => ...` or `export type RunTransactionFn = ...`.
  const runTxMatches = [...content.matchAll(/(?:\.|^|\s)(?:deps\.)?runTransaction\s*\(/gm)]
    .filter((m) => {
      const lineStart = content.lastIndexOf('\n', m.index ?? 0) + 1;
      const line = content.slice(lineStart, (m.index ?? 0) + m[0].length);
      return !/^\s*(export\s+)?(type|interface)\b/.test(line) && !/runTransaction\s*:\s*</.test(line);
    });
  if (runTxMatches.length > 0) {
    const firstRunTxIndex = runTxMatches[0].index ?? 0;

    const guardRefIndexes = GUARD_REFERENCE_PATTERNS
      .map((p) => content.search(p))
      .filter((i) => i >= 0);

    if (guardRefIndexes.length === 0) {
      fail(rel, 'contains runTransaction( but no reference to ProductionEnvironmentGuard — physical guard-first contract missing');
    } else {
      const earliestGuardRef = Math.min(...guardRefIndexes);
      if (earliestGuardRef >= firstRunTxIndex) {
        fail(rel, 'ProductionEnvironmentGuard is referenced AFTER runTransaction( — guard must run first (guard-first ordering violated)');
      }
    }

    // The executor must call the guard's evaluator/assert function specifically
    // (not merely import the type) — i.e. it must actually invoke the guard.
    if (isExecutorFile) {
      const invokesGuard = /evaluateProductionEnvironmentGuard(FromProcessEnv)?\s*\(/.test(content)
        || /assertProductionEnvironmentGuardAllowed\s*\(/.test(content);
      if (!invokesGuard) {
        fail(rel, 'imports the guard but never invokes evaluateProductionEnvironmentGuard*/assertProductionEnvironmentGuardAllowed — guard is not physically executed');
      }

      // The guard check must precede the call to deps.runTransaction in control
      // flow — verified textually: an `if (!guard.allowed)` / early-return-like
      // construct must appear before the runTransaction( call.
      const earlyReturnPattern = /if\s*\(\s*!\s*guard(Result)?\.allowed\s*\)/;
      if (!earlyReturnPattern.test(content)) {
        fail(rel, 'no "if (!guard.allowed)" early-exit found — physical block before runTransaction is not provably present');
      } else {
        const guardCheckIndex = content.search(earlyReturnPattern);
        if (guardCheckIndex < 0 || guardCheckIndex >= firstRunTxIndex) {
          fail(rel, '"if (!guard.allowed)" check appears after runTransaction( — must physically precede it');
        }
      }
    }
  }

  // ── Check 3: hardcoded production project id literals ────────────────────
  for (const literal of PRODUCTION_PROJECT_ID_LITERALS) {
    const re = new RegExp(`['"\`]${literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'g');
    const matches = [...content.matchAll(re)];
    if (matches.length === 0) continue;

    if (isGuardFile) {
      // Allowed ONLY inside FORBIDDEN_PRODUCTION_PROJECT_IDS — verify each
      // occurrence is textually within that constant's declaration block.
      const constStart = content.indexOf('FORBIDDEN_PRODUCTION_PROJECT_IDS');
      const constDeclEnd = content.indexOf('] as const;', constStart);
      if (constStart < 0 || constDeclEnd < 0) {
        fail(rel, `production project id literal "${literal}" found, but FORBIDDEN_PRODUCTION_PROJECT_IDS hard-block list constant is missing/malformed`);
        continue;
      }
      for (const m of matches) {
        const idx = m.index ?? -1;
        if (idx < constStart || idx > constDeclEnd) {
          fail(rel, `production project id literal "${literal}" appears OUTSIDE the FORBIDDEN_PRODUCTION_PROJECT_IDS hard-block list (possible allow-path leak)`);
        }
      }
    } else {
      fail(rel, `hardcoded production project id literal "${literal}" found outside the guard's forbidden-list — must never reference production project id directly`);
    }
  }

  // ── Check 4: direct settings/settingsHistory writes must be transaction-scoped ──
  // (Heuristic: any .doc('settings/ or .doc('settingsHistory/ call must appear
  // within the executor's runTransaction callback, i.e. after the guard check
  // and after `runTransaction(` opens.)
  if (isExecutorFile) {
    const directWritePatterns = [/\.doc\(\s*settingsDocPath/g, /\.doc\(\s*settingsHistoryDocPath/g, /\.doc\(['"]settings\//g, /\.doc\(['"]settingsHistory\//g];
    for (const pattern of directWritePatterns) {
      const matches = [...content.matchAll(pattern)];
      for (const m of matches) {
        const idx = m.index ?? -1;
        const guardCheckIndex = content.search(/if\s*\(\s*!\s*guard(Result)?\.allowed\s*\)/);
        if (guardCheckIndex < 0 || idx < guardCheckIndex) {
          fail(rel, `settings/settingsHistory document reference at offset ${idx} appears before the guard check — must be guarded`);
        }
      }
    }
  }

  // ── Check 5: opt-in flag must never be hardcoded to 'true' as a default ──
  const hardcodedOptIn = /ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY\s*[:=?]?\?*\s*['"`]true['"`]/;
  if (hardcodedOptIn.test(content) && !/env\.ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY/.test(content)) {
    fail(rel, 'ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY appears hardcoded to "true" as a default rather than read from the environment');
  }
}

if (violations === 0) {
  console.log(`[OK] Feature 009 Phase 5A static guard: 0 violations across ${PHASE5A_FILES.length} files.`);
  process.exit(0);
} else {
  console.error(`[FAIL] Feature 009 Phase 5A static guard: ${violations} violation(s) found.`);
  process.exit(1);
}
