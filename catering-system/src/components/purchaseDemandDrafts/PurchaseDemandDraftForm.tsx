/**
 * PurchaseDemandDraftForm — create/edit form for purchase demand drafts
 * (Feature 014: 採購需求草稿).
 *
 * Create mode: choose a source prep plan via PrepPlanSelector, plus
 * draftName/notes. On submit, calls createDraftFromPrepPlan, which copies
 * `prepItems[]` into `items[]` server-side with `demandQuantity` initialized
 * to `requiredBaseQuantity`.
 *
 * Edit mode: draftName/notes editable; the PrepPlanSelector is hidden;
 * sourcePrepPlanNameSnapshot is shown read-only; items table shows
 * ingredientNameSnapshot / baseUnit / sourceRequiredBaseQuantity read-only,
 * with demandQuantity and per-item notes editable.
 *
 * Feature 033 (display-only, no schema/write-path change): each item row is
 * additionally annotated with an estimated unit price / amount, resolved via
 * `resolveIngredientPrice` (today's market price cache, falling back to each
 * ingredient's default price). Ingredients + today's snapshot are loaded
 * once when entering edit mode.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase';
import type { IngredientMaster, MarketPriceSnapshot, PurchaseDemandDraftItem } from '@/services/types';
import { listIngredients } from '@/services/ingredientMasterService';
import { getMarketPriceSnapshot, pricePerKgFromDefault } from '@/services/marketPriceService';
import { resolveIngredientPrice, type IngredientPriceResolution } from '@/services/costAwareMenuSuggestionService';
import { PrepPlanSelector } from './PrepPlanSelector';

const PRICE_SOURCE_LABELS: Record<IngredientPriceResolution['source'], string> = {
  market: '市價',
  default: '基準',
  none: '無價',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PurchaseDemandDraftFormValues {
  draftName: string;
  notes: string;
  sourcePrepPlanId: string;
  items: PurchaseDemandDraftItem[];
}

const EMPTY_FORM: PurchaseDemandDraftFormValues = {
  draftName: '',
  notes: '',
  sourcePrepPlanId: '',
  items: [],
};

export function validatePurchaseDemandDraftForm(
  form: PurchaseDemandDraftFormValues,
  isCreate: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.draftName.trim()) errors.draftName = '請輸入草稿名稱';
  if (isCreate && !form.sourcePrepPlanId) errors.sourcePrepPlanId = '請選擇來源備料規劃';

  return errors;
}

export function PurchaseDemandDraftForm({
  initial,
  sourcePrepPlanNameSnapshot,
  onSave,
  onCancel,
}: {
  initial?: Partial<PurchaseDemandDraftFormValues>;
  /** Present (read-only) only in edit mode, after creation. */
  sourcePrepPlanNameSnapshot?: string;
  onSave: (form: PurchaseDemandDraftFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const isCreate = !sourcePrepPlanNameSnapshot;

  const [draftName, setDraftName] = useState(initial?.draftName ?? EMPTY_FORM.draftName);
  const [notes, setNotes] = useState(initial?.notes ?? EMPTY_FORM.notes);
  const [sourcePrepPlanId, setSourcePrepPlanId] = useState(
    initial?.sourcePrepPlanId ?? EMPTY_FORM.sourcePrepPlanId,
  );
  const [items, setItems] = useState<PurchaseDemandDraftItem[]>(initial?.items ?? EMPTY_FORM.items);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [ingredientsById, setIngredientsById] = useState<Record<string, IngredientMaster>>({});
  const [priceSnapshot, setPriceSnapshot] = useState<MarketPriceSnapshot | null>(null);

  useEffect(() => {
    if (isCreate) return;
    let cancelled = false;
    (async () => {
      try {
        const [ingredients, snapshot] = await Promise.all([
          listIngredients(db),
          getMarketPriceSnapshot(db, today()),
        ]);
        if (cancelled) return;
        const map: Record<string, IngredientMaster> = {};
        for (const ing of ingredients) map[ing.id] = ing;
        setIngredientsById(map);
        setPriceSnapshot(snapshot);
      } catch {
        // best-effort display-only annotation; silently omit on failure
      }
    })();
    return () => { cancelled = true; };
  }, [isCreate]);

  function updateItem(index: number, patch: Partial<PurchaseDemandDraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function priceInfoFor(item: PurchaseDemandDraftItem) {
    const ing = ingredientsById[item.ingredientId];
    if (!ing) return null;
    const resolution = resolveIngredientPrice(ing, priceSnapshot);
    const estimatedAmount =
      resolution.pricePerBaseUnit != null ? round2(item.demandQuantity * resolution.pricePerBaseUnit) : null;
    const defaultPerKg = pricePerKgFromDefault(ing);
    const highRisk =
      resolution.source === 'market' &&
      resolution.pricePerKg != null &&
      defaultPerKg != null &&
      defaultPerKg > 0 &&
      resolution.pricePerKg >= 1.15 * defaultPerKg;
    return { resolution, estimatedAmount, highRisk };
  }

  const priceInfos = items.map(priceInfoFor);
  const totalEstimatedAmount = priceInfos.reduce((sum, p) => sum + (p?.estimatedAmount ?? 0), 0);
  const unpricedLineCount = priceInfos.filter((p) => !p || p.resolution.source === 'none').length;

  async function handleSubmit() {
    const form: PurchaseDemandDraftFormValues = { draftName, notes, sourcePrepPlanId, items };

    const validationErrors = validatePurchaseDemandDraftForm(form, isCreate);
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
          <label className="text-xs font-medium">草稿名稱 *</label>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="例：週一採購需求草稿"
          />
          {errors.draftName && <p className="text-xs text-destructive">{errors.draftName}</p>}
        </div>

        {isCreate ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">來源備料規劃 *</label>
            <PrepPlanSelector
              value={sourcePrepPlanId}
              onChange={(id) => setSourcePrepPlanId(id)}
            />
            {errors.sourcePrepPlanId && (
              <p className="text-xs text-destructive">{errors.sourcePrepPlanId}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">來源備料規劃</label>
            <p className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
              {sourcePrepPlanNameSnapshot}
            </p>
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

      {!isCreate && (
        <div className="space-y-2">
          <label className="text-xs font-medium">採購需求項目</label>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">尚無項目</p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材</TableHead>
                    <TableHead>單位</TableHead>
                    <TableHead className="text-right">來源所需數量</TableHead>
                    <TableHead className="text-right">需求數量</TableHead>
                    <TableHead>備註</TableHead>
                    <TableHead className="text-right">預估單價</TableHead>
                    <TableHead className="text-right">預估金額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => {
                    const priceInfo = priceInfos[i];
                    return (
                    <TableRow key={`${item.ingredientId}-${item.baseUnit}`}>
                      <TableCell className="font-medium">{item.ingredientNameSnapshot}</TableCell>
                      <TableCell>{item.baseUnit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.sourceRequiredBaseQuantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={item.demandQuantity}
                          onChange={(e) =>
                            updateItem(i, { demandQuantity: Number(e.target.value) })
                          }
                          className="h-8 w-24 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.notes ?? ''}
                          onChange={(e) => updateItem(i, { notes: e.target.value })}
                          placeholder="選填"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {priceInfo && priceInfo.resolution.pricePerBaseUnit != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>${priceInfo.resolution.pricePerBaseUnit.toFixed(4)}</span>
                            <Badge variant={priceInfo.resolution.source === 'market' ? 'default' : 'outline'} className="text-[10px]">
                              {PRICE_SOURCE_LABELS[priceInfo.resolution.source]}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {priceInfo?.estimatedAmount != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={priceInfo.highRisk ? 'font-semibold text-red-600' : ''}>
                              ${priceInfo.estimatedAmount.toFixed(2)}
                            </span>
                            {priceInfo.highRisk && (
                              <span
                                className="text-[10px] text-red-600"
                                title="市價高於基準 ≥15%，建議評估替代食材或延後採購"
                              >
                                ⚠ 市價高於基準 ≥15%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {items.length > 0 && (
            <p className="text-xs text-muted-foreground">
              預估總金額：<span className="font-medium text-foreground">${totalEstimatedAmount.toFixed(2)}</span>
              {unpricedLineCount > 0 && <span>（{unpricedLineCount} 項無價格資料，未計入總額）</span>}
            </p>
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
