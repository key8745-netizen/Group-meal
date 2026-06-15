import type { PurchaseDemandDraft } from '@/services/types';

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function draftToCsv(draft: PurchaseDemandDraft): string {
  const header = ['草稿名稱', '來源備料規劃', '食材', '需求數量', '單位', '備註'];
  const rows = draft.items.map((item) => [
    draft.draftName,
    draft.sourcePrepPlanNameSnapshot,
    item.ingredientNameSnapshot,
    String(item.demandQuantity),
    item.baseUnit,
    item.notes ?? '',
  ]);
  return [header, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}
