import type { PurchaseDemandDraft } from '@/services/types';

export function PurchaseDemandDraftPrintView({ draft }: { draft: PurchaseDemandDraft }) {
  const updatedAt = draft.updatedAt?.toDate?.();
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">採購需求草稿：{draft.draftName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        來源備料規劃：{draft.sourcePrepPlanNameSnapshot}
      </p>
      {updatedAt && (
        <p className="text-sm text-muted-foreground">
          更新時間：{updatedAt.toLocaleString('zh-TW')}
        </p>
      )}
      {draft.notes && <p className="mt-2 text-sm">備註：{draft.notes}</p>}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-1 text-left">食材</th>
            <th className="py-1 text-right">需求數量</th>
            <th className="py-1 text-left">單位</th>
            <th className="py-1 text-left">備註</th>
          </tr>
        </thead>
        <tbody>
          {draft.items.map((item) => (
            <tr key={item.ingredientId} className="border-b">
              <td className="py-1">{item.ingredientNameSnapshot}</td>
              <td className="py-1 text-right tabular-nums">{item.demandQuantity}</td>
              <td className="py-1">{item.baseUnit}</td>
              <td className="py-1">{item.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
