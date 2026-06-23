/**
 * menuImportService — staging layer for Feature 023 (通用月菜單匯入暫存).
 *
 * Parses a CSV month-menu into `/menuImportBatches/{batchId}` plus its
 * `rows` and `items` subcollections. Never writes to any formal collection
 * (recipes/ingredients/recipeMenus/prepPlans/...) — this is staging only.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type {
  DishSlot,
  MenuImportBatch,
  MenuImportColumnMappingTemplate,
  MenuImportItem,
} from './types';

const BATCHES = 'menuImportBatches';
const TEMPLATES = 'menuImportColumnMappingTemplates';

export interface CreateBatchInput {
  sourceFileName: string;
  organizationName: string;
  yearMonth: string;
  mealProgram: string;
  servingBaseline: number;
  columnMappingTemplateId?: string;
  /** Feature 027: SHA-256 of normalized import content, if computed. */
  contentFingerprint?: string;
  /** Feature 027: set only when the user explicitly confirmed proceeding despite a detected duplicate risk. */
  duplicateOfBatchId?: string;
}

export async function createBatch(db: Firestore, input: CreateBatchInput, uid: string): Promise<string> {
  const ref = await addDoc(collection(db, BATCHES), {
    sourceFileName: input.sourceFileName,
    organizationName: input.organizationName,
    yearMonth: input.yearMonth,
    mealProgram: input.mealProgram,
    servingBaseline: input.servingBaseline,
    ...(input.columnMappingTemplateId ? { columnMappingTemplateId: input.columnMappingTemplateId } : {}),
    ...(input.contentFingerprint ? { contentFingerprint: input.contentFingerprint } : {}),
    ...(input.duplicateOfBatchId
      ? {
          duplicateOfBatchId: input.duplicateOfBatchId,
          duplicateConfirmedAt: serverTimestamp(),
          duplicateConfirmedBy: uid,
        }
      : {}),
    columnMapping: {},
    importStatus: 'draft',
    rowCount: 0,
    itemCount: 0,
    reviewedItemCount: 0,
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return ref.id;
}

/**
 * Feature 027 — deterministic SHA-256 fingerprint of normalized import
 * content, used for duplicate-risk detection. Uses the in-browser Web
 * Crypto API; no new dependency.
 */
export async function computeContentFingerprint(yearMonth: string, headers: string[], csvText: string): Promise<string> {
  const normalized = `${yearMonth}|${[...headers].sort().join(',')}|${csvText.trim().replace(/\r\n/g, '\n')}`;
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type DuplicateMatchLevel = 'contentFingerprint' | 'filenameAndMonth' | 'organizationAndMonth';

export interface DuplicateMatch {
  batch: MenuImportBatch;
  level: DuplicateMatchLevel;
}

export interface DuplicateCheckInput {
  sourceFileName: string;
  organizationName: string;
  yearMonth: string;
  mealProgram: string;
  contentFingerprint?: string;
}

/**
 * Feature 027 — checks `candidates` (typically all existing batches,
 * including archived ones) for duplicate-risk against `input`. Returns the
 * strongest match per candidate batch; never mutates anything, never
 * blocks — callers decide whether to warn/confirm.
 */
export function findDuplicateBatches(candidates: MenuImportBatch[], input: DuplicateCheckInput): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const batch of candidates) {
    if (input.contentFingerprint && batch.contentFingerprint && batch.contentFingerprint === input.contentFingerprint) {
      matches.push({ batch, level: 'contentFingerprint' });
      continue;
    }
    if (batch.sourceFileName === input.sourceFileName && batch.yearMonth === input.yearMonth) {
      matches.push({ batch, level: 'filenameAndMonth' });
      continue;
    }
    if (
      batch.organizationName === input.organizationName &&
      batch.yearMonth === input.yearMonth &&
      batch.mealProgram === input.mealProgram
    ) {
      matches.push({ batch, level: 'organizationAndMonth' });
    }
  }
  return matches;
}

/** Minimal RFC4180-subset CSV line splitter — supports quoted commas, rejects quoted newlines. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export interface ParsedCsvRow {
  rowIndex: number;
  rawRowSnapshot: Record<string, string>;
}

export interface CsvParseResult {
  headers: string[];
  rows: ParsedCsvRow[];
  errors: string[];
}

/** Splits raw CSV text into a header preview plus per-row raw snapshots. CSV/UTF-8 only. */
export function parseCsvText(csvText: string): CsvParseResult {
  const lines = csvText.split(/\r\n|\n/).filter((l) => l.length > 0);
  const errors: string[] = [];
  if (lines.length === 0) {
    return { headers: [], rows: [], errors: ['空白檔案'] };
  }

  const headers = parseCsvLine(lines[0]);
  const seen = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) {
      errors.push(`重複欄位標題：${h}`);
    }
    seen.add(h);
  }

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length !== headers.length) {
      errors.push(`第 ${i + 1} 行欄位數與標題不符，已略過`);
      continue;
    }
    const rawRowSnapshot: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawRowSnapshot[h] = cells[idx];
    });
    rows.push({ rowIndex: i, rawRowSnapshot });
  }

  return { headers, rows, errors };
}

export interface ColumnMapping {
  /** raw header -> 'date' | 'mealType' | a DishSlot value */
  [header: string]: string;
}

/**
 * Re-reads the batch by id, parses csvText with columnMapping, and writes
 * `rows`/`items` subcollection docs. Advances importStatus
 * draft/mappingApplied -> parsed.
 */
