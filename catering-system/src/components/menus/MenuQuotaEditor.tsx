/**
 * MenuQuotaEditor — Feature 099: 編輯「一鍵均衡菜單」各類別配額。
 * 純受控元件；每類一個數字輸入（0–20）。變更即回呼，持久化由父層負責。
 */

import { Input } from '@/components/ui/input';
import type { BalancedMenuQuota } from '@/services/balancedMenuPlanner';
import { totalQuotaCount } from '@/services/menuQuotaPreference';

export function MenuQuotaEditor({
  quotas,
  onChange,
}: {
  quotas: BalancedMenuQuota[];
  onChange: (next: BalancedMenuQuota[]) => void;
}) {
  function setCount(category: string, count: number) {
    onChange(quotas.map((q) => (q.category === category ? { ...q, count: Math.max(0, Math.min(20, Math.floor(count) || 0)) } : q)));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3">
      <span className="text-xs font-medium text-foreground">一鍵均衡配額</span>
      {quotas.map((q) => (
        <label key={q.category} className="flex items-center gap-1 text-xs text-muted-foreground">
          {q.category}
          <Input
            type="number"
            min={0}
            max={20}
            step={1}
            value={q.count}
            onChange={(e) => setCount(q.category, parseInt(e.target.value, 10))}
            className="h-7 w-14 text-right tabular-nums"
          />
        </label>
      ))}
      <span className="text-[11px] text-muted-foreground">共 {totalQuotaCount(quotas)} 道</span>
    </div>
  );
}
