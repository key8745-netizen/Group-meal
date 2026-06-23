/**
 * MatchReviewWorkbench — Feature 025 (人工審核工作台). Batch-scoped review UI
 * built on top of existing Feature 024 staging services. Never writes to
 * recipes/ingredients — all mutations go through dishNameMatchingService,
 * which is itself bound by Firestore rules to reference-only matchedRecipeId
 * writes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import type { MatchStatus, MenuImportBatch, MenuImportItem, Recipe } from '@/services/types';
import { listBatches, listItems } from '@/services/menuImportService';
import { confirmMapping, rejectMapping, reopenForReview } from '@/services/dishNameMatchingService';
import { listRecipes } from '@/services/recipeService';
import { MenuImportBatchList } from '@/components/menuImport/MenuImportBatchList';
import { MatchStatusFilterBar } from './MatchStatusFilterBar';
import { MatchItemDetailPanel } from './MatchItemDetailPanel';
import { AliasReviewPanel } from './AliasReviewPanel';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

type Section = 'items' | 'aliases';

export function MatchReviewWorkbench() {
  const [section, setSection] = useState<Section>('items');
  const [batches, setBatches] = useState<MenuImportBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<MenuImportBatch | null>(null);
  const [items, setItems] = useState<MenuImportItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filter, setFilter] = useState<MatchStatus | 'all'>('pending_review');
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const reloadBatches = useCallback(() => {
    listBatches(db).then(setBatches).catch(() => {});
  }, []);

  useEffect(() => {
    reloadBatches();
    listRecipes(db).then(setRecipes).catch(() => {});
  }, [reloadBatches]);

  const openBatch = useCallback((batch: MenuImportBatch) => {
    setActiveBatch(batch);
    listItems(db, batch.id).then(setItems).catch(() => {});
  }, []);

  const refreshItems = useCallback(() => {
    if (!activeBatch) return;
    listItems(db, activeBatch.id).then(setItems).catch(() => {});
  }, [activeBatch]);

  const counts = useMemo(() => {
    const base: Record<MatchStatus, number> = { unmatched: 0, pending_review: 0, mapped: 0, unresolved: 0, rejected: 0 };
    for (const item of items) base[item.matchStatus] = (base[item.matchStatus] ?? 0) + 1;
    return base;
  }, [items]);

  const visibleItems = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.matchStatus === filter)),
    [items, filter],
  );

  async function withBusy(itemId: string, fn: () => Promise<void>) {
    const uid = auth.currentUser?.uid;
    if (!uid || !activeBatch) return;
    setBusyItemId(itemId);
    try {
      await fn();
      refreshItems();
    } catch (err) {
      toast({ title: '操作失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' });
    } finally {
      setBusyItemId(null);
    }
  }

  const sectionToggle = (
    <div className="flex gap-1 w-fit rounded-md border bg-muted/20 p-1">
      <button
        type="button"
        onClick={() => setSection('items')}
        className={['rounded-md px-3 py-1.5 text-xs font-medium', section === 'items' ? 'bg-background shadow-sm' : 'text-muted-foreground'].join(' ')}
      >
        菜名比對審核
      </button>
      <button
        type="button"
        onClick={() => setSection('aliases')}
        className={['rounded-md px-3 py-1.5 text-xs font-medium', section === 'aliases' ? 'bg-background shadow-sm' : 'text-muted-foreground'].join(' ')}
      >
        別名審核
      </button>
    </div>
  );

  if (section === 'aliases') {
    return (
      <div className="space-y-4 p-1">
        {sectionToggle}
        <AliasReviewPanel recipes={recipes} />
      </div>
    );
  }

  if (!activeBatch) {
    return (
      <div className="space-y-3 p-1">
        {sectionToggle}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">選擇一個匯入批次進行菜名比對審核。</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            顯示已封存批次
          </label>
        </div>
        <MenuImportBatchList batches={batches} onSelect={openBatch} showArchived={showArchived} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {sectionToggle}
      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="ghost" onClick={() => setActiveBatch(null)}>返回批次列表</Button>
        <p className="text-sm text-muted-foreground">{activeBatch.organizationName} — {activeBatch.yearMonth} {activeBatch.mealProgram}</p>
      </div>

      <MatchStatusFilterBar value={filter} counts={counts} onChange={setFilter} />

      <div className="space-y-3">
        {visibleItems.length === 0 && (
          <p className="text-sm text-muted-foreground">此分類目前沒有項目。</p>
        )}
        {visibleItems.map((item) => (
          <MatchItemDetailPanel
            key={item.id}
            db={db}
            item={item}
            recipes={recipes}
            busy={busyItemId === item.id}
            onConfirmMapping={(recipeId) =>
              withBusy(item.id, async () => {
                const uid = auth.currentUser?.uid;
                if (!uid) return;
                await confirmMapping(db, activeBatch.id, item.id, recipeId, uid);
              })
            }
            onRejectMapping={() =>
              withBusy(item.id, async () => {
                const uid = auth.currentUser?.uid;
                if (!uid) return;
                await rejectMapping(db, activeBatch.id, item.id, uid);
              })
            }
            onReopen={() =>
              withBusy(item.id, async () => {
                const uid = auth.currentUser?.uid;
                if (!uid) return;
                await reopenForReview(db, activeBatch.id, item.id, uid);
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
