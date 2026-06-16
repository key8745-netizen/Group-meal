import { useState } from 'react';
import type { CapacityFeasibilityCheck, FeasibilityStatus } from '@/services/types';
import { CapacityFeasibilityResult } from './CapacityFeasibilityResult';

function statusLabel(status: FeasibilityStatus): string {
  const map: Record<FeasibilityStatus, string> = {
    feasible: '可行',
    risky: '有風險',
    notRecommended: '不建議',
  };
  return map[status];
}

function statusCls(status: FeasibilityStatus): string {
  const map: Record<FeasibilityStatus, string> = {
    feasible: 'text-green-700',
    risky: 'text-yellow-700',
    notRecommended: 'text-red-700',
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
  checks: CapacityFeasibilityCheck[];
  planName: string;
}

export function CapacityFeasibilityHistory({ checks, planName }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (checks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">此製程規劃尚無評估記錄。</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4">建立時間</th>
            <th className="pb-2 pr-4">評估結果</th>
            <th className="pb-2 pr-4">風險</th>
            <th className="pb-2 pr-4">有效任務</th>
            <th className="pb-2">時窗（分）</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <>
              <tr
                key={check.id}
                className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === check.id ? null : check.id)}
              >
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {formatTimestamp(check.createdAt as Parameters<typeof formatTimestamp>[0])}
                </td>
                <td className={`py-2 pr-4 font-medium ${statusCls(check.result.feasibilityStatus)}`}>
                  {statusLabel(check.result.feasibilityStatus)}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {check.result.riskLevel === 'low' ? '低' : check.result.riskLevel === 'medium' ? '中' : '高'}
                </td>
                <td className="py-2 pr-4">{check.result.activeTaskCount}</td>
                <td className="py-2">{check.result.capacityWindowMinutes}</td>
              </tr>
              {expandedId === check.id && (
                <tr key={`${check.id}-detail`}>
                  <td colSpan={5} className="py-3 pb-4">
                    <CapacityFeasibilityResult
                      result={check.result}
                      planName={planName}
                      createdAt={formatTimestamp(check.createdAt as Parameters<typeof formatTimestamp>[0])}
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
