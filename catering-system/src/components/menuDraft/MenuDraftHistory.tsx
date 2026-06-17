import { useState } from 'react';
import type { MenuDraft } from '@/services/types';
import { MenuDraftPreview } from './MenuDraftPreview';
import { Button } from '@/components/ui/button';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  reviewing: '審查中',
  approved_reference: '已核可（參考用）',
  archived: '已封存',
};

interface Props {
  drafts: MenuDraft[];
  onApprove?: (draft: MenuDraft) => void;
}

export function MenuDraftHistory({ drafts, onApprove }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (drafts.length === 0) {
    return <p className="text-sm text-muted-foreground">尚無記錄</p>;
  }

  return (
    <div className="space-y-2">
      {drafts.map((draft) => {
        const expanded = expandedId === draft.id;
        const createdAt = draft.createdAt
          ? (draft.createdAt as { toDate?: () => Date }).toDate?.()?.toLocaleString('zh-TW') ?? ''
          : '';

        return (
          <div key={draft.id} className="rounded-lg border">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(expanded ? null : draft.id)}
            >
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold">{STATUS_LABELS[draft.status] ?? draft.status}</span>
                <span>{draft.menuName}</span>
                <span className="text-muted-foreground">{draft.items.length} 道菜</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {createdAt && <span>{createdAt}</span>}
                <span>{expanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded && (
              <div className="px-4 pb-4 border-t pt-4 space-y-3">
                <MenuDraftPreview draft={draft} />
                {onApprove && (
                  <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={() => onApprove(draft)}>
                      核准並建立正式菜單
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
