/**
 * RecipePage — 配方管理 (Feature 011: 配方引用食材主檔)
 * CRUD (create / edit / activate-deactivate, no delete) for recipes on the
 * new `/recipes/{id}` collection.
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, BookOpen, Eye, EyeOff, Sparkles, RefreshCw } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { Recipe } from '@/services/types';
import {
  listRecipes,
  createRecipe,
  updateRecipe,
  setRecipeActive,
  type RecipeInput,
} from '@/services/recipeService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { RecipeList } from '@/components/recipes/RecipeList';
import { RecipeForm, type RecipeFormValues } from '@/components/recipes/RecipeForm';
import { RecipeDraftImportDialog } from '@/components/recipes/RecipeDraftImportDialog';
import { RecipeDraftRecalcDialog } from '@/components/recipes/RecipeDraftRecalcDialog';
import { DRAFT_NOTE_MARKER } from '@/services/recipeDraftService';
import { listIngredients } from '@/services/ingredientMasterService';
import { getMarketPriceSnapshot, todayLocalIsoDate } from '@/services/marketPriceService';
import {
  estimateRecipeCostPerServing,
  breakdownRecipeCost,
  resolveIngredientPrice,
} from '@/services/costAwareMenuSuggestionService';
import { collection, getDocs } from 'firebase/firestore';
import { listAllBatches } from '@/services/inventoryBatchService';
import { batchState } from '@/services/freshnessService';
import type {
  IngredientMaster,
  MarketPriceSnapshot,
  InventoryDoc,
  InventoryBatch,
  FreshnessState,
  IngredientFreshnessParams,
} from '@/services/types';
import type { CrossRefContext } from '@/services/flavorInventoryCrossRef';
import type { RecipeCostCell } from '@/components/recipes/RecipeList';

/** 新鮮度嚴重度排序（數字大 = 更該優先處理），用於取每食材「最差」批次狀態。 */
const FRESHNESS_URGENCY: Record<FreshnessState, number> = {
  EXPIRED: 5, CRITICAL: 4, USE_FIRST: 3, FRESH: 2, DEPLETED: 1,
};

type EditingState =
  | { mode: 'create' }
  | { mode: 'edit'; recipe: Recipe }
  | null;

function toFormValues(recipe: Recipe): RecipeFormValues {
  return {
    name: recipe.name,
    isActive: recipe.isActive,
    notes: recipe.notes ?? '',
    recipeIngredients: (recipe.recipeIngredients ?? []).map((item) => ({
      ingredientId: item.ingredientId,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes ?? '',
    })),
  };
}

