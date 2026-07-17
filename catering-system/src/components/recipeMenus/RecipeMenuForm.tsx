/**
 * RecipeMenuForm — create/edit form for recipe menus (Feature 012: 菜單引用配方).
 * Pure form component with client-side validation; persistence (and
 * server-side recipe/active validation) is handled by the parent via
 * `onSave`, which calls createMenu/updateMenu.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import type { Recipe } from '@/services/types';
import type { RecipeMenuInput, RecipeMenuItemInput } from '@/services/recipeMenuService';
import { RecipeSelector } from './RecipeSelector';
import { RecipeFlavorAdvisorPanel } from '@/components/recipes/RecipeFlavorAdvisorPanel';

export interface RecipeMenuFormValues extends RecipeMenuInput {}

const EMPTY_FORM: RecipeMenuFormValues = {
  name: '',
  date: '',
  mealType: '',
  isActive: true,
  notes: '',
  menuRecipes: [],
};

interface RowState extends RecipeMenuItemInput {
  /** Cached recipe data, used only for display. */
  _recipe?: Recipe;
}

export function validateRecipeMenuForm(form: RecipeMenuFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) errors.name = '請輸入菜單名稱';
  if (!form.date.trim()) errors.date = '請選擇日期';
  if (!form.mealType.trim()) errors.mealType = '請輸入餐別';
  if (form.menuRecipes.length === 0) errors.menuRecipes = '請至少新增一項配方';

  form.menuRecipes.forEach((item, idx) => {
    if (!item.recipeId) errors[`item-${idx}-recipe`] = '請選擇配方';
    if (!(item.servings > 0)) errors[`item-${idx}-servings`] = '份數必須大於 0';
  });

  return errors;
}

export function RecipeMenuForm({
  initial,
  recipeById,
  onSave,
  onCancel,
}: {
  initial?: Partial<RecipeMenuFormValues>;
  /** Feature 086: 配方 id → Recipe，供編輯既有菜單時解析食材名做風味建議。 */
  recipeById?: Map<string, Recipe>;
  onSave: (form: RecipeMenuFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? EMPTY_FORM.name);
  const [date, setDate] = useState(initial?.date ?? EMPTY_FORM.date);
  const [mealType, setMealType] = useState(initial?.mealType ?? EMPTY_FORM.mealType);
  const [isActive, setIsActive] = useState(initial?.isActive ?? EMPTY_FORM.isActive);
  const [notes, setNotes] = useState(initial?.notes ?? EMPTY_FORM.notes ?? '');
  const [rows, setRows] = useState<RowState[]>(
    (initial?.menuRecipes ?? []).map((item) => ({ ...item })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Feature 086: 這份菜單所有配方用到的食材名（新選的用快取 _recipe，既有的靠 recipeById 反查）。
  const menuIngredientNames = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      const recipe = row._recipe ?? (row.recipeId ? recipeById?.get(row.recipeId) : undefined);
      for (const ri of recipe?.recipeIngredients ?? []) {
        const n = (ri.ingredientNameSnapshot ?? '').trim();
        if (n) names.add(n);
      }
    }
    return Array.from(names);
  }, [rows, recipeById]);

  function addRow() {
    setRows((r) => [...r, { recipeId: '', servings: 1, notes: '' }]);
  }

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  async function handleSubmit() {
    const form: RecipeMenuFormValues = {
      name,
      date,
      mealType,
      isActive,
      notes,
      menuRecipes: rows.map(({ _recipe, ...rest }) => rest),
    };

    const validationErrors = validateRecipeMenuForm(form);
    setErrors(validationErrors);
    setSaveError(null);
    if (Object.keys(validationErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium">菜單名稱 *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：週一午餐"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">日期 *</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">餐別 *</label>
          <Input
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            placeholder="例：午餐"
          />
          {errors.mealType && <p className="text-xs text-destructive">{errors.mealType}</p>}
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium">備註</label>
          <Input
            value={notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="選填"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">配方項目 *</label>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addRow}>
            <Plus size={13} /> 新增配方項目
          </Button>
        </div>
        {errors.menuRecipes && (
          <p className="text-xs text-destructive">{errors.menuRecipes}</p>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-md border p-2">
                <div className="flex-1">
                  <RecipeSelector
                    value={row.recipeId}
                    onChange={(id, recipe) =>
                      updateRow(idx, { recipeId: id, _recipe: recipe })
                    }
                  />
                  {errors[`item-${idx}-recipe`] && (
                    <p className="text-xs text-destructive">{errors[`item-${idx}-recipe`]}</p>
                  )}
                </div>

                <div className="w-24">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.servings}
                    onChange={(e) => updateRow(idx, { servings: parseFloat(e.target.value) || 0 })}
                  />
                  {errors[`item-${idx}-servings`] && (
                    <p className="text-xs text-destructive">{errors[`item-${idx}-servings`]}</p>
                  )}
                </div>

                <div className="flex-1">
                  <Input
                    value={row.notes ?? ''}
                    onChange={(e) => updateRow(idx, { notes: e.target.value })}
                    placeholder="備註（選填）"
                  />
                </div>

                <Button variant="ghost" size="sm" onClick={() => removeRow(idx)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {menuIngredientNames.length > 0 && (
        <RecipeFlavorAdvisorPanel ingredientNames={menuIngredientNames} />
      )}

      <div className="flex items-center gap-2">
        <input
          id="recipe-menu-active"
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="recipe-menu-active" className="text-xs font-medium">啟用此菜單</label>
      </div>

      {saveError && <p className="text-xs text-destructive">{saveError}</p>}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? '儲存中…' : '儲存'}
        </Button>
      </div>
    </div>
  );
}
