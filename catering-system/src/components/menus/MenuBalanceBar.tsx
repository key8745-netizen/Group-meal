/**
 * MenuBalanceBar — Feature 089: 顯示一份菜單的菜色類別分佈與均衡提示。
 * 純唯讀參考；建議性提示，不強制。無菜色時不顯示。
 */

import { useMemo } from 'react';
import type { DishCategory } from '@/services/types';
import { summarizeMenuBalance, DISH_CATEGORIES } from '@/services/menuBalancePlanner';
import { Badge } from '@/components/ui/badge';

export function MenuBalanceBar({ categories }: { categories: (DishCategory | null | undefined)[] }) {
  const balance = useMemo(() => summarizeMenuBalance(categories), [categories]);
  if (balance.total === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-medium text-foreground">菜單平衡</span>
        {DISH_CATEGORIES.map((c) => (
          <span
            key={c}
            className={`text-xs tabular-nums ${balance.counts[c] === 0 ? 'text-muted-foreground/60' : 'text-foreground'}`}
          >
            {c} <span className="font-semibold">{balance.counts[c]}</span>
          </span>
        ))}
        {balance.uncategorized > 0 && (
          <span className="text-xs text-muted-foreground">未分類 <span className="font-semibold">{balance.uncategorized}</span></span>
        )}
      </div>
      {balance.warnings.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {balance.warnings.map((w) => (
            <Badge key={w} variant="outline" className="border-amber-400 font-normal text-amber-700 dark:text-amber-400">
              {w}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
