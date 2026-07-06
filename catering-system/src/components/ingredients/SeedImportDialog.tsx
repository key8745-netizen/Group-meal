/**
 * SeedImportDialog — Feature 041: 常用食材一鍵建檔
 *
 * Previews a `planSeedImport()` result against the curated template set and,
 * on confirmation, runs `runSeedImport()` sequentially through
 * `ingredientMasterService.createIngredient()` (no batch writes, no rule
 * changes). Read-only preview + progress + result summary; the actual write
 * logic lives entirely in `ingredientSeedService`.
 */

import { useMemo, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster } from '@/services/types';
import {
  planSeedImport,
  runSeedImport,
  type SeedImportResult,
} from '@/services/ingredientSeedService';
import {
  INGREDIENT_SEED_TEMPLATES,
  type IngredientSeedTemplate,
} from '@/constants/ingredientSeedTemplates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  existingIngredients: IngredientMaster[];
  onClose: () => void;
  onImported: () => void;
}

type Phase = 'preview' | 'running' | 'result';

function groupByCategory(
  templates: IngredientSeedTemplate[],
): { category: string; items: IngredientSeedTemplate[] }[] {
  const order: string[] = [];
  const map = new Map<string, IngredientSeedTemplate[]>();
  for (const t of templates) {
    if (!map.has(t.category)) {
      map.set(t.category, []);
      order.push(t.category);
    }
    map.get(t.category)!.push(t);
  }
  return order.map((category) => ({ category, items: map.get(category)! }));
}

export function SeedImportDialog({ existingIngredients, onClose, onImported }: Props) {
  const plan = useMemo(
    () => planSeedImport(existingIngredients, INGREDIENT_SEED_TEMPLATES),
    [existingIngredients],
  );
  const grouped = useMemo(() => groupByCategory(plan.toCreate), [plan]);

  const [phase, setPhase] = useState<Phase>('preview');
  const [progress, setProgress] = useState({ done: 0, total: plan.toCreate.length });
  const [result, setResult] = useState<SeedImportResult | null>(null);
  const [error, setError] = useState('');

  const nothingToImport = plan.toCreate.length === 0;

  async function handleConfirm() {
    const uid = auth.currentUser?.uid ?? '';
    setPhase('running');
    setProgress({ done: 0, total: plan.toCreate.length });
    setError('');
    try {
      const res = await runSeedImport(db, plan, uid, (done, total) => setProgress({ done, total }));
      setResult(res);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗');
      setPhase('preview');
    }
  }

  function handleCloseAfterResult() {
    onImported();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex w-full max-w-2xl max-h-[85vh] flex-col gap-4 rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">匯入常用食材範本</h2>

        {phase === 'preview' && (
          <>
            {nothingToImport ? (
              <p className="text-sm text-muted-foreground">範本食材皆已存在，無需匯入。</p>
            ) : (
              <p className="text-sm text-gray-700">
                將新增 <span className="font-semibold">{plan.toCreate.length}</span> 筆・
                已存在略過 <span className="font-semibold">{plan.skippedExisting.length}</span> 筆
              </p>
            )}

            {grouped.length > 0 && (
              <div className="flex-1 overflow-y-auto rounded-md border">
                {grouped.map(({ category, items }) => (
                  <div key={category} className="border-b last:border-b-0">
                    <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold text-gray-600">
                      {category}
                    </div>
                    <ul className="divide-y">
                      {items.map((t) => (
                        <li key={t.name} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                          <span className="text-gray-900">{t.name}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              基準價 {t.defaultPrice}/{t.defaultPriceUnit}
                            </span>
                            {t.marketCropName ? (
                              <Badge variant="outline">AMIS：{t.marketCropName}</Badge>
                            ) : (
                              <span className="text-muted-foreground">無市價對應</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <p className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              匯入後請至「市場行情」按「更新市價」，查無行情的品項代表 AMIS 對應名稱需修正，
              可在本頁編輯該食材的「市場作物名稱」。
            </p>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={nothingToImport}>
                開始匯入
              </Button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-gray-700">
              匯入中… {progress.done}/{progress.total}
            </p>
            <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {phase === 'result' && result && (
          <>
            <p className="text-sm text-gray-700">
              成功 <span className="font-semibold">{result.createdCount}</span>・
              略過 <span className="font-semibold">{result.skippedCount}</span>・
              失敗 <span className="font-semibold">{result.failed.length}</span>
            </p>
            {result.failed.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border p-2 text-xs text-red-600">
                {result.failed.map((f) => (
                  <li key={f.name}>
                    {f.name}：{f.error}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={handleCloseAfterResult}>
                關閉
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
