import { useState } from 'react';
import type { MenuMixRecommendation } from '@/services/types';
import { MenuMixRecommendationResult } from './MenuMixRecommendationResult';
import { Button } from '@/components/ui/button';

const STATUS_LABELS: Record<string, string> = {
  feasible: '可行',
  risky: '有風險',
  notRecommended: '不建議',
};

const STATUS_COLORS: Record<string, string> = {
  feasible: 'text-green-700',
  risky: 'text-yellow-700',
  notRecommended: 'text-red-700',
};

interface Props {
  records: MenuMixRecommendation[];
  onCreateDraft?: (recommendation: MenuMixRecommendation) => void;
}

export function MenuMixRecommendationHistory({ records, onCreateDraft }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">尚無記錄</p>;
  }

  return (
    <div className="space-y-2">
      {records.map((rec) => {
        const expanded = expandedId === rec.id;
        const createdAt = rec.createdAt
          ? (rec.createdAt as { toDate?: () => Date }).toDate?.()?.toLocaleString('zh-TW') ?? ''
          : '';

        return (
          <div key={rec.id} className="rounded-lg border">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(expanded ? null : rec.id)}
            >
              <div className="flex items-center gap-3 text-sm">
                <span className={`font-semibold ${STATUS_COLORS[rec.recommendationStatus] ?? ''}`}>
                  {STATUS_LABELS[rec.recommendationStatus] ?? rec.recommendationStatus}
                </span>
                <span>{rec.targetServingCount} 份</span>
                <span className="text-muted-foreground">{rec.recommendedMixItems.length} 道菜</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {createdAt && <span>{createdAt}</span>}
                <span>{expanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded && (
              <div className="px-4 pb-4 border-t pt-4 space-y-3">
                <MenuMixRecommendationResult result={rec} />
                {onCreateDraft && (
                  <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={() => onCreateDraft(rec)}>
                      建立草稿菜單
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
