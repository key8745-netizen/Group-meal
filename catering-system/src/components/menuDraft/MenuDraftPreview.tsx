import type { MenuDraft } from '@/services/types';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  reviewing: '審查中',
  approved_reference: '已核可（參考用）',
  archived: '已封存',
};

const SOURCE_STATUS_LABELS: Record<string, string> = {
  feasible: '可行',
  risky: '有風險',
  notRecommended: '不建議',
};

interface Props {
  draft: MenuDraft;
}

export function MenuDraftPreview({ draft }: Props) {
  const createdAt = draft.createdAt
    ? (draft.createdAt as { toDate?: () => Date }).toDate?.()?.toLocaleString('zh-TW') ?? ''
    : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="px-3 py-1 rounded-full text-sm font-semibold border bg-blue-100 text-blue-800 border-blue-300">
          {STATUS_LABELS[draft.status] ?? draft.status}
        </span>
        <span className="text-sm font-medium">{draft.menuName}</span>
        <span className="text-xs text-muted-foreground">
          來源建議狀態：{SOURCE_STATUS_LABELS[draft.sourceRecommendationStatusSnapshot] ?? draft.sourceRecommendationStatusSnapshot}
        </span>
        {createdAt && <span className="text-xs text-muted-foreground">{createdAt}</span>}
      </div>

      {draft.items.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">菜色</th>
                <th className="px-3 py-2 text-right font-medium">份數</th>
                <th className="px-3 py-2 text-right font-medium">比例</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {draft.items.map((item) => (
                <tr key={item.recipeId} className="hover:bg-muted/20">
                  <td className="px-3 py-2">{item.recipeNameSnapshot}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.servingCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Math.round(item.suggestedRatioSnapshot * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft.notes && (
        <div className="rounded-lg border p-3 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground mb-1">備註</p>
          <p className="text-sm">{draft.notes}</p>
        </div>
      )}

      {draft.manualReviewNotesSnapshot.length > 0 && (
        <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">來源建議人工審查備注</p>
          {draft.manualReviewNotesSnapshot.map((n, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {n}</p>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t pt-3">
        本草稿菜單僅供人工參考，非正式菜單，不會觸發任何下游自動化流程。來源建議 ID：{draft.sourceRecommendationId}
      </p>
    </div>
  );
}
