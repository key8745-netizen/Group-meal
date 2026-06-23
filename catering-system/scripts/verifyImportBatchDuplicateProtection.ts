/**
 * Manual verification helper for Feature 027 (匯入批次管理與重複匯入防護).
 * Exercises computeContentFingerprint / findDuplicateBatches against the
 * real Feature 026 sample file plus synthetic variants, without touching
 * Firestore. Does not commit or embed any sample file content into the repo.
 *
 * Run: npx tsx scripts/verifyImportBatchDuplicateProtection.ts <path-to-xls>
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { isWideMonthlyMenuTemplate, parseWideMonthlyMenuTemplate } from '../src/services/wideMenuTemplateParser';
import { parseCsvText, computeContentFingerprint, findDuplicateBatches } from '../src/services/menuImportService';
import type { MenuImportBatch } from '../src/services/types';

function assert(cond: unknown, message: string): void {
  if (!cond) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

function fakeBatch(overrides: Partial<MenuImportBatch>): MenuImportBatch {
  return {
    id: 'fake',
    sourceFileName: '115年7月菜單-成人.xls',
    organizationName: '愛心家園',
    yearMonth: '2026-07',
    mealProgram: '成人午餐',
    servingBaseline: 100,
    columnMapping: {},
    importStatus: 'finalized',
    rowCount: 19,
    itemCount: 129,
    reviewedItemCount: 0,
    createdAt: 0 as never,
    createdBy: 'uid1',
    updatedAt: 0 as never,
    updatedBy: 'uid1',
    ...overrides,
  };
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: tsx scripts/verifyImportBatchDuplicateProtection.ts <path-to-xls>');
    process.exit(1);
  }

  const buf = fs.readFileSync(path);
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  assert(isWideMonthlyMenuTemplate(matrix), 'real file still detected as wide monthly menu template (Feature 026 regression check)');
  const wide = parseWideMonthlyMenuTemplate(matrix);
  const { headers, rows } = parseCsvText(wide.csvText);

  const dateHeader = headers[0];
  const slotHeaders = headers.slice(1);
  let itemCount = 0;
  const serviceDays = new Set<string>();
  for (const row of rows) {
    const date = row.rawRowSnapshot[dateHeader];
    if (!date) continue;
    serviceDays.add(date);
    for (const h of slotHeaders) {
      if (row.rawRowSnapshot[h]) itemCount++;
    }
  }
  assert(serviceDays.size === 19, `19 service days parsed (got ${serviceDays.size})`);
  assert(itemCount === 129, `129 MenuImportItem records simulated (got ${itemCount})`);

  // Same content twice -> identical fingerprint (Level 1 detection).
  const fingerprintA = await computeContentFingerprint(wide.yearMonth, headers, wide.csvText);
  const fingerprintB = await computeContentFingerprint(wide.yearMonth, headers, wide.csvText);
  assert(fingerprintA === fingerprintB, 'identical content produces identical fingerprint (deterministic)');
  assert(fingerprintA.length === 64, `fingerprint is a 64-char hex SHA-256 digest (got length ${fingerprintA.length})`);

  // Different content (whitespace-only difference) -> still matches after normalization.
  const fingerprintWhitespaceVariant = await computeContentFingerprint(wide.yearMonth, headers, wide.csvText + '\n');
  assert(
    fingerprintA === fingerprintWhitespaceVariant,
    'trailing-whitespace variant still matches (normalization works)',
  );

  // Genuinely different content -> different fingerprint.
  const fingerprintDifferentMonth = await computeContentFingerprint('2026-08', headers, wide.csvText);
  assert(fingerprintA !== fingerprintDifferentMonth, 'different yearMonth produces a different fingerprint');

  // Scenario 1: first import, no existing batches -> no duplicate matches.
  const noMatches = findDuplicateBatches([], {
    sourceFileName: wide.yearMonth + '.xls',
    organizationName: '愛心家園',
    yearMonth: wide.yearMonth,
    mealProgram: '成人午餐',
    contentFingerprint: fingerprintA,
  });
  assert(noMatches.length === 0, 'first import (no existing batches) reports no duplicate matches');

  // Scenario 2: same file re-imported -> Level 1 contentFingerprint match.
  const existingExact = fakeBatch({ id: 'b1', contentFingerprint: fingerprintA, yearMonth: wide.yearMonth });
  const exactMatches = findDuplicateBatches([existingExact], {
    sourceFileName: '115年7月菜單-成人.xls',
    organizationName: '愛心家園',
    yearMonth: wide.yearMonth,
    mealProgram: '成人午餐',
    contentFingerprint: fingerprintA,
  });
  assert(exactMatches.length === 1 && exactMatches[0].level === 'contentFingerprint', 'same content re-import detected at contentFingerprint level');

  // Scenario 3: same filename + month, different content -> Level 2 match (no fingerprint match).
  const existingSameName = fakeBatch({ id: 'b2', contentFingerprint: 'deadbeef', yearMonth: wide.yearMonth });
  const filenameMatches = findDuplicateBatches([existingSameName], {
    sourceFileName: '115年7月菜單-成人.xls',
    organizationName: '愛心家園',
    yearMonth: wide.yearMonth,
    mealProgram: '成人午餐',
    contentFingerprint: fingerprintDifferentMonth,
  });
  assert(filenameMatches.length === 1 && filenameMatches[0].level === 'filenameAndMonth', 'same filename+month, different content, detected at filenameAndMonth level');

  // Scenario 4: same org + month + mealProgram, different filename/content -> Level 3 match.
  const existingSameOrg = fakeBatch({ id: 'b3', sourceFileName: 'other-file.xls', contentFingerprint: 'deadbeef', yearMonth: wide.yearMonth });
  const orgMatches = findDuplicateBatches([existingSameOrg], {
    sourceFileName: 'yet-another-file.xls',
    organizationName: '愛心家園',
    yearMonth: wide.yearMonth,
    mealProgram: '成人午餐',
    contentFingerprint: fingerprintDifferentMonth,
  });
  assert(orgMatches.length === 1 && orgMatches[0].level === 'organizationAndMonth', 'same org+month+mealProgram only, detected at organizationAndMonth level');

  // Scenario 5: different month entirely -> no match (legitimate new batch).
  const noMatchDifferentMonth = findDuplicateBatches([existingExact, existingSameName, existingSameOrg], {
    sourceFileName: 'completely-different.xls',
    organizationName: '別的機構',
    yearMonth: '2026-09',
    mealProgram: '成人晚餐',
    contentFingerprint: fingerprintDifferentMonth,
  });
  assert(noMatchDifferentMonth.length === 0, 'genuinely unrelated batch (different org/month/program/content) reports no duplicate matches');

  // Scenario 6: archived batches are still included in duplicate comparison (not excluded from detection, only from default list display).
  const archivedDuplicate = fakeBatch({ id: 'b4', importStatus: 'archived', contentFingerprint: fingerprintA, yearMonth: wide.yearMonth });
  const archivedMatches = findDuplicateBatches([archivedDuplicate], {
    sourceFileName: '115年7月菜單-成人.xls',
    organizationName: '愛心家園',
    yearMonth: wide.yearMonth,
    mealProgram: '成人午餐',
    contentFingerprint: fingerprintA,
  });
  assert(archivedMatches.length === 1, 'archived batch with matching fingerprint is still detected as a duplicate risk');

  if (process.exitCode === 1) {
    console.error('\nVerification FAILED');
  } else {
    console.log('\nAll verifications PASSED');
  }
}

main();
