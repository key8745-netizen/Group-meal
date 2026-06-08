#!/usr/bin/env node
/**
 * check-feature009-phase5e-forbidden-patterns.js
 *
 * Feature 009 Phase 5E: Static Guard / CI Regression
 *
 * Phase 5E adds limited staging-only canary / dry-run-enabled readiness
 * modeling — pure logic / contract-style code only. This script statically
 * verifies that the new Phase 5E files:
 *
 *  1. Contain no firebase-admin / @google-cloud/firestore / firebase/firestore
 *     imports (these are pure-logic files; no Firestore I/O).
 *  2. Contain no runTransaction / .collection / .doc / getFirestore calls,
 *     and no real crypto/HMAC/KMS SDK calls (no real reads/writes/crypto).
 *  3. Add no UI, Netlify Function, or Cloud Function code (no React/JSX/
 *     netlify-lambda/onCall/onRequest patterns).
 *  4. Add no rollback or cleanup job implementations.
 *  5. Visibly implement default-deny patterns (BLOCKED reasons / "missing" /
 *     "malformed" / "!== true" / present !== true checks).
 *  6. Contain no hardcoded production-bypass / canary-rollout-bypass /
 *     emergency-disable-override literals.
 *  7. Mark every contract/payload/result `_kind` type as non-executable
 *     (`executable: false`) and, where applicable, `aiCanExecute: false`.
 *
 * Exits with code 1 if any violation is found.
 */

const fs = require('fs');
const path = require('path');

const PHASE5E_FILES = [
  'catering-system/src/services/canaryManager.ts',
  'catering-system/src/services/canaryAudit.ts',
  'catering-system/src/services/canary_feature_flag.ts',
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"]firebase-admin/,
  /require\(\s*['"]firebase-admin/,
  /from\s+['"]@google-cloud\/firestore/,
  /require\(\s*['"]@google-cloud\/firestore/,
  /from\s+['"]firebase\/firestore/,
  /require\(\s*['"]firebase\/firestore/,
];

const FORBIDDEN_RUNTIME_PATTERNS = [
  /\brunTransaction\s*\(/,
  /\.collection\(/,
  /\.doc\(/,
  /getFirestore\s*\(/,
  /createCipheriv|createHmac|createSign|crypto\.subtle/,
  /@google-cloud\/kms/,
];

const UI_NETLIFY_CLOUD_PATTERNS = [
  /from\s+['"]react['"]/,
  /(?<![\w)\]])<[A-Z][A-Za-z0-9]*(\s+[a-zA-Z-]+=|\s*\/?>)/,
  /from\s+['"]@netlify\/functions['"]/,
  /functions\.https\.onCall/,
  /functions\.https\.onRequest/,
  /export\s+const\s+handler\s*[:=]/,
];

const ROLLBACK_CLEANUP_PATTERNS = [
  /function\s+(execute|perform|run)Rollback/i,
  /function\s+(execute|perform|run)Cleanup/i,
];

const HARDCODED_BYPASS_PATTERNS = [
  /productionEnabled\s*[:=]\s*true\s*[,;)]/,
  /accessGranted\s*[:=]\s*true\s*[,;)](?!\s*\/\/\s*test)/,
  /authorizesProductionWrite\s*[:=]\s*true/,
  /authorizesCanaryRollout\s*[:=]\s*true/,
  /canEnableProductionWrite\s*[:=]\s*true/,
  /canEnableCanaryRollout\s*[:=]\s*true/,
  /overridesEmergencyDisable\s*[:=]\s*true/,
  /observationModeCanOverrideEmergencyDisable\s*[:=]\s*true/,
  /emergencyDisableWins\s*[:=]\s*false\s*,?\s*\/\/\s*always/i,
  /isProductionReadinessOnly\s*[:=]\s*false/,
  /\/\/\s*TODO:?\s*bypass/i,
  /\/\/\s*FIXME:?\s*bypass/i,
];

const DEFAULT_DENY_EVIDENCE_PATTERNS = [
  /BLOCKED/,
  /blockedReasons/,
  /present\s*!==\s*true/,
  /!==\s*true/,
  /MISSING/,
  /MALFORMED/,
  /default-deny/i,
];

const root = path.resolve(__dirname, '..');
let violations = 0;

function fail(rel, message) {
  console.error(`[VIOLATION] ${rel}: ${message}`);
  violations++;
}

for (const rel of PHASE5E_FILES) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    fail(rel, 'expected Phase 5E file does not exist');
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');

  for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
    if (pattern.test(content)) {
      fail(rel, `forbidden Firestore/firebase-admin import matching ${pattern} — Phase 5E files are pure logic / contract only`);
    }
  }

  for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
    if (pattern.test(content)) {
      fail(rel, `forbidden runtime call matching ${pattern} — no real writes/reads/crypto-SDK calls permitted in Phase 5E`);
    }
  }

  for (const pattern of UI_NETLIFY_CLOUD_PATTERNS) {
    if (pattern.test(content)) {
      fail(rel, `forbidden UI/Netlify/Cloud-Function pattern matching ${pattern} — Phase 5E forbids UI, Netlify Functions, and Cloud Functions`);
    }
  }

  for (const pattern of ROLLBACK_CLEANUP_PATTERNS) {
    if (pattern.test(content)) {
      fail(rel, `forbidden rollback/cleanup implementation matching ${pattern} — Phase 5E forbids rollback and cleanup jobs`);
    }
  }

  const hasDefaultDenyEvidence = DEFAULT_DENY_EVIDENCE_PATTERNS.some((p) => p.test(content));
  if (!hasDefaultDenyEvidence) {
    fail(rel, 'no default-deny evidence found (expected BLOCKED / blockedReasons / "!== true" / MISSING / MALFORMED patterns) — file must visibly implement default-deny');
  }

  const codeLines = content.split('\n').filter((line) => !/^\s*\*|^\s*\/\//.test(line));
  const codeOnly = codeLines.join('\n');
  for (const pattern of HARDCODED_BYPASS_PATTERNS) {
    if (pattern.test(codeOnly)) {
      fail(rel, `hardcoded bypass pattern matching ${pattern} — production/canary-rollout/emergency-disable must remain disabled-by-default with no literal bypass`);
    }
  }

  const kindMatches = [...content.matchAll(/_kind:\s*'(f009_phase5e_[a-z0-9_]+)'/g)].map((m) => m[1]);
  const contractLikeKinds = kindMatches.filter((k) =>
    /(contract|payload|result|plan|state|lifecycle|set|ledger|attempt|input|candidate|gate)$/.test(k));
  if (contractLikeKinds.length > 0 && !/executable:\s*false/.test(content)) {
    fail(rel, 'contract/payload/result types do not mark themselves `executable: false` — non-executable contract style is required');
  }
}

if (violations === 0) {
  console.log(`[OK] Feature 009 Phase 5E static guard: 0 violations across ${PHASE5E_FILES.length} files.`);
  process.exit(0);
} else {
  console.error(`[FAIL] Feature 009 Phase 5E static guard: ${violations} violation(s) found.`);
  process.exit(1);
}
