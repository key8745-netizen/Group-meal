/**
 * Manual verification helper for Feature 026 — runs the real wide
 * monthly-menu .xls/.xlsx parsing + Feature 023 unpivot simulation against
 * an actual file path, without touching Firestore. Does not commit or
 * embed any sample file content into the repo.
 *
 * Run: npx tsx scripts/inspectRealXls.ts <path-to-xls>
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { isWideMonthlyMenuTemplate, parseWideMonthlyMenuTemplate } from '../src/services/wideMenuTemplateParser';
import { parseCsvText } from '../src/services/menuImportService';

const path = process.argv[2];
if (!path) {
  console.error('Usage: tsx scripts/inspectRealXls.ts <path-to-xls>');
  process.exit(1);
}

const buf = fs.readFileSync(path);
const workbook = XLSX.read(buf, { type: 'buffer' });
console.log('Sheet names:', workbook.SheetNames);

const sheet = workbook.Sheets[workbook.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
console.log('Matrix rows:', matrix.length);

const detected = isWideMonthlyMenuTemplate(matrix);
console.log('\nisWideMonthlyMenuTemplate:', detected);
if (!detected) process.exit(1);

const result = parseWideMonthlyMenuTemplate(matrix);
console.log('\nyearMonth:', result.yearMonth);
console.log('headers:', result.headers);
console.log('warnings:');
result.warnings.forEach((w) => console.log('  -', w));

const { headers, rows, errors } = parseCsvText(result.csvText);
console.log('\nparseCsvText errors:', errors);
console.log('parseCsvText row count:', rows.length);

const dateHeader = headers[0];
const slotHeaders = headers.slice(1);
let itemCount = 0;
let rowCount = 0;
for (const row of rows) {
  const date = row.rawRowSnapshot[dateHeader];
  if (!date) continue;
  rowCount++;
  for (const h of slotHeaders) {
    if (row.rawRowSnapshot[h]) itemCount++;
  }
}
console.log('\nSimulated MenuImportItem-producing rows:', rowCount);
console.log('Simulated MenuImportItem doc count:', itemCount);
