#!/usr/bin/env node
/**
 * Feature 007 Phase 2: Static Guard — Forbidden Pattern Check (hardened)
 *
 * Scans modelConfig* and realModelConfig* service files for patterns
 * that are forbidden by the Feature 007 transaction boundary.
 *
 * Forbidden patterns:
 *  - import 'firebase-admin'
 *  - import 'google-cloud-firestore'
 *  - .runTransaction(
 *  - Direct settings write patterns
 *  - Direct settingsHistory write patterns
 *  - Netlify Function imports / exports
 *  - Cloud Function imports / exports
 *
 * CI usage:
 *   node scripts/check-feature007-forbidden-patterns.js
 *
 * Exits 1 if any forbidden pattern is found.
 */

const fs = require('fs');
const path = require('path');

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
    description: 'Forbidden: runTransaction must not be called in Feature 007 Phase 1–2',
  },
  {
    pattern: /settings\s*\.\s*(set|update|add|delete)\s*\(/,
    name: 'direct settings write',
    description: 'Forbidden: settings must not be written directly in Feature 007 services',
  },
  {
    pattern: /settingsHistory\s*\.\s*(set|update|add|delete)\s*\(/,
    name: 'direct settingsHistory write',
    description: 'Forbidden: settingsHistory must not be written directly in Feature 007 services',
  },
  {
    pattern: /from\s+['"]@netlify\/functions['"]/,
    name: 'Netlify Function import',
    description: 'Forbidden: Netlify Function imports must not appear in Feature 007 services',
  },
  {
    pattern: /from\s+['"]firebase-functions['"]/,
    name: 'Cloud Function import',
    description: 'Forbidden: Cloud Function imports must not appear in Feature 007 services',
  },
];

const TARGET_FILE_PREFIXES = [
  'realModelConfig',
  'modelConfigRealApply',
  'modelConfigHistoricalValidation',
  'modelConfigLockCleanup',
  'modelConfigIdempotencyLockSchema',
];

const TARGET_TYPE_PREFIXES = [
  'realModelConfigApplyExecution',
  'modelConfigRealApply',
];

function getFiles(dir, prefixes) {
  try {
    return fs.readdirSync(dir)
      .filter(f => prefixes.some(p => f.startsWith(p)) && f.endsWith('.ts') && !f.includes('__tests__') && !f.endsWith('.test.ts'))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

let allFiles = [
  ...getFiles(SERVICE_DIR, TARGET_FILE_PREFIXES),
  ...getFiles(TYPES_DIR, TARGET_TYPE_PREFIXES),
];
allFiles = [...new Set(allFiles)].filter(f => fs.existsSync(f));

let violations = 0;
const results = [];

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (const { pattern, name, description } of FORBIDDEN_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
      if (pattern.test(line)) {
        violations++;
        results.push(`  VIOLATION: ${name}\n    File: ${filePath}\n    Line ${i + 1}: ${trimmed}\n    Rule: ${description}`);
      }
    }
  }
}

console.log(`\n=== Feature 007 Forbidden Pattern Check (Phase 2) ===`);
console.log(`Files scanned: ${allFiles.length}`);
console.log(`Patterns checked: ${FORBIDDEN_PATTERNS.length}`);
console.log(`Files:`);
allFiles.forEach(f => console.log(`  ${path.basename(f)}`));

if (violations === 0) {
  console.log(`\n✅ PASS — No forbidden patterns found.\n`);
  process.exit(0);
} else {
  console.error(`\n❌ FAIL — ${violations} violation(s) found:\n`);
  results.forEach(r => console.error(r));
  console.error('');
  process.exit(1);
}
