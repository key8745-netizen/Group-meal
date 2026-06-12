/**
 * RecipeForm — create/edit form for recipes (Feature 011: 配方引用食材主檔).
 * Pure form component with client-side validation; persistence (and
 * server-side unit/active-ingredient validation) is handled by the parent
 * via `onSave`, which calls createRecipe/updateRecipe.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import type { IngredientMaster } from '@/services/types';
import type { RecipeInput, RecipeIngredientInput } from '@/services/recipeService';
import { IngredientSelector } from './IngredientSelector';

export interface RecipeFormValues extends RecipeInput {}

const EMPTY_FORM: RecipeFormValues = {
  name: '',
  isActive: true,
  notes: '',
  recipeIngredients: [],
};

interface RowState extends RecipeIngredientInput {
  /** Cached ingredient master data, used to populate unit choices. */
  _ingredient?: IngredientMaster;
}

export function validateRecipeForm(form: RecipeFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) errors.name = '請輸入配方名稱';
  if (form.recipeIngredients.length === 0) errors.recipeIngredients = '請至少新增一項食材';

  form.recipeIngredients.forEach((item, idx) => {
    if (!item.ingredientId) errors[`item-${idx}-ingredient`] = '請選擇食材';
    if (!(item.quantity > 0)) errors[`item-${idx}-quantity`] = '數量必須大於 0';
    if (!item.unit) errors[`item-${idx}-unit`] = '請選擇單位';
  });

  return errors;
}

export function RecipeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<RecipeFormValues>;
  onSave: (form: RecipeFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? EMPTY_FORM.name);
  const [isActive, setIsActive] = useState(initial?.isActive ?? EMPTY_FORM.isActive);
  const [notes, setNotes] = useState(initial?.notes ?? EMPTY_FORM.notes ?? '');
  const [rows, setRows] = useState<RowState[]>(
    (initial?.recipeIngredients ?? []).map((item) => ({ ...item })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setRows((r) => [...r, { ingredientId: '', quantity: 1, unit: '', notes: '' }]);
  }

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function unitOptions(row: RowState): string[] {
    const ing = row._ingredient;
    if (!ing) return row.unit ? [row.unit] : [];
    const opts = [ing.baseUnit, ing.purchaseUnit].filter(
      (u, i, arr) => !!u && arr.indexOf(u) === i,
    );
    return opts;
  }

  async function handleSubmit() {
    const form: RecipeFormValues = {
      name,
      isActive,
      notes,
      recipeIngredients: rows.map(({ _ingredient, ...rest }) => rest),
    };

    const validationErrors = validateRecipeForm(form);
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
          <label className="text-xs font-medium">配方名稱 *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：紅燒牛肉"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
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
          <label className="text-xs font-medium">食材項目 *</label>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addRow}>
            <Plus size={13} /> 新增食材項目
          </Button>
        </div>
        {errors.recipeIngredients && (
          <p className="text-xs text-destructive">{errors.recipeIngredients}</p>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-md border p-2">
                <div className="flex-1">
                  <IngredientSelector
                    value={row.ingredientId}
                    onChange={(id, ingredient) =>
                      updateRow(idx, {
                        ingredientId: id,
                        _ingredient: ingredient,
                        unit: ingredient?.baseUnit ?? '',
                      })
                    }
                  />
                  {errors[`item-${idx}-ingredient`] && (
                    <p className="text-xs text-destructive">{errors[`item-${idx}-ingredient`]}</p>
                  )}
                </div>

                <div className="w-24">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.quantity}
                    onChange={(e) => updateRow(idx, { quantity: parseFloat(e.target.value) || 0 })}
                  />
                  {errors[`item-${idx}-quantity`] && (
                    <p className="text-xs text-destructive">{errors[`item-${idx}-quantity`]}</p>
                  )}
                </div>

                <div className="w-28">
                  {row._ingredient ? (
                    <select
                      value={row.unit}
                      onChange={(e) => updateRow(idx, { unit: e.target.value })}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">請選擇單位</option>
                      {unitOptions(row).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={row.unit}
                      onChange={(e) => updateRow(idx, { unit: e.target.value })}
                      placeholder="單位"
                    />
                  )}
                  {errors[`item-${idx}-unit`] && (
                    <p className="text-xs text-destructive">{errors[`item-${idx}-unit`]}</p>
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

      <div className="flex items-center gap-2">
        <input
          id="recipe-active"
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="recipe-active" className="text-xs font-medium">啟用此配方</label>
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