export default function RecipePage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showDraftImport, setShowDraftImport] = useState(false);
  const [showDraftRecalc, setShowDraftRecalc] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientMaster[]>([]);
  const [snapshot, setSnapshot] = useState<MarketPriceSnapshot | null>(null);
  // Feature 076: 交叉比對用的庫存與批次（載入失敗僅退化為純風味建議）。
  const [stockKgById, setStockKgById] = useState<Map<string, number>>(new Map());
  const [batches, setBatches] = useState<InventoryBatch[]>([]);

  async function reload() {
    setLoading(true);
    try {
      const list = await listRecipes(db, { includeInactive: true });
      setRecipes(list);
    } catch {
      toast({ variant: 'destructive', title: '無法載入配方資料' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // Feature 053: 每份成本欄（市價優先、基準價備援）——載入失敗僅不顯示成本。
    listIngredients(db).then(setIngredients).catch(() => setIngredients([]));
    getMarketPriceSnapshot(db, todayLocalIsoDate()).then(setSnapshot).catch(() => setSnapshot(null));
    // Feature 076: 庫存現量（inventory.currentStock）與批次（保鮮）。
    getDocs(collection(db, 'inventory'))
      .then((snap) => {
        const m = new Map<string, number>();
        snap.docs.forEach((d) => {
          const inv = d.data() as InventoryDoc;
          if (typeof inv.currentStock === 'number') m.set(d.id, inv.currentStock);
        });
        setStockKgById(m);
      })
      .catch(() => setStockKgById(new Map()));
    listAllBatches(db).then(setBatches).catch(() => setBatches([]));
  }, []);

  const ingredientById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients],
  );

  const costByRecipeId = useMemo(() => {
    if (ingredients.length === 0) return undefined;
    const map = new Map<string, RecipeCostCell>();
    for (const recipe of recipes) {
      const est = estimateRecipeCostPerServing(recipe, ingredientById, snapshot);
      map.set(recipe.id, { costPerServing: est.costPerServing, complete: est.complete });
    }
    return map;
  }, [recipes, ingredients, ingredientById, snapshot]);

  // Feature 064: 編輯中配方的每份成本明細（依已儲存的 recipeIngredients）。
  const editingCostBreakdown = useMemo(() => {
    if (editing?.mode !== 'edit' || ingredients.length === 0) return undefined;
    return breakdownRecipeCost(editing.recipe.recipeIngredients ?? [], ingredientById, snapshot);
  }, [editing, ingredients, ingredientById, snapshot]);

  // Feature 076: 風味建議交叉比對情境——庫存現量、每食材最差批次新鮮度、每公斤估價。
  const crossRefContext = useMemo<CrossRefContext>(() => {
    const todayIso = todayLocalIsoDate();

    // 每食材保鮮參數（供 batchState 判斷）。
    const paramsById = new Map<string, IngredientFreshnessParams>();
    ingredients.forEach((ing) => {
      paramsById.set(ing.id, {
        isPerishable: ing.isPerishable,
        defaultStorageType: ing.defaultStorageType,
        shelfLifeDaysAmbient: ing.shelfLifeDaysAmbient,
        shelfLifeDaysChilled: ing.shelfLifeDaysChilled,
        shelfLifeDaysFrozen: ing.shelfLifeDaysFrozen,
        warnThresholdDays: ing.warnThresholdDays,
        criticalThresholdDays: ing.criticalThresholdDays,
      });
    });

    // 取每食材所有批次中「最緊急」的新鮮度狀態。
    const freshnessByIngredientId = new Map<string, FreshnessState>();
    for (const b of batches) {
      const state = batchState(b, paramsById.get(b.ingredientId) ?? {}, todayIso);
      const prev = freshnessByIngredientId.get(b.ingredientId);
      if (!prev || FRESHNESS_URGENCY[state] > FRESHNESS_URGENCY[prev]) {
        freshnessByIngredientId.set(b.ingredientId, state);
      }
    }

    // 每公斤估價（市價優先、基準價備援）。
    const costPerKgByIngredientId = new Map<string, number>();
    ingredients.forEach((ing) => {
      const price = resolveIngredientPrice(ing, snapshot);
      if (price.pricePerKg != null && price.pricePerKg > 0) {
        costPerKgByIngredientId.set(ing.id, price.pricePerKg);
      }
    });

    return {
      ingredients: ingredients.map((i) => ({ id: i.id, name: i.name })),
      stockByIngredientId: stockKgById,
      freshnessByIngredientId,
      costPerKgByIngredientId,
    };
  }, [ingredients, batches, stockKgById, snapshot]);

  async function handleSave(input: RecipeInput) {
    const uid = auth.currentUser?.uid ?? '';
    if (editing?.mode === 'edit') {
      await updateRecipe(db, editing.recipe.id, input, uid);
      toast({ title: '儲存成功', description: `「${input.name}」已更新。` });
    } else {
      await createRecipe(db, input, uid);
      toast({ title: '新增成功', description: `「${input.name}」已建立。` });
    }
    setEditing(null);
    await reload();
  }

  async function handleToggleActive(recipe: Recipe) {
    const uid = auth.currentUser?.uid ?? '';
    const nextActive = !recipe.isActive;
    try {
      await setRecipeActive(db, recipe.id, nextActive, uid);
      toast({ title: nextActive ? '已啟用' : '已停用', description: `「${recipe.name}」` });
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '操作失敗' });
    }
  }

  const filtered = recipes
    .filter((r) => showInactive || r.isActive !== false)
    .filter((r) => !search.trim() || r.name.includes(search));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">配方管理</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              管理配方並引用食材主檔，自動換算基本單位用量。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {recipes.some((r) => (r.notes ?? '').includes(DRAFT_NOTE_MARKER)) && (
            <Button
              variant="outline"
              onClick={() => setShowDraftRecalc(true)}
              className="gap-1.5"
            >
              <RefreshCw size={14} /> 草稿份量重算
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setShowDraftImport(true)}
            className="gap-1.5"
          >
            <Sparkles size={14} /> 從月菜單產生配方草稿
          </Button>
          <Button onClick={() => setEditing({ mode: 'create' })} className="gap-1.5">
            <Plus size={14} /> 新增配方
          </Button>
        </div>
      </div>

      {showDraftImport && (
        <RecipeDraftImportDialog
          existingRecipes={recipes}
          onClose={() => setShowDraftImport(false)}
          onImported={reload}
        />
      )}

      {showDraftRecalc && (
        <RecipeDraftRecalcDialog
          recipes={recipes}
          onClose={() => setShowDraftRecalc(false)}
          onUpdated={reload}
        />
      )}

      {editing?.mode === 'create' && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <RecipeForm
            resolveIngredientName={(id) => ingredientById.get(id)?.name}
            crossRefContext={crossRefContext}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          placeholder="搜尋配方名稱…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowInactive((v) => !v)}
        >
          {showInactive ? <EyeOff size={13} /> : <Eye size={13} />}
          {showInactive ? '隱藏已停用' : '顯示已停用'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <>
          {editing?.mode === 'edit' && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <RecipeForm
                initial={toFormValues(editing.recipe)}
                costBreakdown={editingCostBreakdown}
                resolveIngredientName={(id) => ingredientById.get(id)?.name}
                crossRefContext={crossRefContext}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          <RecipeList
            recipes={filtered}
            onEdit={(recipe) => setEditing({ mode: 'edit', recipe })}
            onToggleActive={handleToggleActive}
            costByRecipeId={costByRecipeId}
          />
        </>
      )}

      <Toaster />
    </div>
  );
}
