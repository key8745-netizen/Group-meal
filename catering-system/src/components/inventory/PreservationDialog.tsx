/**
 * PreservationDialog — Feature 079: 加工延壽對話框。
 *
 * 對一筆快到期批次執行「加工延壽」：耗用部分原料，加工成同食材的一筆新批次
 * （改儲存方式、重設效期、記住來源）。良率與保存天數帶入食材預設，可逐次覆蓋。
 * 即時預覽產出量與新效期，確認後交由 preservationService 交易寫入。
 */

import { useMemo, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import type { IngredientMaster, StorageType } from '@/services/types';
import { planPreservation, resolvePreservationDefaults } from '@/services/preservationPlanner';
import { recordPreservation } from '@/services/preservationService';
import { todayLocalIsoDate } from '@/services/marketPriceService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STORAGE_LABELS: Record<StorageType, string> = { ambient: '常溫', chilled: '冷藏', frozen: '冷凍' };
const DEFAULT_LABEL: Record<StorageType, string> = { ambient: '加工常溫', chilled: '煮熟冷藏', frozen: '煮熟冷凍' };

export interface PreservationSource {
  batchId: string;
  ingredientId: string;
  ingredientName: string;
  /** 該批次剩餘量（kg）——加工可耗用的上限。 */
  remainingKg: number;
}

export function PreservationDialog({
  db,
  source,
  ingredient,
  performedBy,
  onClose,
  onDone,
}: {
  db: Firestore;
  source: PreservationSource;
  /** 食材主檔（取良率/保存天數預設）；找不到時給空預設。 */
  ingredient?: IngredientMaster;
  performedBy: string;
  onClose: () => void;
  onDone: (newBatchId: string) => void;
}) {
  const today = todayLocalIsoDate();
  const [targetStorage, setTargetStorage] = useState<StorageType>(
    ingredient?.defaultStorageType === 'frozen' ? 'frozen' : 'chilled',
  );
  const defaults = useMemo(
    () => resolvePreservationDefaults(ingredient ?? {}, targetStorage),
    [ingredient, targetStorage],
  );

  const [consumeKg, setConsumeKg] = useState<number>(() => Math.round(source.remainingKg * 1000) / 1000);
  const [yieldRatio, setYieldRatio] = useState<number>(defaults.yieldRatio);
  const [shelfLifeDays, setShelfLifeDays] = useState<number>(defaults.shelfLifeDays);
  const [label, setLabel] = useState<string>(DEFAULT_LABEL[targetStorage]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 追蹤使用者是否手動改過，避免切換儲存時覆蓋其輸入。
  const [touchedYield, setTouchedYield] = useState(false);
  const [touchedShelf, setTouchedShelf] = useState(false);
  const [touchedLabel, setTouchedLabel] = useState(false);

  function changeStorage(st: StorageType) {
    setTargetStorage(st);
    const d = resolvePreservationDefaults(ingredient ?? {}, st);
    if (!touchedYield) setYieldRatio(d.yieldRatio);
    if (!touchedShelf) setShelfLifeDays(d.shelfLifeDays);
    if (!touchedLabel) setLabel(DEFAULT_LABEL[st]);
  }

  const plan = useMemo(
    () =>
      planPreservation({
        sourceBatch: { id: source.batchId, ingredientId: source.ingredientId, qtyRemainingKg: source.remainingKg },
        ingredientName: source.ingredientName,
        consumeKg,
        yieldRatio,
        targetStorageType: targetStorage,
        targetShelfLifeDays: shelfLifeDays,
        processedLabel: label,
        todayIso: today,
      }),
    [source, consumeKg, yieldRatio, targetStorage, shelfLifeDays, label, today],
  );

  async function handleConfirm() {
    if (!plan.ok) return;
    setSaving(true);
    setError(null);
    try {
      const newBatchId = await recordPreservation(db, plan, source.ingredientName, performedBy);
      onDone(newBatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加工延壽失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-background p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold text-foreground">加工延壽</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {source.ingredientName}　批次 <span className="font-mono">#{source.batchId}</span>　剩 {source.remainingKg.toFixed(2)}kg
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">加工方式</label>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={targetStorage}
              onChange={(e) => changeStorage(e.target.value as StorageType)}
            >
              {(['chilled', 'frozen', 'ambient'] as StorageType[]).map((s) => (
                <option key={s} value={s}>煮熟{STORAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">加工標籤</label>
            <Input value={label} onChange={(e) => { setLabel(e.target.value); setTouchedLabel(true); }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">耗用原料（kg）</label>
            <Input
              type="number" min={0} max={source.remainingKg} step="any"
              value={consumeKg}
              onChange={(e) => setConsumeKg(Math.max(0, parseFloat(e.target.value) || 0))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">良率（產出／原料）</label>
            <Input
              type="number" min={0} step="any"
              value={yieldRatio}
              onChange={(e) => { setYieldRatio(Math.max(0, parseFloat(e.target.value) || 0)); setTouchedYield(true); }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">加工後保存（天）</label>
            <Input
              type="number" min={1} step={1}
              value={shelfLifeDays}
              onChange={(e) => { setShelfLifeDays(Math.max(0, parseInt(e.target.value, 10) || 0)); setTouchedShelf(true); }}
            />
          </div>
        </div>

        {/* 即時預覽 */}
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          {plan.ok ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">產出加工批次</span>
                <span className="font-semibold tabular-nums">{plan.outputKg.toFixed(2)} kg</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">新效期</span>
                <span className="tabular-nums">{plan.newBatch.expirationDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">來源批次剩餘</span>
                <span className="tabular-nums">{plan.sourceRemainingAfterKg.toFixed(2)} kg</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>烹煮失重</span>
                <span className="tabular-nums">{plan.lossKg >= 0 ? '−' : '+'}{Math.abs(plan.lossKg).toFixed(2)} kg</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                加工批次掛回同一食材，仍會被配方推薦與保鮮警示網羅（惜食不中斷）。
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs text-destructive">
              {plan.errors.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>取消</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!plan.ok || saving}>
            {saving ? '處理中…' : '確認加工延壽'}
          </Button>
        </div>
      </div>
    </div>
  );
}