export async function parseAndCreateRowsItems(
  db: Firestore,
  batchId: string,
  csvText: string,
  columnMapping: ColumnMapping,
  uid: string,
  /** Feature 027: pre-parse warning count (e.g. from the Feature 026 wide-template parser), folded into the persisted warningCount. */
  preParseWarningCount = 0,
): Promise<{ rowCount: number; itemCount: number; serviceDayCount: number; skippedRowCount: number; warningCount: number; errors: string[] }> {
  const batchSnap = await getDoc(doc(db, BATCHES, batchId));
  if (!batchSnap.exists()) {
    throw new Error(`menuImportBatch ${batchId} not found`);
  }
  const batch = batchSnap.data() as MenuImportBatch;
  if (batch.importStatus !== 'draft' && batch.importStatus !== 'mappingApplied') {
    throw new Error(`批次狀態為「${batch.importStatus}」，無法重新解析`);
  }

  const { rows, errors } = parseCsvText(csvText);
  const dateHeader = Object.keys(columnMapping).find((h) => columnMapping[h] === 'date');
  const mealTypeHeader = Object.keys(columnMapping).find((h) => columnMapping[h] === 'mealType');
  const slotHeaders = Object.entries(columnMapping).filter(
    ([, role]) => role !== 'date' && role !== 'mealType',
  );

  let itemCount = 0;
  let rowCount = 0;
  const serviceDays = new Set<string>();
  const initialErrorCount = errors.length;

  for (const row of rows) {
    const date = dateHeader ? row.rawRowSnapshot[dateHeader] : '';
    if (!date) {
      errors.push(`第 ${row.rowIndex + 1} 行缺少日期，已略過`);
      continue;
    }
    serviceDays.add(date);
    const mealType = mealTypeHeader ? row.rawRowSnapshot[mealTypeHeader] : '';

    const rowRef = await addDoc(collection(db, BATCHES, batchId, 'rows'), {
      batchId,
      rowIndex: row.rowIndex,
      rawRowSnapshot: row.rawRowSnapshot,
      ...(date ? { parsedDate: date } : {}),
      ...(mealType ? { parsedMealType: mealType } : {}),
      createdAt: serverTimestamp(),
      createdBy: uid,
    });
    rowCount++;

    for (const [header, role] of slotHeaders) {
      const rawDishName = row.rawRowSnapshot[header];
      if (!rawDishName) continue;

      await addDoc(collection(db, BATCHES, batchId, 'items'), {
        batchId,
        rowId: rowRef.id,
        rowIndex: row.rowIndex,
        columnKey: header,
        rawDishName,
        normalizedDishName: rawDishName,
        date,
        mealType: mealType || batch.mealProgram,
        slot: role as DishSlot,
        reviewStatus: 'pending',
        matchStatus: 'unmatched',
        createdAt: serverTimestamp(),
        createdBy: uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      itemCount++;
    }
  }

  const skippedRowCount = errors.length - initialErrorCount;
  const warningCount = preParseWarningCount + skippedRowCount;
  const serviceDayCount = serviceDays.size;

  await updateDoc(doc(db, BATCHES, batchId), {
    columnMapping,
    importStatus: 'parsed',
    rowCount,
    itemCount,
    skippedRowCount,
    warningCount,
    serviceDayCount,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });

  return { rowCount, itemCount, serviceDayCount, skippedRowCount, warningCount, errors };
}

export interface UpdateItemInput {
  normalizedDishName?: string;
  reviewStatus?: MenuImportItem['reviewStatus'];
  notes?: string;
}

export async function updateItem(
  db: Firestore,
  batchId: string,
  itemId: string,
  patch: UpdateItemInput,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, BATCHES, batchId, 'items', itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function startReview(db: Firestore, batchId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, BATCHES, batchId), {
    importStatus: 'reviewing',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function finalizeBatch(db: Firestore, batchId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, BATCHES, batchId), {
    importStatus: 'finalized',
    finalizedAt: serverTimestamp(),
    finalizedBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function archiveBatch(db: Firestore, batchId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, BATCHES, batchId), {
    importStatus: 'archived',
    archivedAt: serverTimestamp(),
    archivedBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function listBatches(db: Firestore): Promise<MenuImportBatch[]> {
  const snap = await getDocs(collection(db, BATCHES));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as MenuImportBatch))
    .sort((a, b) => (b.yearMonth ?? '').localeCompare(a.yearMonth ?? ''));
}

export async function listItems(db: Firestore, batchId: string): Promise<MenuImportItem[]> {
  const snap = await getDocs(collection(db, BATCHES, batchId, 'items'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as MenuImportItem))
    .sort((a, b) => a.rowIndex - b.rowIndex || a.columnKey.localeCompare(b.columnKey));
}

export async function createTemplate(
  db: Firestore,
  input: Omit<MenuImportColumnMappingTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>,
  uid: string,
): Promise<string> {
  const ref = await addDoc(collection(db, TEMPLATES), {
    ...input,
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateTemplate(
  db: Firestore,
  templateId: string,
  input: Partial<Omit<MenuImportColumnMappingTemplate, 'id' | 'createdAt' | 'createdBy'>>,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, TEMPLATES, templateId), {
    ...input,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function listTemplates(db: Firestore): Promise<MenuImportColumnMappingTemplate[]> {
  const snap = await getDocs(collection(db, TEMPLATES));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MenuImportColumnMappingTemplate));
}
