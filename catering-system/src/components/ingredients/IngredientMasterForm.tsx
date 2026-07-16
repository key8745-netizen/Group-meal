/**
 * IngredientMasterForm — create/edit form for ingredient master data
 * (Feature 010: 食材主檔管理). Pure form component with client-side validation;
 * persistence is handled by the parent via `onSave`.
 */

import { useState } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkline } from '@/components/ui/sparkline';
import type { IngredientBaseUnit, StorageType } from '@/services/types';
import type { IngredientMasterInput } from '@/services/ingredientMasterService';
import type { PriceHistory } from '@/services/marketPriceHistoryService';
import { FlavorKnowledgePanel } from '@/components/ingredients/FlavorKnowledgePanel';

const BASE_UNITS: IngredientBaseUnit[] = ['g', 'ml', 'pcs'];
const STORAGE_LABELS: Record<StorageType, string> = { ambient: '常溫', chilled: '冷藏', frozen: '冷凍' };
const SHELF_LIFE_KEY: Record<StorageType, 'shelfLifeDaysAmbient' | 'shelfLifeDaysChilled' | 'shelfLifeDaysFrozen'> = {
  ambient: 'shelfLifeDaysAmbient', chilled: 'shelfLifeDaysChilled', frozen: 'shelfLifeDaysFrozen',
};

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
  minStockLevel: 0,
  isPerishable: true,
  defaultStorageType: 'chilled',
  warnThresholdDays: 2,
  criticalThresholdDays: 1,
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

/** Feature 063: 市價近況小圖 + 最新價 + 漲跌。 */
function PriceHistoryHint({ history }: { history: PriceHistory }) {
  const { points, latest, min, max, changePercent } = history;
  const up = changePercent !== null && changePercent > 0;
  const down = changePercent !== null && changePercent < 0;
  // 漲價 = 對採購不利（紅）；跌價 = 有利（綠）
  const trendColor = up ? 'text-destructive' : down ? 'text-green-600' : 'text-muted-foreground';
  const TrendIcon = up ? TrendingUp : down ? TrendingDown : Minus;

  return (
    <div className="mt-1 flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
      <Sparkline values={points.map((p) => p.avgPrice)} className={trendColor} />
      <div className="flex flex-col text-xs">
        <span className="font-medium text-foreground">
          最新 ${latest}/kg
          {changePercent !== null && (
            <span className={`ml-1.5 inline-flex items-center gap-0.5 ${trendColor}`}>
              <TrendIcon size={12} />
              {changePercent > 0 ? '+' : ''}{changePercent}%
            </span>
          )}
        </span>
        <span className="text-muted-foreground">
          近 {points.length} 日 · 區間 ${min}–${max}/kg
        </span>
      </div>
    </div>
  );
}

export function IngredientMasterForm({
  initial,
  currentStockKg,
  priceHistory,
  onSave,
  onCancel,
}: {
  initial?: Partial<IngredientMasterFormValues>;
  /** Feature 060: 編輯時帶入目前庫存（kg），顯示於安全庫存欄位提示。 */
  currentStockKg?: number;
  /** Feature 063: 該食材對應作物的近期市價歷史，顯示走勢小圖。 */
  priceHistory?: PriceHistory;
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
          <label className="text-xs font-medium">安全庫存（kg，0 = 不追蹤）</label>
          <Input
            type="number" min={0} step="any"
            value={form.minStockLevel ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, minStockLevel: Math.max(0, parseFloat(e.target.value) || 0) }))}
          />
          <p className="text-[11px] text-muted-foreground">
            庫存低於此值時首頁會提醒補貨
            {typeof currentStockKg === 'number' && (
              <span className="ml-1">（目前庫存 {currentStockKg.toFixed(2)} kg）</span>
            )}
          </p>
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
          {priceHistory && priceHistory.points.length > 0 && (
            <PriceHistoryHint history={priceHistory} />
          )}
        </div>

        {/* Feature 071: 保鮮設定 */}
        <div className="col-span-2 flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium">保鮮設定</span>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={form.isPerishable !== false}
                onChange={(e) => setForm((f) => ({ ...f, isPerishable: e.target.checked }))}
              />
              易腐食材（需追蹤保鮮）
            </label>
          </div>
          {form.isPerishable !== false && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">預設儲存</label>
                <select
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={form.defaultStorageType ?? 'chilled'}
                  onChange={(e) => setForm((f) => ({ ...f, defaultStorageType: e.target.value as StorageType }))}
                >
                  {(['ambient', 'chilled', 'frozen'] as StorageType[]).map((s) => (
                    <option key={s} value={s}>{STORAGE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">
                  保存天數（{STORAGE_LABELS[form.defaultStorageType ?? 'chilled']}）
                </label>
                <Input
                  type="number" min={0} step={1}
                  value={form[SHELF_LIFE_KEY[form.defaultStorageType ?? 'chilled']] ?? ''}
                  onChange={(e) => {
                    const st = form.defaultStorageType ?? 'chilled';
                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                    setForm((f) => ({ ...f, [SHELF_LIFE_KEY[st]]: v }));
                  }}
                  placeholder="如 3"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">優先使用門檻（天）</label>
                <Input
                  type="number" min={0} step={1}
                  value={form.warnThresholdDays ?? 2}
                  onChange={(e) => setForm((f) => ({ ...f, warnThresholdDays: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">臨界門檻（天）</label>
                <Input
                  type="number" min={0} step={1}
                  value={form.criticalThresholdDays ?? 1}
                  onChange={(e) => setForm((f) => ({ ...f, criticalThresholdDays: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">加工延壽良率</label>
                <Input
                  type="number" min={0} max={2} step="any"
                  value={form.processedYieldRatio ?? ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setForm((f) => ({ ...f, processedYieldRatio: Number.isFinite(v) && v > 0 ? v : undefined }));
                  }}
                  placeholder="如 0.75"
                />
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            保存天數用於收貨時自動推算批次效期；乾貨/罐頭可取消勾選「易腐」以跳過保鮮追蹤。
            加工延壽良率＝煮熟後產出／原料（如 0.75 代表煮過剩 75%），加工時可逐次覆蓋。
          </p>
        </div>

        {/* Feature 074: 依食材名顯示風味搭配與料理技法建議（純唯讀參考） */}
        <FlavorKnowledgePanel ingredientName={form.name} />

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
