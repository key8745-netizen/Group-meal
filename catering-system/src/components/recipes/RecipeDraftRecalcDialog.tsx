/**
 * RecipeDraftRecalcDialog — Feature 043: 草稿份量重算
 *
 * Recomputes the BOM of recipes still marked as auto-generated drafts
 * (`DRAFT_NOTE_MARKER` in notes) against the current templates/inference
 * pipeline, previews per-recipe line diffs (e.g. 雞胸肉 70→90克), and on
 * confirmation updates only the checked recipes through
 * `recipeService.updateRecipe()` — same validation path as a manual edit.
 *
 * Recipes whose notes no longer carry the draft marker (i.e. confirmed by
 * the owner) are never listed, let alone touched.
 */

import { useEffect, useMemo, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster, Recipe } from '@/services/types';
import { listIngredients } from '@/services/ingredientMasterService';
import {
  planDraftRecalc,
  runDraftRecalc,
  type DraftRecalcPlan,
  type DraftRecalcResult,
  type DraftRecalcChange,
} from '@/services/recipeDraftService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  recipes: Recipe[];
  onClose: () => void;
  onUpdated: () => void;
}

type Phase = 'preview' | 'running' | 'result';

function formatChange(change: DraftRecalcChange): string {
  if (change.oldGrams === null) return `＋${change.ingredientName} ${change.newGrams}克`;
  if (change.newGrams === null) return `－${change.ingredientName}（原 ${change.oldGrams}克）`;
  return `${change.ingredientName} ${change.oldGrams}→${change.newGrams}克`;
}

export function RecipeDraftRecalcDialog({ recipes, onClose, onUpdated }: Props) {
  const [phase, setPhase] = useState<Phase>('preview');
  const [ingredients, setIngredients] = useState<IngredientMaster[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<DraftRecalcResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listIngredients(db)
      .then(setIngredients)
      .catch(() => setIngredients([]));
  }, []);

  const plan: DraftRecalcPlan | null = useMemo(
    () => (ingredients ? planDraftRecalc(recipes, ingredients) : null),
    [recipes, ingredients],
  );

  useEffect(() => {
    if (plan) setChecked(new Set(plan.toUpdate.map((i) => i.recipeId)));
  }, [plan]);

  function toggle(recipeId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }

  async function handleConfirm() {
    if (!plan) return;
    const items = plan.toUpdate.filter((i) => checked.has(i.recipeId));
    if (items.length === 0) return;
    const uid = auth.currentUser?.uid ?? '';
    setPhase('running');
    setProgress({ done: 0, total: items.length });
    setError('');
    try {
      const res = await runDraftRecalc(db, items, uid, (done, total) => setProgress({ done, total }));
      setResult(res);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重算失敗');
      setPhase('preview');
    }
  }

  function handleCloseAfterResult() {
    onUpdated();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex w-full max-w-2xl max-h-[85vh] flex-col gap-4 rounded-lg bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">草稿份量重算</h2>

        {phase === 'preview' && (
          <>
            {!plan ? (
              <p className="text-sm text-muted-foreground">載入食材主檔中…</p>
            ) : (
              <>
                <p className="text-sm text-foreground">
                  份量有差異 <span className="font-semibold">{plan.toUpdate.length}</span> 道・
                  已是最新 <span className="font-semibold">{plan.unchangedCount}</span> 道・
                  非草稿不處理 <span className="font-semibold">{plan.nonDraftCount}</span> 道
                  {plan.unresolvedDrafts.length > 0 && (
                    <>・無法重算 <span className="font-semibold">{plan.unresolvedDrafts.length}</span> 道</>
                  )}
                </p>

                {plan.toUpdate.length === 0 ? (
                  <p className="rounded-md bg-muted/30 p-4 text-sm text-muted-foreground">
                    所有配方草稿的份量都已符合目前的便當基準，無需重算。
                  </p>
                ) : (
                  <div className="flex-1 overflow-y-auto rounded-md border">
                    <ul className="divide-y">
                      {plan.toUpdate.map((item) => (
                        <li key={item.recipeId} className="px-3 py-2 text-sm">
                          <label className="flex cursor-pointer items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked.has(item.recipeId)}
                                onChange={() => toggle(item.recipeId)}
                              />
                              <span className="font-medium text-foreground">{item.recipeName}</span>
                            </span>
                            <Badge variant={item.source === 'template' ? 'default' : 'secondary'}>
                              {item.source === 'template' ? `範本：${item.matchedTemplateName}` : '菜名推定'}
                            </Badge>
                          </label>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-xs text-muted-foreground">
                            {item.changes.map((change) => (
                              <span key={`${change.ingredientName}-${change.oldGrams}-${change.newGrams}`}>
                                {formatChange(change)}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {plan.unresolvedDrafts.length > 0 && (
                  <p className="text-xs text-amber-700">
                    無法重算（維持原樣）：{plan.unresolvedDrafts.join('、')}
                  </p>
                )}

                <p className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
                  只會更新備註仍標記「自動產生配方草稿」的配方；你已確認（改過備註）的配方不受影響。
                  更新後份量以目前便當基準（1 主菜 + 4 副菜）重新計算。
                </p>
              </>
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
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!plan || checked.size === 0}
              >
                重算所選 {checked.size} 道
              </Button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-foreground">
              更新中… {progress.done}/{progress.total}
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
            <p className="text-sm text-foreground">
              成功更新 <span className="font-semibold">{result.updatedCount}</span> 道・
              失敗 <span className="font-semibold">{result.failed.length}</span> 道
            </p>
            {result.failed.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border p-2 text-xs text-red-600">
                {result.failed.map((f) => (
                  <li key={f.recipeName}>
                    {f.recipeName}：{f.error}
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
