/**
 * wideMenuTemplateParser — Feature 026 (支援橫向月菜單版型匯入).
 *
 * Detects and converts a horizontal/wide monthly menu template (ROC
 * year/month title row, day-only date column, one column per dish slot)
 * into synthetic CSV text. The synthetic CSV is then handed unmodified to
 * the existing Feature 023 `parseCsvText` / `ColumnMappingForm` /
 * `parseAndCreateRowsItems` pipeline — this module performs no staging
 * writes and introduces no new schema.
 */

export type SheetMatrix = unknown[][];

export interface WideTemplateParseResult {
  csvText: string;
  headers: string[];
  warnings: string[];
  /** 'YYYY-MM', Gregorian */
  yearMonth: string;
}

const ROC_TITLE_RE = /(\d{2,3})\s*年\s*(\d{1,2})\s*月/;
const NON_SERVICE_KEYWORDS = ['服務準備周', '不供餐', '休館', '休園'];
const IGNORED_HEADER_KEYWORDS = ['星期', '週', '營養', '備註', '合計', '總計'];
const TITLE_SCAN_ROWS = 5;

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function findTitleRowIndex(matrix: SheetMatrix): number {
  const limit = Math.min(matrix.length, TITLE_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    for (const cell of row) {
      if (ROC_TITLE_RE.test(cellText(cell))) return r;
    }
  }
  return -1;
}

function findHeaderRowIndex(matrix: SheetMatrix, afterRow: number): number {
  for (let r = afterRow + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const texts = row.map(cellText);
    if (texts.some((t) => t === '日期')) return r;
  }
  return -1;
}

function isIgnoredHeader(header: string): boolean {
  return IGNORED_HEADER_KEYWORDS.some((kw) => header.includes(kw));
}

function isNonServiceCell(text: string): boolean {
  return NON_SERVICE_KEYWORDS.some((kw) => text.includes(kw));
}

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface DetectedShape {
  titleRowIndex: number;
  headerRowIndex: number;
  dateColIndex: number;
  slotColumns: { index: number; header: string }[];
  gregorianYear: number;
  month: number;
}

function detectShape(matrix: SheetMatrix): DetectedShape | null {
  const titleRowIndex = findTitleRowIndex(matrix);
  if (titleRowIndex === -1) return null;

  const titleRow = matrix[titleRowIndex] ?? [];
  const titleText = titleRow.map(cellText).find((t) => ROC_TITLE_RE.test(t)) ?? '';
  const match = titleText.match(ROC_TITLE_RE);
  if (!match) return null;
  const rocYear = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(rocYear) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const gregorianYear = rocYear + 1911;

  const headerRowIndex = findHeaderRowIndex(matrix, titleRowIndex);
  if (headerRowIndex === -1) return null;

  const headerRow = matrix[headerRowIndex] ?? [];
  const dateColIndex = headerRow.findIndex((c) => cellText(c) === '日期');
  if (dateColIndex === -1) return null;

  const slotColumns: { index: number; header: string }[] = [];
  headerRow.forEach((c, idx) => {
    if (idx === dateColIndex) return;
    const header = cellText(c);
    if (!header || isIgnoredHeader(header)) return;
    slotColumns.push({ index: idx, header });
  });
  if (slotColumns.length === 0) return null;

  return { titleRowIndex, headerRowIndex, dateColIndex, slotColumns, gregorianYear, month };
}

/** True if `matrix` looks like a wide monthly menu template (ROC title row + 日期 header + ≥1 dish column). */
export function isWideMonthlyMenuTemplate(matrix: SheetMatrix): boolean {
  return detectShape(matrix) !== null;
}

/**
 * Converts a wide monthly menu template matrix into synthetic CSV text
 * compatible with the existing `parseCsvText` pipeline. Throws if the
 * matrix does not match the expected shape — callers should check
 * `isWideMonthlyMenuTemplate` first.
 */
export function parseWideMonthlyMenuTemplate(matrix: SheetMatrix): WideTemplateParseResult {
  const shape = detectShape(matrix);
  if (!shape) {
    throw new Error('未偵測到橫向月菜單版型（缺少民國年月標題列或「日期」欄）');
  }
  const { headerRowIndex, dateColIndex, slotColumns, gregorianYear, month } = shape;

  const warnings: string[] = [];
  const headers = ['日期', ...slotColumns.map((c) => c.header)];
  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const dayText = cellText(row[dateColIndex]);
    if (!dayText) continue;
    if (isNonServiceCell(dayText)) {
      warnings.push(`第 ${r + 1} 列「${dayText}」非供餐日，已略過`);
      continue;
    }
    const dayNum = Number(dayText);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
      warnings.push(`第 ${r + 1} 列日期欄「${dayText}」無法解析，已略過`);
      continue;
    }
    const date = `${gregorianYear}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    const cells = [date, ...slotColumns.map((c) => cellText(row[c.index]))];
    lines.push(cells.map(escapeCsvCell).join(','));
  }

  return {
    csvText: lines.join('\n'),
    headers,
    warnings,
    yearMonth: `${gregorianYear}-${String(month).padStart(2, '0')}`,
  };
}
