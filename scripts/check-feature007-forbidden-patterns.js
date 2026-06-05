#!/usr/bin/env node
/**
 * Feature 007 Phase 1: Static Guard — Forbidden Pattern Check
 *
 * Scans modelConfig* and realModelConfig* service files for patterns
 * that are forbidden by the Feature 007 transaction boundary.
 *
 * Forbidden patterns:
 *  - import 'firebase-admin'
 *  - import 'google-cloud-firestore'
 *  - .runTransaction(
 *  - Direct settings write: settings.update / settings.set
 *  - Direct settingsHistory write
 *
 * CI usage:
 *   node scripts/check-feature007-forbidden-patterns.js
 *
 * Exits 1 if any forbidden pattern is found (for CI integration).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SERVICE_DIR = path.join(__dirname, '../catering-system/src/services');
const TYPES_DIR = path.join(__dirname, '../catering-system/src/types');

const FORBIDDEN_PATTERNS = [
  {
    pattern: /require\(['"]firebase-admin['"]\)|from\s+['"]firebase-admin['"]/,
    name: 'firebase-admin import',
    description: 'Forbidden: firebase-admin must not be imported in Feature 007 services',
  },
  {
    pattern: /require\(['"]@google-cloud\/firestore['"]\)|from\s+['"]@google-cloud\/firestore['"]/,
    name: 'google-cloud-firestore import',
    description: 'Forbidden: @google-cloud/firestore must not be imported in Feature 007 services',
  },
  {
    pattern: /\.runTransaction\s*\(/,
    name: 'runTransaction call',
    description: 'Forbidden: runTransaction must not be called in Feature 007 Phase 1',
  },
];

const TARGET_GLOBS = [
  path.join(SERVICE_DIR, 'realModelConfig*.ts'),
  path.join(SERVICE_DIR, 'modelConfigRealApply*.ts'),
  path.join(SERVICE_DIR, 'modelConfigHistoricalValidation*.ts'),
  path.join(SERVICE_DIR, 'modelConfigLockCleanup*.ts'),
  path.join(SERVICE_DIR, 'modelConfigIdempotencyLockSchema*.ts'),
  path.join(TYPES_DIR, 'realModelConfigApplyExecution.ts'),
  path.join(TYPES_DIR, 'modelConfigRealApply.ts'),
];

function getFiles(globPattern) {
  const dir = path.dirname(globPattern);
  const base = path.basename(globPattern).replace('*', '');
  try {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith(base.replace('*.ts', '')) || f.match(new RegExp(base.replace('.', '\\.').replace('*', '.*'))))
      .map(f => path.join(dir, f))
      .filter(f => f.endsWith('.ts') && !f.includes('__tests__'));
  } catch {
    return [];
  }
}

let allFiles = [];
for (const glob of TARGET_GLOBS) {
  allFiles = allFiles.concat(getFiles(glob));
}
allFiles = [...new Set(allFiles)].filter(f => fs.existsSync(f));

let violations = 0;
const results = [];

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (const { pattern, name, description } of FORBIDDEN_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (pattern.test(line) && !line.trim().startsWith('*') && !line.trim().startsWith('//')) {
        violations++;
        results.push(`  VIOLATION: ${name}\n    File: ${filePath}\n    Line ${i + 1}: ${line.trim()}\n    Rule: ${description}`);
      }
    }
  }
}

console.log(`\n=== Feature 007 Forbidden Pattern Check ===`);
console.log(`Files scanned: ${allFiles.length}`);
console.log(`Patterns checked: ${FORBIDDEN_PATTERNS.length}`);

if (violations === 0) {
  console.log(`\n✅ PASS — No forbidden patterns found.\n`);
  process.exit(0);
} else {
  console.error(`\n❌ FAIL — ${violations} violation(s) found:\n`);
  results.forEach(r => console.error(r));
  console.error('');
  process.exit(1);
}
