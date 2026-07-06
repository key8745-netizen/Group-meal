/**
 * IngredientMasterForm — create/edit form for ingredient master data
 * (Feature 010: 食材主檔管理). Pure form component with client-side validation;
 * persistence is handled by the parent via `onSave`.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { IngredientBaseUnit } from '@/services/types';
import type { IngredientMasterInput } from '@/services/ingredientMasterService';

const BASE_UNITS: IngredientBaseUnit[] = ['g', 'ml', 'pcs'];

export interface IngredientMasterFormValues extends IngredientMasterInput {}

const EMPTY_FORM: IngredientMasterFormValues = {
  name: '',
  category: '',
  baseUnit: 'g',
  purchaseUnit: '',
  conversionFactorToBaseUnit: 1,
  defaultPrice: 0,
  defaultPriceUnit: '',
  supplierId: null,
  notes: '',
  marketCropName: '',
};

export function validateIngredientMasterForm(
  form: IngredientMasterFormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) errors.name = '請輸入食材名稱';
  if (!BASE_UNITS.includes(form.baseUnit)) errors.baseUnit = '請選擇有效的基本單位';
  if (!form.purchaseUnit.trim()) errors.purchaseUnit = '請輸入採購單位';
  if (!(form.conversionFactorToBaseUnit > 0)) errors.conversionFactorToBaseUnit = '換算係數必須大於 0';
  if (!(form.defaultPrice >= 0)) errors.defaultPrice = '預設價格不可為負數';
  if (!form.defaultPriceUnit.trim()) errors.defaultPriceUnit = '請輸入價格單位';

  return errors;
}

export function IngredientMasterForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<IngredientMasterFormValues>;
  onSave: (form: IngredientMasterFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<IngredientMasterFormValues>({ ...EMPTY_FORM, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const validationErrors = validateIngredientMasterForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium">食材名稱 *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="例：白米"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">類別</label>
          <Input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="例：主食"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">基本單位 *</label>
          <select
            value={form.baseUnit}
            onChange={(e) => setForm((f) => ({ ...f, baseUnit: e.target.value as IngredientBaseUnit }))}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {errors.baseUnit && <p className="text-xs text-destructive">{errors.baseUnit}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">採購單位 *</label>
          <Input
            value={form.purchaseUnit}
            onChange={(e) => setForm((f) => ({ ...f, purchaseUnit: e.target.value }))}
            placeholder="例：箱、包、kg"
          />
          {errors.purchaseUnit && <p className="text-xs text-destructive">{errors.purchaseUnit}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">換算係數（採購單位 → 基本單位） *</label>
          <Input
            type="number" min={0} step="any"
            value={form.conversionFactorToBaseUnit}
            onChange={(e) => setForm((f) => ({ ...f, conversionFactorToBaseUnit: parseFloat(e.target.value) || 0 }))}
          />
          {errors.conversionFactorToBaseUnit && (
            <p className="text-xs text-destructive">{errors.conversionFactorToBaseUnit}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">預設價格 *</label>
          <Input
            type="number" min={0} step="any"
            value={form.defaultPrice}
            onChange={(e) => setForm((f) => ({ ...f, defaultPrice: parseFloat(e.target.value) || 0 }))}
          />
          {errors.defaultPrice && <p className="text-xs text-destructive">{errors.defaultPrice}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">價格單位 *</label>
          <Input
            value={form.defaultPriceUnit}
            onChange={(e) => setForm((f) => ({ ...f, defaultPriceUnit: e.target.value }))}
            placeholder="例：箱、kg"
          />
          {errors.defaultPriceUnit && <p className="text-xs text-destructive">{errors.defaultPriceUnit}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">供應商 ID</label>
          <Input
            value={form.supplierId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value || null }))}
            placeholder="選填"
          />
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium">市場作物名稱（AMIS 行情對應，選填）</label>
          <Input
            value={form.marketCropName ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, marketCropName: e.target.value || null }))}
            placeholder="例：甘藍"
          />
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium">備註</label>
          <Input
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="選填"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? '儲存中…' : '儲存'}
        </Button>
      </div>
    </div>
  );
}
