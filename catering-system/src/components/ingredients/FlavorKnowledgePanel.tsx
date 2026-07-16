/**
 * FlavorKnowledgePanel — Feature 074: 依食材名顯示風味搭配與料理技法。
 *
 * 給定食材名，透過 flavorKnowledgeService 比對知識庫，顯示搭配建議、經典方程式
 * 與可執行技法（撒鹽時機/火候/解膩/油脂）。無命中則不顯示。純唯讀參考。
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { matchFlavorKnowledge } from '@/services/flavorKnowledgeService';

export function FlavorKnowledgePanel({ ingredientName }: { ingredientName: string }) {
  const k = useMemo(() => matchFlavorKnowledge(ingredientName), [ingredientName]);
  if (!k.pairing && !k.technique) return null;

  const t = k.technique;
  return (
    <div className="col-span-2 flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">風味搭配 &amp; 料理技法</span>
        {k.matchedName && (
          <span className="text-[11px] text-muted-foreground">對應知識庫：{k.matchedName}</span>
        )}
      </div>

      {k.pairing && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] text-muted-foreground">搭配</span>
            {k.pairing.pairsWith.slice(0, 14).map((p) => (
              <Badge key={p} variant="outline" className="font-normal">{p}</Badge>
            ))}
          </div>
          {k.pairing.classicFormulas && k.pairing.classicFormulas.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground">經典：</span>
              {k.pairing.classicFormulas.join('　·　')}
            </p>
          )}
          {k.pairing.note && (
            <p className="text-[11px] text-muted-foreground">💡 {k.pairing.note}</p>
          )}
        </div>
      )}

      {t && (
        <div className="flex flex-col gap-1 border-t pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
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
            <p className="text-xs text-muted-foreground"><span className="text-foreground">火候：</span>{t.cookKey}</p>
          )}
          {t.acidTip && (
            <p className="text-xs text-muted-foreground"><span className="text-foreground">解膩：</span>{t.acidTip}</p>
          )}
          {t.fatTip && (
            <p className="text-xs text-muted-foreground"><span className="text-foreground">油脂：</span>{t.fatTip}</p>
          )}
        </div>
      )}
    </div>
  );
}
