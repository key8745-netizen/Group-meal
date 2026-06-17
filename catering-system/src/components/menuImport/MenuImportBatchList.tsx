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
}

export function MenuImportBatchList({ batches, onSelect }: Props) {
  if (batches.length === 0) {
    return <p className="text-sm text-muted-foreground">尚無匯入批次</p>;
  }

  return (
    <div className="space-y-2">
      {batches.map((batch) => (
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
          </div>
          <span className="text-xs text-muted-foreground">{batch.sourceFileName}</span>
        </button>
      ))}
    </div>
  );
}
