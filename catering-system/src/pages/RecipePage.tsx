/**
 * RecipePage — 配方管理 (Feature 011: 配方引用食材主檔)
 * CRUD (create / edit / activate-deactivate, no delete) for recipes on the
 * new `/recipes/{id}` collection.
 */

import { useEffect, useState } from 'react';
import { Plus, BookOpen, Eye, EyeOff, Sparkles } from 'lucide-react';
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
  }, []);

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

      {editing?.mode === 'create' && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <RecipeForm
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
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          <RecipeList
            recipes={filtered}
            onEdit={(recipe) => setEditing({ mode: 'edit', recipe })}
            onToggleActive={handleToggleActive}
          />
        </>
      )}

      <Toaster />
    </div>
  );
}
