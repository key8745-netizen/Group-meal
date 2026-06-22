/**
 * AliasReviewPanel — Feature 025. RecipeAlias human review: pending ->
 * confirmed / rejected only. confirmed/rejected are immutable (enforced by
 * Firestore rules — update is gated on resource.data.status == 'pending').
 * Duplicate normalizedAlias conflicts (same alias text, different recipeId,
 * both still pending) are detected client-side from the existing alias list
 * and block confirmation — no auto-merge, no auto-delete.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import type { Recipe, RecipeAlias } from '@/services/types';
import { listAliases, confirmAlias, rejectAlias } from '@/services/recipeAliasService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const STATUS_LABEL: Record<RecipeAlias['status'], string> = {
  pending: '待審核',
  confirmed: '已確認（不可變更）',
  rejected: '已拒絕（終止）',
};

interface Props {
  recipes: Recipe[];
}

export function AliasReviewPanel({ recipes }: Props) {
  const [aliases, setAliases] = useState<RecipeAlias[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    listAliases(db).then(setAliases).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const recipeName = useCallback(
    (recipeId: string) => recipes.find((r) => r.id === recipeId)?.name ?? recipeId,
    [recipes],
  );

  // Conflict: another alias with the same normalizedAlias, a different
  // recipeId, and still pending (not yet rejected out of contention).
  const conflictMap = useMemo(() => {
    const map = new Map<string, RecipeAlias[]>();
    for (const a of aliases) {
      if (a.status !== 'pending') continue;
      const others = aliases.filter(
        (b) => b.id !== a.id && b.normalizedAlias === a.normalizedAlias && b.recipeId !== a.recipeId && b.status === 'pending',
      );
      if (others.length > 0) map.set(a.id, others);
    }
    return map;
  }, [aliases]);

  async function withBusy(id: string, fn: () => Promise<void>) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setBusyId(id);
    try {
      await fn();
      reload();
    } catch (err) {
      toast({ title: '操作失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  if (aliases.length === 0) {
    return <p className="text-sm text-muted-foreground">目前沒有別名待審核。</p>;
  }

  return (
    <div className="space-y-2">
      {aliases.map((alias) => {
        const conflicts = conflictMap.get(alias.id);
        const isPending = alias.status === 'pending';
        return (
          <div key={alias.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{alias.rawAlias}</p>
                <p className="text-xs text-muted-foreground">對應配方：{recipeName(alias.recipeId)}</p>
              </div>
              <Badge variant="outline">{STATUS_LABEL[alias.status]}</Badge>
            </div>

            {conflicts && conflicts.length > 0 && (
              <div className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                衝突：「{alias.rawAlias}」同時對應其他待審配方（{conflicts.map((c) => recipeName(c.recipeId)).join('、')}），
                需先由人工拒絕其中一方才能確認此別名。
              </div>
            )}

            {isPending && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId === alias.id || !!conflicts}
                  onClick={() => withBusy(alias.id, async () => {
                    const uid = auth.currentUser?.uid;
                    if (!uid) return;
                    await confirmAlias(db, alias.id, uid);
                  })}
                >
                  確認
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === alias.id}
                  onClick={() => withBusy(alias.id, async () => {
                    const uid = auth.currentUser?.uid;
                    if (!uid) return;
                    await rejectAlias(db, alias.id, uid);
                  })}
                >
                  拒絕
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
