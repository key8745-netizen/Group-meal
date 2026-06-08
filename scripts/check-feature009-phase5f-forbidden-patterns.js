#!/usr/bin/env node
/**
 * check-feature009-phase5f-forbidden-patterns.js
 *
 * Feature 009 Phase 5F: Static Guard / CI Regression
 *
 * Phase 5F adds a readiness-only contract/model layer (TracingInterceptor,
 * Runtime Validator, plus additive canary/audit/feature-flag extensions) —
 * pure logic / contract-style code only. This script statically verifies
 * that the new Phase 5F files:
 *
 *  1. Contain no firebase-admin / @google-cloud/firestore / firebase/firestore
 *     imports (these are pure-logic files; no Firestore I/O).
 *  2. Contain no runTransaction / .collection / .doc / getFirestore calls,
 *     and no real crypto/HMAC/KMS/tracing-SDK calls (no real reads/writes).
 *  3. Do not import from `src/core/`, `src/database/`, or `src/production/`.
 *  4. Add no UI, Netlify Function, or Cloud Function code.
 *  5. Add no rollback or cleanup job implementations.
 *  6. Contain no production canary execution / broad rollout / production
 *     write-API patterns.
 *  7. Contain no AI apply / reset / approve-reset / modify-gate patterns.
 *  8. Contain no Service Account / Admin SDK bypass patterns.
 *  9. Contain no Feature 001-008 modification patterns.
 *  10. Visibly implement default-deny patterns (BLOCKED / "missing" /
 *      "malformed" / "!== true" / stale / version mismatch checks).
 *  11. Contain no hardcoded production-bypass / canary-rollout-bypass /
 *      emergency-disable-override literals.
 *  12. Mark every contract/payload/result `_kind` type as non-executable
 *      (`executable: false`) and, where applicable, `aiCanExecute: false`.
 *
 * Exits with code 1 if any violation is found.
 */

const fs = require('fs');
const path = require('path');

const PHASE5F_FILES = [
  'catering-system/src/monitoring/tracingInterceptor.ts',
  'catering-system/src/schema/runtime_validator.ts',
  'catering-system/src/services/canaryManager.ts',
  'catering-system/src/services/canaryAudit.ts',
  'catering-system/src/services/canary_feature_flag.ts',
];

