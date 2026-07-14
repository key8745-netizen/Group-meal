/**
 * RecipeDraftImportDialog — Feature 042: 配方草稿自動建立
 *
 * Lets the owner pick a previously imported monthly-menu batch
 * (`menuImportBatches`), previews a `planRecipeDrafts()` result against the
 * dish names in that batch (curated templates first, name-based ingredient
 * inference as fallback), and on confirmation runs
 * `runRecipeDraftImport()` sequentially through `recipeService.createRecipe()`.
 * Mirrors `SeedImportDialog` (Feature 041)'s preview/progress/result UX.
 *
 * Read-only with respect to menu-import staging — this dialog never writes
 * to `menuImportBatches` and never overwrites an existing recipe.
 */

import { useEffect, useMemo, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster, Recipe } from '@/services/types';
import { listIngredients } from '@/services/ingredientMasterService';
import {
  planRecipeDrafts,
  runRecipeDraftImport,
  listImportBatchesLite,
  listBatchDishNames,
  type RecipeDraftPlan,
  type RecipeDraftImportResult,
  type ImportBatchLite,
} from '@/services/recipeDraftService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  existingRecipes: Recipe[];
  onClose: () => void;
  onImported: () => void;
}

type Phase = 'select' | 'preview' | 'running' | 'result';

export function RecipeDraftImportDialog({ existingRecipes, onClose, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>('select');
  const [batches, setBatches] = useState<ImportBatchLite[] | null>(null);
  const [batchId, setBatchId] = useState('');
  const [ingredients, setIngredients] = useState<IngredientMaster[]>([]);

  const [plan, setPlan] = useState<RecipeDraftPlan | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<RecipeDraftImportResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listImportBatchesLite(db)
      .then(setBatches)
      .catch(() => setBatches([]));
    listIngredients(db)
      .then(setIngredients)
      .catch(() => setIngredients([]));
  }, []);

  const templateHits = useMemo(() => plan?.toCreate.filter((i) => i.source === 'template') ?? [], [plan]);
  const inferredHits = useMemo(() => plan?.toCreate.filter((i) => i.source === 'inferred') ?? [], [plan]);

  async function handlePreview() {
    if (!batchId) return;
    setLoadingPreview(true);
    setError('');
    try {
      const dishNames = await listBatchDishNames(db, batchId);
      setPlan(planRecipeDrafts(dishNames, ingredients, existingRecipes));
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入批次菜名失敗');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirm() {
    if (!plan) return;
    const uid = auth.currentUser?.uid ?? '';
    setPhase('running');
    setProgress({ done: 0, total: plan.toCreate.length });
    setError('');
    try {
      const res = await runRecipeDraftImport(db, plan, uid, (done, total) => setProgress({ done, total }));
      setResult(res);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗');
      setPhase('preview');
    }
  }

  function handleCloseAfterResult() {
    onImported();
    onClose();
  }

  const nothingToImport = (plan?.toCreate.length ?? 0) === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex w-full max-w-2xl max-h-[85vh] flex-col gap-4 rounded-lg bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">從月菜單產生配方草稿</h2>

        {phase === 'select' && (
          <>
            {batches === null ? (
              <p className="text-sm text-muted-foreground">載入中…</p>
            ) : batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無匯入批次，請先至「月菜單匯入」建立批次。</p>
            ) : (
              <div className="space-y-2">
                <label className="text-sm text-foreground">選擇月菜單匯入批次</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  <option value="">請選擇…</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="button" onClick={handlePreview} disabled={!batchId || loadingPreview}>
                {loadingPreview ? '載入中…' : '產生預覽'}
              </Button>
            </div>
          </>
        )}

        {phase === 'preview' && plan && (
          <>
            <p className="text-sm text-foreground">
              範本命中 <span className="font-semibold">{templateHits.length}</span> 道・
              菜名推定 <span className="font-semibold">{inferredHits.length}</span> 道・
              已有配方略過 <span className="font-semibold">{plan.skippedExisting.length}</span> 道・
              無法推定 <span className="font-semibold">{plan.unmatched.length}</span> 道
            </p>

            <div className="flex-1 overflow-y-auto rounded-md border">
              {plan.toCreate.length > 0 && (
                <ul className="divide-y">
                  {plan.toCreate.map((item) => (
                    <li key={item.dishName} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{item.dishName}</span>
                        <Badge variant={item.source === 'template' ? 'default' : 'secondary'}>
                          {item.source === 'template' ? `範本：${item.matchedTemplateName}` : '菜名推定'}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {item.bom.map((line) => (
                          <span key={line.ingredientId}>
                            {line.ingredientName} × {line.grams}克/份
                          </span>
                        ))}
                      </div>
                      {item.notes.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-xs text-amber-700">
                          {item.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {plan.unmatched.length > 0 && (
                <div className="border-t bg-muted/20 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">無法推定（{plan.unmatched.length}）</p>
                  <p className="text-xs text-muted-foreground">{plan.unmatched.join('、')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">可先於配方管理手動建立或調整菜名比對</p>
                </div>
              )}
            </div>

            <p className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              建立的配方為草稿性質（備註已標明），請逐道確認食材與份量。
            </p>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setPhase('select')}>
                上一步
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={nothingToImport}>
                開始建立
              </Button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-foreground">
              建立中… {progress.done}/{progress.total}
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

        {phase === 'result' && result && plan && (
          <>
            <p className="text-sm text-foreground">
              成功 <span className="font-semibold">{result.createdCount}</span>・
              略過 <span className="font-semibold">{result.skippedCount}</span>・
              無法推定 <span className="font-semibold">{result.unmatchedCount}</span>・
              失敗 <span className="font-semibold">{result.failed.length}</span>
            </p>
            {result.failed.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border p-2 text-xs text-red-600">
                {result.failed.map((f) => (
                  <li key={f.dishName}>
                    {f.dishName}：{f.error}
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
