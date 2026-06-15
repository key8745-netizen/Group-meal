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
 */

import { useState } from 'react';
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
import type { PurchaseDemandDraftItem } from '@/services/types';
import { PrepPlanSelector } from './PrepPlanSelector';

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

  function updateItem(index: number, patch: Partial<PurchaseDemandDraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
