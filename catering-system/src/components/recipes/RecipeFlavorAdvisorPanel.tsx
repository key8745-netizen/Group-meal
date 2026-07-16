/**
 * RecipeFlavorAdvisorPanel — Feature 075: 依配方目前的食材集合，顯示聚合的
 * 風味搭配建議與料理技法提醒。純唯讀參考，不改任何資料；無內容則不顯示。
 *
 * - 搭配建議：跨食材彙整「還可以加什麼」，依共識度（被幾個食材共同推薦）排序，
 *   共識 >= 2 者標記為「絕配」。
 * - 技法提醒：配方中各食材的撒鹽時機/火候/解膩/油脂重點，幫廚房一次看齊。
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { adviseRecipeFlavors } from '@/services/recipeFlavorAdvisor';

export function RecipeFlavorAdvisorPanel({ ingredientNames }: { ingredientNames: string[] }) {
  const advice = useMemo(() => adviseRecipeFlavors(ingredientNames), [ingredientNames]);

  if (advice.suggestions.length === 0 && advice.techniques.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
      <span className="text-xs font-medium text-foreground">風味搭配 &amp; 料理技法建議（參考）</span>

      {advice.suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            依現有食材，可再搭配（越前面越多食材共同推薦）
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {advice.suggestions.map((s) => (
              <Badge
                key={s.name}
                variant="outline"
                className={
                  s.count >= 2
                    ? 'border-emerald-400 font-normal text-emerald-700 dark:text-emerald-400'
                    : 'font-normal'
                }
                title={`來自：${s.from.join('、')}`}
              >
                {s.name}
                {s.count >= 2 && <span className="ml-1 text-[10px]">絕配·{s.count}</span>}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {advice.techniques.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <span className="text-[11px] text-muted-foreground">料理技法提醒</span>
          <ul className="flex flex-col gap-1.5">
            {advice.techniques.map((t) => (
              <li key={t.name} className="flex flex-col gap-0.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{t.name}</span>
                  {t.saltTiming && (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                      撒鹽：{t.saltTiming}
                    </Badge>
                  )}
                  {t.proteinType && (
                    <Badge variant="outline" className="font-normal">{t.proteinType}</Badge>
                  )}
                </div>
                {t.cookKey && (
                  <span className="text-muted-foreground"><span className="text-foreground">火候：</span>{t.cookKey}</span>
                )}
                {t.acidTip && (
                  <span className="text-muted-foreground"><span className="text-foreground">解膩：</span>{t.acidTip}</span>
                )}
                {t.fatTip && (
                  <span className="text-muted-foreground"><span className="text-foreground">油脂：</span>{t.fatTip}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
