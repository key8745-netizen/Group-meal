import type { AIContextSnapshot } from '@/types/aiBoundary';

interface Props {
  /** Snapshot used to generate the suggestion */
  snapshot: Pick<AIContextSnapshot, 'snapshotId' | 'generatedAt' | 'sourceCollections'>;
}

/**
 * Displays safe metadata about the snapshot that produced the suggestion.
 * MUST NOT display: raw logs, raw OCR text, PII, supplier-sensitive data.
 */
export function AISuggestionDataLineage({ snapshot }: Props) {
  const { snapshotId, generatedAt, sourceCollections } = snapshot;

  return (
    <div data-testid="data-lineage" className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
      <p className="font-medium text-gray-700 text-sm">資料來源</p>
      <p>
        <span className="font-medium">快照 ID：</span>
        <span className="font-mono">{snapshotId}</span>
      </p>
      <p>
        <span className="font-medium">建立時間：</span>
        {generatedAt.toLocaleString('zh-TW')}
      </p>
      <p>
        <span className="font-medium">資料來源：</span>
        {sourceCollections.join('、')}
      </p>
    </div>
  );
}
