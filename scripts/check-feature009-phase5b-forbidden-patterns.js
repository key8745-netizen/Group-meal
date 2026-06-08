#!/usr/bin/env node
/**
 * check-feature009-phase5b-forbidden-patterns.js
 *
 * Feature 009 Phase 5B: Static Guard / CI Regression
 *
 * Phase 5B builds the production-gated rollout FOUNDATION (gates, allowlists,
 * kill switch, comparisons) — pure logic / contract code only. This script
 * statically verifies that the new Phase 5B files:
 *
 *  1. Contain no firebase-admin / @google-cloud/firestore / firebase/firestore
 *     imports (these are pure-logic files; no Firestore I/O).
 *  2. Contain no runTransaction calls (no real writes in Phase 5B).
 *  3. Add no UI, Netlify Function, or Cloud Function code (no React/JSX/
 *     netlify-lambda/onCall/onRequest patterns).
 *  4. Visibly implement default-deny patterns (BLOCKED reasons / accessGranted
 *     false-by-default / "missing" or "present !== true" checks).
 *  5. Contain no hardcoded production-bypass literals (e.g. forcing
 *     productionEnabled / accessGranted / killSwitch state to true/OFF as a
 *     literal default, or a literal allowlist bypass).
 *
 * Exits with code 1 if any violation is found.
 */

const fs = require('fs');
const path = require('path');

const PHASE5B_FILES = [
  'catering-system/src/services/realModelConfigApplyProductionAccessManager.ts',
  'catering-system/src/services/realModelConfigApplyProductionGateService.ts',
  'catering-system/src/services/realModelConfigApplyOperatorConfirmationService.ts',
  'catering-system/src/services/realModelConfigApplyDryRunToRealComparer.ts',
  'catering-system/src/services/realModelConfigApplyMonitoringPayloadService.ts',
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
];

const UI_NETLIFY_CLOUD_PATTERNS = [
  /from\s+['"]react['"]/,
  /<[A-Z][A-Za-z0-9]*[\s/>]/, // JSX-ish element tags
  /from\s+['"]@netlify\/functions['"]/,
  /functions\.https\.onCall/,
  /functions\.https\.onRequest/,
  /export\s+const\s+handler\s*[:=]/,
];

const HARDCODED_BYPASS_PATTERNS = [
  /productionEnabled\s*[:=]\s*true\s*[,;)]/,
  /accessGranted\s*[:=]\s*true\s*[,;)](?!\s*\/\/\s*test)/,
  /state\s*[:=]\s*['"]OFF['"]\s*,?\s*\/\/\s*always/i,
  /allowed\s*=\s*true\s*;\s*\/\/\s*bypass/i,
  /\/\/\s*TODO:?\s*bypass/i,
  /\/\/\s*FIXME:?\s*bypass/i,
];

// Patterns that demonstrate default-deny is actually present in the file —
// at least one must match per file.
const DEFAULT_DENY_EVIDENCE_PATTERNS = [
  /BLOCKED/,
  /blockedReasons/,
  /accessGranted\s*:\s*false/,
  /present\s*!==\s*true/,
  /!==\s*true/,
  /MISSING/,
];

const root = path.resolve(__dirname, '..');
let violations = 0;

function fail(rel, message) {
  console.error(`[VIOLATION] ${rel}: ${message}`);
  violations++;
}

for (const rel of PHASE5B_FILES) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    fail(rel, 'expected Phase 5B file does not exist');
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');

  // ── Check 1: no Firestore / firebase-admin imports ───────────────────────
  for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
    if (pattern.test(content)) {
      fail(rel, `forbidden Firestore/firebase-admin import matching ${pattern} — Phase 5B files are pure logic / contract only`);
    }
  }

  // ── Check 2: no runTransaction / live Firestore I/O ──────────────────────
  for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
    if (pattern.test(content)) {
      fail(rel, `forbidden Firestore runtime call matching ${pattern} — no real writes/reads permitted in Phase 5B`);
    }
  }

  // ── Check 3: no UI / Netlify / Cloud Function additions ──────────────────
  for (const pattern of UI_NETLIFY_CLOUD_PATTERNS) {
    if (pattern.test(content)) {
      fail(rel, `forbidden UI/Netlify/Cloud-Function pattern matching ${pattern} — Phase 5B forbids UI, Netlify Functions, and Cloud Functions`);
    }
  }

  // ── Check 4: default-deny evidence present ───────────────────────────────
  const hasDefaultDenyEvidence = DEFAULT_DENY_EVIDENCE_PATTERNS.some((p) => p.test(content));
  if (!hasDefaultDenyEvidence) {
    fail(rel, 'no default-deny evidence found (expected BLOCKED / blockedReasons / "!== true" / MISSING patterns) — file must visibly implement default-deny');
  }

  // ── Check 5: no hardcoded production bypass (ignore comment lines) ───────
  const codeLines = content.split('\n').filter((line) => !/^\s*\*|^\s*\/\//.test(line));
  const codeOnly = codeLines.join('\n');
  for (const pattern of HARDCODED_BYPASS_PATTERNS) {
    if (pattern.test(codeOnly)) {
      fail(rel, `hardcoded production-bypass pattern matching ${pattern} — production must remain disabled-by-default with no literal bypass`);
    }
  }

  // ── Check 6: executable:false / non-executable contract style for builders ──
  // Files that define their own contract/payload _kind types with `readonly
  // executable` must mark outputs non-executable.
  if (/readonly\s+executable\s*:\s*false/.test(content) || /executable:\s*false/.test(content)) {
    // Present — good, nothing to flag.
  } else if (/_kind:\s*'f009_phase5b_(emergency_disable_contract|monitoring_payload|monitoring_metrics_snapshot)'/.test(content)) {
    fail(rel, 'contract/payload type does not mark its outputs as `executable: false` — non-executable contract style is required');
  }
}

if (violations === 0) {
  console.log(`[OK] Feature 009 Phase 5B static guard: 0 violations across ${PHASE5B_FILES.length} files.`);
  process.exit(0);
} else {
  console.error(`[FAIL] Feature 009 Phase 5B static guard: ${violations} violation(s) found.`);
  process.exit(1);
}
