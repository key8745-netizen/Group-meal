import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MenuImportItem, Recipe } from '@/services/types';
import { actionableGroups, bulkConfirmMapping, type DishNameGroup } from '@/services/bulkDishMappingService';
import { findConfirmedAliasByNormalizedName } from '@/services/recipeAliasService';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface Props {
  batchId: string;
  items: MenuImportItem[];
  uid: string;
  onApplied: () => void;
}

interface CandidateSuggestion {
  recipeId: string;
  recipeName: string;
  source: 'exact' | 'alias';
}

function normalizeForSearch(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

export function BulkDishMappingPanel({ batchId, items, uid, onApplied }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestionsByGroup, setSuggestionsByGroup] = useState<Record<string, CandidateSuggestion[]>>({});

  useEffect(() => {
    getDocs(collection(db, 'recipes')).then((snap) => {
      setRecipes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) })).filter((r) => r.isActive));
    });
  }, []);

  const groups = useMemo(() => actionableGroups(items), [items]);

  useEffect(() => {
    if (recipes.length === 0 || groups.length === 0) return;
    let cancelled = false;
    (async () => {
      const result: Record<string, CandidateSuggestion[]> = {};
      for (const group of groups) {
        const suggestions: CandidateSuggestion[] = [];
        const exact = recipes.find((r) => normalizeForSearch(r.name) === group.normalizedDishName);
        if (exact) suggestions.push({ recipeId: exact.id, recipeName: exact.name, source: 'exact' });
        const alias = await findConfirmedAliasByNormalizedName(db, group.normalizedDishName);
        if (alias && !suggestions.some((s) => s.recipeId === alias.recipeId)) {
          const aliasRecipe = recipes.find((r) => r.id === alias.recipeId);
          if (aliasRecipe) suggestions.push({ recipeId: aliasRecipe.id, recipeName: aliasRecipe.name, source: 'alias' });
        }
        result[group.normalizedDishName] = suggestions;
      }
      if (!cancelled) setSuggestionsByGroup(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [recipes, groups]);

  if (groups.length === 0) {
    return null;
  }

  const activeGroup: DishNameGroup | undefined = groups.find((g) => g.normalizedDishName === activeGroupKey);

  const filteredRecipes = searchText.trim()
    ? recipes.filter((r) => r.name.toLowerCase().includes(searchText.trim().toLowerCase()))
    : recipes;

  const openGroup = (group: DishNameGroup) => {
    setActiveGroupKey(group.normalizedDishName);
    setSearchText('');
    setApplyToAll(true);
    setSelectedItemIds(new Set(group.mappableItems.map((i) => i.id)));
    const suggestion = suggestionsByGroup[group.normalizedDishName]?.[0];
    setSelectedRecipeId(suggestion?.recipeId ?? null);
    setShowConfirm(false);
  };

  const targetItems = () => {
    if (!activeGroup) return [];
    return applyToAll ? activeGroup.mappableItems : activeGroup.mappableItems.filter((i) => selectedItemIds.has(i.id));
  };

  const handleApply = async () => {
    if (!activeGroup || !selectedRecipeId) return;
    const items = targetItems();
    if (items.length === 0) return;
    setApplying(true);
    try {
      const result = await bulkConfirmMapping(db, batchId, items, selectedRecipeId, uid);
      if (result.failedItems.length > 0) {
        toast({
          title: '部分項目對應失敗',
          description: result.failedItems.map((f) => f.error).join('；'),
          variant: 'destructive',
        });
      }
      if (result.succeededItemIds.length > 0) {
        toast({ title: '已套用對應', description: `成功對應 ${result.succeededItemIds.length} 筆項目` });
      }
      setActiveGroupKey(null);
      setShowConfirm(false);
      onApplied();
    } catch (err) {
      toast({ title: '對應失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded-md border p-4 space-y-3">
      <p className="text-sm font-medium">批次將匯入菜色對應既有配方</p>
      <p className="text-xs text-muted-foreground">尚有 {groups.reduce((sum, g) => sum + g.mappableItems.length, 0)} 筆項目可對應，依菜名分組顯示</p>

      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.normalizedDishName} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <div>
              <span className="font-medium">{group.sampleRawDishName}</span>
              <span className="text-muted-foreground ml-2">{group.mappableItems.length} 筆可對應</span>
              {group.alreadyMappedCount > 0 && <span className="text-emerald-600 ml-2">{group.alreadyMappedCount} 筆已對應（不可變更）</span>}
              {group.rejectedCount > 0 && <span className="text-muted-foreground ml-2">{group.rejectedCount} 筆已拒絕</span>}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => openGroup(group)}>選擇配方對應</Button>
          </div>
        ))}
      </div>

      {activeGroup && !showConfirm && (
        <div className="rounded-md border border-primary/40 p-3 space-y-3">
          <p className="text-sm font-medium">「{activeGroup.sampleRawDishName}」對應既有配方</p>

          {(suggestionsByGroup[activeGroup.normalizedDishName]?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">建議候選</p>
              {suggestionsByGroup[activeGroup.normalizedDishName].map((s) => (
                <label key={s.recipeId} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="candidate"
                    checked={selectedRecipeId === s.recipeId}
                    onChange={() => setSelectedRecipeId(s.recipeId)}
                  />
                  {s.recipeName}
                  <span className="text-xs text-muted-foreground">{s.source === 'exact' ? '名稱完全相符' : '別名比對'}</span>
                </label>
              ))}
            </div>
          )}

          <input
            className="w-full rounded-md border px-2 py-1 text-sm"
            placeholder="搜尋配方名稱"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <div className="max-h-32 overflow-y-auto space-y-1">
            {filteredRecipes.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="candidate" checked={selectedRecipeId === r.id} onChange={() => setSelectedRecipeId(r.id)} />
                {r.name}
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
            套用到全部 {activeGroup.mappableItems.length} 筆同名項目
          </label>

          {!applyToAll && (
            <div className="space-y-1">
              {activeGroup.mappableItems.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedItemIds.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(selectedItemIds);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelectedItemIds(next);
                    }}
                  />
                  {item.date} {item.mealType}（{item.matchStatus}）
                </label>
              ))}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setActiveGroupKey(null)}>取消</Button>
            <Button type="button" size="sm" disabled={!selectedRecipeId || targetItems().length === 0} onClick={() => setShowConfirm(true)}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {activeGroup && showConfirm && (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 space-y-3">
          <p className="text-sm font-medium text-amber-800">確認對應</p>
          <p className="text-xs text-amber-700">
            將把「{activeGroup.sampleRawDishName}」的 {targetItems().length} 筆項目對應到配方「
            {recipes.find((r) => r.id === selectedRecipeId)?.name ?? selectedRecipeId}」。
          </p>
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowConfirm(false)} disabled={applying}>返回</Button>
            <Button type="button" size="sm" onClick={handleApply} disabled={applying}>
              {applying ? '套用中...' : '確認套用'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
