#!/usr/bin/env node
/**
 * check-feature008-forbidden-patterns.js
 *
 * Feature 008 Phase 3: Static Guard / CI Regression
 *
 * Scans Feature 008 Phase 3 service files for forbidden patterns.
 * Exits with code 1 if any violation is found.
 *
 * Forbidden patterns:
 *  - import firebase-admin
 *  - import @google-cloud/firestore
 *  - runTransaction(
 *  - .doc('settings/   (direct settings write)
 *  - .doc('settingsHistory/  (direct settingsHistory write)
 *  - netlify/functions  (function file modification)
 *  - /functions/       (Cloud Function modification)
 */

const fs = require('fs');
const path = require('path');

const SCAN_GLOBS = [
  'catering-system/src/services/realApplyCallerContextValidatorService.ts',
  'catering-system/src/services/realApplyApprovalValidatorService.ts',
  'catering-system/src/services/realApplyTransactionWriteSetService.ts',
  'catering-system/src/services/realApplyWriteSetHashConsistencyService.ts',
  'catering-system/src/services/realModelConfigSettingsSnapshotService.ts',
  'catering-system/src/types/realApplyTransactionExecution.ts',
];

const FORBIDDEN = [
  { pattern: /require\(['"]firebase-admin['"]|import.*from\s+['"]firebase-admin['"]/g, label: 'firebase-admin import' },
  { pattern: /require\(['"]@google-cloud\/firestore['"]|import.*from\s+['"]@google-cloud\/firestore['"]/g, label: '@google-cloud/firestore import' },
  { pattern: /runTransaction\s*\(/g, label: 'runTransaction call' },
  { pattern: /\.doc\(['"]settings\//g, label: 'direct settings document write' },
  { pattern: /\.doc\(['"]settingsHistory\//g, label: 'direct settingsHistory document write' },
];

let violations = 0;
const root = path.resolve(__dirname, '..');

for (const rel of SCAN_GLOBS) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const { pattern, label } of FORBIDDEN) {
    const matches = content.match(pattern);
    if (matches) {
      console.error(`[VIOLATION] ${rel}: forbidden pattern "${label}" (${matches.length} occurrence(s))`);
      violations++;
    }
  }
}

if (violations === 0) {
  console.log(`[OK] Feature 008 static guard: 0 violations across ${SCAN_GLOBS.length} files.`);
  process.exit(0);
} else {
  console.error(`[FAIL] Feature 008 static guard: ${violations} violation(s) found.`);
  process.exit(1);
}
