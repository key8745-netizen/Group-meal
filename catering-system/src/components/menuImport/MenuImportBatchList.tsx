import type { MenuImportBatch } from '@/services/types';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  mappingApplied: '欄位已對應',
  parsed: '已解析',
  reviewing: '審核中',
  finalized: '已定案',
  archived: '已封存',
};

interface Props {
  batches: MenuImportBatch[];
  onSelect: (batch: MenuImportBatch) => void;
  /** Feature 027: when false (default), `archived` batches are hidden. */
  showArchived?: boolean;
}

export function MenuImportBatchList({ batches, onSelect, showArchived = false }: Props) {
  const visibleBatches = showArchived ? batches : batches.filter((b) => b.importStatus !== 'archived');

  if (visibleBatches.length === 0) {
    return <p className="text-sm text-muted-foreground">尚無匯入批次</p>;
  }

  return (
    <div className="space-y-2">
      {visibleBatches.map((batch) => (
        <button
          key={batch.id}
          type="button"
          onClick={() => onSelect(batch)}
          className="w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold">{STATUS_LABELS[batch.importStatus] ?? batch.importStatus}</span>
            <span>{batch.organizationName} — {batch.yearMonth} {batch.mealProgram}</span>
            <span className="text-muted-foreground">{batch.itemCount} 項菜色</span>
            {batch.serviceDayCount !== undefined && (
              <span className="text-muted-foreground">{batch.serviceDayCount} 供餐日</span>
            )}
            {batch.skippedRowCount !== undefined && batch.skippedRowCount > 0 && (
              <span className="text-muted-foreground">略過 {batch.skippedRowCount} 列</span>
            )}
            {batch.duplicateOfBatchId && (
              <span className="text-amber-600">已確認重複匯入</span>
            )}
            {batch.operationalFinalizedAt && (
              <span className="text-emerald-600">已轉為正式營運菜單</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{batch.sourceFileName}</span>
        </button>
      ))}
    </div>
  );
}
