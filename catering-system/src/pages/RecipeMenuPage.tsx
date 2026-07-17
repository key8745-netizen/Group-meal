/**
 * RecipeMenuPage — 菜單配方 (Feature 012: 菜單引用配方)
 * CRUD (create / edit / activate-deactivate, no delete) for recipe menus on
 * the new `/recipeMenus/{id}` collection.
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, CalendarRange, Eye, EyeOff } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { RecipeMenu, Recipe } from '@/services/types';
import {
  listMenus,
  createMenu,
  updateMenu,
  setMenuActive,
  type RecipeMenuInput,
} from '@/services/recipeMenuService';
import { listRecipes } from '@/services/recipeService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { RecipeMenuList } from '@/components/recipeMenus/RecipeMenuList';
import { RecipeMenuForm, type RecipeMenuFormValues } from '@/components/recipeMenus/RecipeMenuForm';

type EditingState =
  | { mode: 'create' }
  | { mode: 'edit'; menu: RecipeMenu }
  | null;

function toFormValues(menu: RecipeMenu): RecipeMenuFormValues {
  return {
    name: menu.name,
    date: menu.date,
    mealType: menu.mealType,
    isActive: menu.isActive,
    notes: menu.notes ?? '',
    menuRecipes: (menu.menuRecipes ?? []).map((item) => ({
      recipeId: item.recipeId,
      servings: item.servings,
      notes: item.notes ?? '',
    })),
  };
}

export default function RecipeMenuPage() {
  const [menus, setMenus] = useState<RecipeMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  // Feature 086: 配方清單，供菜單風味建議解析食材名（載入失敗僅不顯示建議）。
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  async function reload() {
    setLoading(true);
    try {
      const list = await listMenus(db, { includeInactive: true });
      setMenus(list);
    } catch {
      toast({ variant: 'destructive', title: '無法載入菜單資料' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    listRecipes(db).then(setRecipes).catch(() => setRecipes([]));
  }, []);

  async function handleSave(input: RecipeMenuInput) {
    const uid = auth.currentUser?.uid ?? '';
    if (editing?.mode === 'edit') {
      await updateMenu(db, editing.menu.id, input, uid);
      toast({ title: '儲存成功', description: `「${input.name}」已更新。` });
    } else {
      await createMenu(db, input, uid);
      toast({ title: '新增成功', description: `「${input.name}」已建立。` });
    }
    setEditing(null);
    await reload();
  }

  async function handleToggleActive(menu: RecipeMenu) {
    const uid = auth.currentUser?.uid ?? '';
    const nextActive = !menu.isActive;
    try {
      await setMenuActive(db, menu.id, nextActive, uid);
      toast({ title: nextActive ? '已啟用' : '已停用', description: `「${menu.name}」` });
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '操作失敗' });
    }
  }

  const filtered = menus
    .filter((m) => showInactive || m.isActive !== false)
    .filter((m) => !search.trim() || m.name.includes(search));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">菜單配方</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              管理菜單並引用配方，設定每項配方的供應份數。
            </p>
          </div>
        </div>
        <Button onClick={() => setEditing({ mode: 'create' })} className="gap-1.5">
          <Plus size={14} /> 新增菜單
        </Button>
      </div>

      {editing?.mode === 'create' && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <RecipeMenuForm
            recipeById={recipeById}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          placeholder="搜尋菜單名稱…"
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
              <RecipeMenuForm
                initial={toFormValues(editing.menu)}
                recipeById={recipeById}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          <RecipeMenuList
            menus={filtered}
            onEdit={(menu) => setEditing({ mode: 'edit', menu })}
            onToggleActive={handleToggleActive}
          />
        </>
      )}

      <Toaster />
    </div>
  );
}
