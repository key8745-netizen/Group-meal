/**
 * PrepPlanForm — create/view-edit form for prep plans (Feature 013:
 * 備料規劃引用菜單配方).
 *
 * Create mode: choose a source recipe menu via RecipeMenuSelector, plus
 * name/date/notes. On submit, calls createPrepPlanFromRecipeMenu, which
 * computes `prepItems` server-side (aggregated by ingredientId+baseUnit).
 *
 * Edit mode: only name/date/notes are editable; the RecipeMenuSelector is
 * hidden and prepItems are shown read-only.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PrepPlan } from '@/services/types';
import { RecipeMenuSelector } from './RecipeMenuSelector';

export interface PrepPlanFormValues {
  name: string;
  date: string;
  notes: string;
  sourceRecipeMenuId: string;
}

const EMPTY_FORM: PrepPlanFormValues = {
  name: '',
  date: '',
  notes: '',
  sourceRecipeMenuId: '',
};

export function validatePrepPlanForm(form: PrepPlanFormValues, isCreate: boolean): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) errors.name = '請輸入名稱';
  if (!form.date.trim()) errors.date = '請選擇日期';
  if (isCreate && !form.sourceRecipeMenuId) errors.sourceRecipeMenuId = '請選擇來源菜單';

  return errors;
}

export function PrepPlanForm({
  initial,
  prepItems,
  onSave,
  onCancel,
}: {
  initial?: Partial<PrepPlanFormValues>;
  /** Present (read-only) only in edit mode, after creation. */
  prepItems?: PrepPlan['prepItems'];
  onSave: (form: PrepPlanFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const isCreate = !prepItems;

  const [name, setName] = useState(initial?.name ?? EMPTY_FORM.name);
  const [date, setDate] = useState(initial?.date ?? EMPTY_FORM.date);
  const [notes, setNotes] = useState(initial?.notes ?? EMPTY_FORM.notes);
  const [sourceRecipeMenuId, setSourceRecipeMenuId] = useState(
    initial?.sourceRecipeMenuId ?? EMPTY_FORM.sourceRecipeMenuId,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const form: PrepPlanFormValues = { name, date, notes, sourceRecipeMenuId };

    const validationErrors = validatePrepPlanForm(form, isCreate);
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
          <label className="text-xs font-medium">名稱 *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：週一午餐備料"
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

        {isCreate && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">來源菜單 *</label>
            <RecipeMenuSelector
              value={sourceRecipeMenuId}
              onChange={(id) => setSourceRecipeMenuId(id)}
            />
            {errors.sourceRecipeMenuId && (
              <p className="text-xs text-destructive">{errors.sourceRecipeMenuId}</p>
            )}
          </div>
        )}

        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium">備註</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="選填"
          />
        </div>
      </div>

      {!isCreate && prepItems && (
        <div className="space-y-2">
          <label className="text-xs font-medium">備料項目（依菜單配方自動計算，不可編輯）</label>
          {prepItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">尚無備料項目</p>
          ) : (
            <div className="space-y-2">
              {prepItems.map((item) => (
                <div key={`${item.ingredientId}-${item.baseUnit}`} className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.ingredientNameSnapshot}</span>
                    <span className="text-sm tabular-nums">
                      {item.requiredBaseQuantity} {item.baseUnit}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {item.recipeContributions.map((c, i) => (
                      <li key={i}>
                        {c.recipeNameSnapshot}（{c.sourceServings} 份）：
                        {c.contributedBaseQuantity} {item.baseUnit}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