const FORBIDDEN_CORE_IMPORT_PATTERNS = [
  /from\s+['"]\.\.?\/.*\/core\//,
  /from\s+['"]@\/core\//,
  /from\s+['"].*\bsrc\/core\//,
  /from\s+['"]\.\.?\/.*\/database\//,
  /from\s+['"]@\/database\//,
  /from\s+['"].*\bsrc\/database\//,
  /from\s+['"]\.\.?\/.*\/production\//,
  /from\s+['"]@\/production\//,
  /from\s+['"].*\bsrc\/production\//,
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
  /@opentelemetry\//,
  /require\(\s*['"]dd-trace/,
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

const PRODUCTION_CANARY_ROLLOUT_PATTERNS = [
  /function\s+(execute|perform|run|apply)ProductionCanary/i,
  /function\s+(execute|perform|run|apply)BroadRollout/i,
  /function\s+(execute|perform|run|apply)ProductionRollout/i,
  /function\s+(execute|perform|run)ProductionWrite/i,
];

const AI_BOUNDARY_BYPASS_PATTERNS = [
  /function\s+aiApply/i,
  /function\s+aiReset/i,
  /function\s+aiApproveReset/i,
  /function\s+aiModifyGate/i,
  /aiCanExecute\s*[:=]\s*true/,
];

const SERVICE_ACCOUNT_ADMIN_BYPASS_PATTERNS = [
  /serviceAccount/i,
  /admin\.initializeApp/,
  /from\s+['"]firebase-admin\/app['"]/,
  /GOOGLE_APPLICATION_CREDENTIALS/,
];

const FEATURE_001_008_MODIFICATION_PATTERNS = [
  /from\s+['"]\.\.?\/.*\bdishService['"]/,
  /from\s+['"]\.\.?\/.*\bpurchaseOrderService['"]/,
  /from\s+['"]\.\.?\/.*\bmealPlanService['"]/,
  /from\s+['"]\.\.?\/.*\binventoryService['"]/,
  /from\s+['"]\.\.?\/.*\bconfigService['"]/,
  /from\s+['"]\.\.?\/.*\bInventoryAudit['"]/,
];

const HARDCODED_BYPASS_PATTERNS = [
  /productionEnabled\s*[:=]\s*true\s*[,;)]/,
  /accessGranted\s*[:=]\s*true\s*[,;)](?!\s*\/\/\s*test)/,
  /authorizesProductionWrite\s*[:=]\s*true/,
  /authorizesCanaryRollout\s*[:=]\s*true/,
  /authorizesCanaryWrite\s*[:=]\s*true/,
  /authorizesRollout\s*[:=]\s*true/,
  /canEnableProductionWrite\s*[:=]\s*true/,
  /canEnableCanaryRollout\s*[:=]\s*true/,
  /canEnableCanaryWrite\s*[:=]\s*true/,
  /canOverrideCoreFeatures\s*[:=]\s*true/,
  /overridesEmergencyDisable\s*[:=]\s*true/,
  /writesProductionState\s*[:=]\s*true/,
  /isProductionReadinessOnly\s*[:=]\s*false/,
  /IS_PRODUCTION_READINESS_ONLY\s*=\s*false/,
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
  /STALE/,
  /default-deny/i,
];

const root = path.resolve(__dirname, '..');
let violations = 0;

function fail(rel, message) {
  console.error(`[VIOLATION] ${rel}: ${message}`);
  violations++;
}

for (const rel of PHASE5F_FILES) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    fail(rel, 'expected Phase 5F file does not exist');
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const codeLines = content.split('\n').filter((line) => !/^\s*\*|^\s*\/\//.test(line));
  const codeOnly = codeLines.join('\n');

  const allPatternGroups = [
    ['forbidden import from src/core', FORBIDDEN_CORE_IMPORT_PATTERNS],
    ['forbidden Firestore/firebase-admin import', FORBIDDEN_IMPORT_PATTERNS],
    ['forbidden runtime call (no real reads/writes/crypto/tracing SDK)', FORBIDDEN_RUNTIME_PATTERNS],
    ['forbidden UI/Netlify/Cloud-Function pattern', UI_NETLIFY_CLOUD_PATTERNS],
    ['forbidden rollback/cleanup implementation', ROLLBACK_CLEANUP_PATTERNS],
    ['forbidden production canary execution / broad rollout pattern', PRODUCTION_CANARY_ROLLOUT_PATTERNS],
    ['forbidden AI apply/reset/approve-reset/modify-gate pattern', AI_BOUNDARY_BYPASS_PATTERNS],
    ['forbidden Service Account / Admin SDK bypass pattern', SERVICE_ACCOUNT_ADMIN_BYPASS_PATTERNS],
    ['forbidden Feature 001-008 modification pattern (import of core flow services)', FEATURE_001_008_MODIFICATION_PATTERNS],
  ];

  for (const [label, patterns] of allPatternGroups) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        fail(rel, `${label} matching ${pattern}`);
      }
    }
  }

  const hasDefaultDenyEvidence = DEFAULT_DENY_EVIDENCE_PATTERNS.some((p) => p.test(content));
  if (!hasDefaultDenyEvidence) {
    fail(rel, 'no default-deny evidence found (expected BLOCKED / blockedReasons / "!== true" / MISSING / MALFORMED / STALE patterns) — file must visibly implement default-deny');
  }

  for (const pattern of HARDCODED_BYPASS_PATTERNS) {
    if (pattern.test(codeOnly)) {
      fail(rel, `hardcoded bypass pattern matching ${pattern} — production/canary-rollout/emergency-disable/readiness-only must remain disabled-by-default with no literal bypass`);
    }
  }

  const kindMatches = [...content.matchAll(/_kind:\s*'(f009_phase5f_[a-z0-9_]+)'/g)].map((m) => m[1]);
  const contractLikeKinds = kindMatches.filter((k) =>
    /(contract|payload|result|plan|state|lifecycle|set|ledger|attempt|input|candidate|gate|token|flag)$/.test(k));
  if (contractLikeKinds.length > 0 && !/executable:\s*false/.test(content)) {
    fail(rel, 'Phase 5F contract/payload/result types do not mark themselves `executable: false` — non-executable contract style is required');
  }
}

if (violations === 0) {
  console.log(`[OK] Feature 009 Phase 5F static guard: 0 violations across ${PHASE5F_FILES.length} files.`);
  process.exit(0);
} else {
  console.error(`[FAIL] Feature 009 Phase 5F static guard: ${violations} violation(s) found.`);
  process.exit(1);
}
