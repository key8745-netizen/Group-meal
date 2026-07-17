/**
 * RecipeFlavorAdvisorPanel — Feature 075/076: 依配方目前的食材集合，顯示聚合的
 * 風味搭配建議與料理技法提醒。純唯讀參考，不改任何資料；無內容則不顯示。
 *
 * - 搭配建議：跨食材彙整「還可以加什麼」，依共識度（被幾個食材共同推薦）排序，
 *   共識 >= 2 者標記為「絕配」。
 * - 技法提醒：配方中各食材的撒鹽時機/火候/解膩/油脂重點，幫廚房一次看齊。
 * - Feature 076：若帶入庫存/保鮮/成本情境（crossRefContext），搭配建議會再交叉
 *   比對並重新排序——「先清快過期的、其次用現有庫存、最後才買」，並標示狀態。
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { adviseRecipeFlavors } from '@/services/recipeFlavorAdvisor';
import {
  crossReferenceSuggestions,
  type CrossRefContext,
  type EnrichedSuggestion,
} from '@/services/flavorInventoryCrossRef';
import { formatWeight, pricePerDisplayUnit } from '@/utils/unitConverter';
import { useWeightUnit } from '@/contexts/WeightUnitContext';

/** 交叉比對後每個建議的樣式與標籤文案。 */
function tagStyle(e: EnrichedSuggestion): { className: string; label: string } | null {
  if (e.tag === 'CLEAR_STOCK') {
    const urgent = e.freshness === 'CRITICAL';
    return {
      className: 'border-orange-400 text-orange-700 dark:text-orange-400',
      label: urgent ? '庫存·急用' : '庫存·優先用',
    };
  }
  if (e.tag === 'IN_STOCK') {
    return {
      className: 'border-emerald-400 text-emerald-700 dark:text-emerald-400',
      label: '有庫存',
    };
  }
  return null; // BUY：不特別標，維持一般樣式
}

export function RecipeFlavorAdvisorPanel({
  ingredientNames,
  crossRefContext,
}: {
  ingredientNames: string[];
  /** Feature 076：帶入則交叉比對庫存/保鮮/成本並重新排序；不帶入維持純風味共識排序。 */
  crossRefContext?: CrossRefContext;
}) {
  const { unit } = useWeightUnit();
  const advice = useMemo(() => adviseRecipeFlavors(ingredientNames), [ingredientNames]);

  const enriched = useMemo<EnrichedSuggestion[]>(
    () =>
      crossRefContext
        ? crossReferenceSuggestions(advice.suggestions, crossRefContext)
        : advice.suggestions.map((s) => ({ ...s, tag: 'BUY' as const })),
    [advice.suggestions, crossRefContext],
  );

  if (advice.suggestions.length === 0 && advice.techniques.length === 0) return null;

  const hasCrossRef = !!crossRefContext;

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
      <span className="text-xs font-medium text-foreground">風味搭配 &amp; 料理技法建議（參考）</span>

      {enriched.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {hasCrossRef
              ? '依現有食材可再搭配（優先用手上快過期／現有庫存，最後才採買）'
              : '依現有食材，可再搭配（越前面越多食材共同推薦）'}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {enriched.map((s) => {
              const style = hasCrossRef ? tagStyle(s) : null;
              const parts: string[] = [];
              if (s.from.length > 0) parts.push(`來自：${s.from.join('、')}`);
              if (s.inStockKg != null) parts.push(`庫存 ${formatWeight(s.inStockKg, unit)}`);
              if (s.costPerKg != null) parts.push(`約 $${pricePerDisplayUnit(s.costPerKg, unit)}/${unit}`);
              return (
                <Badge
                  key={s.name}
                  variant="outline"
                  className={
                    style
                      ? `${style.className} font-normal`
                      : s.count >= 2
                        ? 'border-emerald-400/60 font-normal text-emerald-700 dark:text-emerald-400'
                        : 'font-normal'
                  }
                  title={parts.join(' · ') || undefined}
                >
                  {s.name}
                  {style && <span className="ml-1 text-[10px]">{style.label}</span>}
                  {!style && s.count >= 2 && <span className="ml-1 text-[10px]">絕配·{s.count}</span>}
                </Badge>
              );
            })}
          </div>
          {hasCrossRef && (
            <span className="text-[10px] text-muted-foreground">
              <span className="text-orange-600 dark:text-orange-400">橘＝手上快過期優先用</span>
              　·
              <span className="text-emerald-600 dark:text-emerald-400">綠＝現有庫存</span>
              　·　無色＝需採買
            </span>
          )}
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
