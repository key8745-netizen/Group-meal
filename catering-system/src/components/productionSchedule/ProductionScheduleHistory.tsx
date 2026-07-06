import { useState } from 'react';
import type { ProductionScheduleSuggestion, ProductionScheduleStatus } from '@/services/types';
import { ProductionScheduleResult } from './ProductionScheduleResult';

function statusLabel(status: ProductionScheduleStatus): string {
  const map: Record<ProductionScheduleStatus, string> = {
    fits: '可完成',
    overrun: '超出時窗',
    infeasible: '無法排入',
  };
  return map[status];
}

function statusCls(status: ProductionScheduleStatus): string {
  const map: Record<ProductionScheduleStatus, string> = {
    fits: 'text-green-700',
    overrun: 'text-yellow-700',
    infeasible: 'text-red-700',
  };
  return map[status];
}

function formatTimestamp(ts: { toDate?: () => Date; seconds?: number } | undefined): string {
  if (!ts) return '—';
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString('zh-TW');
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString('zh-TW');
  return '—';
}

interface Props {
  suggestions: ProductionScheduleSuggestion[];
  planName: string;
  taskNameById?: Record<string, string>;
}

export function ProductionScheduleHistory({ suggestions, planName, taskNameById }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">此製程規劃尚無排程建議記錄。</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4">建立時間</th>
            <th className="pb-2 pr-4">排程結果</th>
            <th className="pb-2 pr-4">總工時</th>
            <th className="pb-2">無法排入</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => (
            <>
              <tr
                key={s.id}
                className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
              >
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {formatTimestamp(s.createdAt as Parameters<typeof formatTimestamp>[0])}
                </td>
                <td className={`py-2 pr-4 font-medium ${statusCls(s.scheduleStatus)}`}>
                  {statusLabel(s.scheduleStatus)}
                </td>
                <td className="py-2 pr-4">{s.makespanMinutes} 分</td>
                <td className="py-2">{s.unschedulableTaskIds.length}</td>
              </tr>
              {expandedId === s.id && (
                <tr key={`${s.id}-detail`}>
                  <td colSpan={4} className="py-3 pb-4">
                    <ProductionScheduleResult
                      result={s}
                      planName={planName}
                      createdAt={formatTimestamp(s.createdAt as Parameters<typeof formatTimestamp>[0])}
                      taskNameById={taskNameById}
                    />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
