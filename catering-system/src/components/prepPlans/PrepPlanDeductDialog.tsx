/**
 * PrepPlanDeductDialog — Feature 048: 出餐一鍵扣料 的確認對話框。
 *
 * 預設帶入備料快照的每項公斤數，但每一項都可以手動改成實際用量
 * （設 0 = 該項不扣），確認後才透過 `deductPrepPlanStock` 扣庫存。
 * 個數（pcs）品項列為「不扣除」並附原因。
 */

import { useMemo, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import type { PrepPlan } from '@/services/types';
import {
  planPrepPlanDeduction,
  deductPrepPlanStock,
} from '@/services/prepPlanStockDeductService';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface Props {
  prepPlan: PrepPlan;
  onClose: () => void;
  onDeducted: () => void;
}

export function PrepPlanDeductDialog({ prepPlan, onClose, onDeducted }: Props) {
  const planned = useMemo(() => planPrepPlanDeduction(prepPlan), [prepPlan]);
  const lines = useMemo(() => [...planned.requirements.values()], [planned]);

  const [kgById, setKgById] = useState<Record<string, string>>(
    () => Object.fromEntries(lines.map((l) => [l.ingredientId, String(l.totalQuantityKg)])),
  );
  const [submitting, setSubmitting] = useState(false);

  const activeCount = lines.filter((l) => Number(kgById[l.ingredientId]) > 0).length;

  async function handleConfirm() {
    const uid = auth.currentUser?.uid ?? '';
    setSubmitting(true);
    try {
      const overrides = new Map<string, number>();
      for (const line of lines) {
        const v = Number(kgById[line.ingredientId]);
        overrides.set(line.ingredientId, Number.isFinite(v) && v >= 0 ? v : 0);
      }
      const result = await deductPrepPlanStock(db, prepPlan.id, uid, overrides);
      toast({
        title: '扣料完成',
        description: `已扣除 ${result.deductedCount} 項食材，庫存與交易紀錄已更新。`,
      });
      onDeducted();
      onClose();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '扣料失敗（未扣除任何項目）',
        description: err instanceof Error ? err.message : '',
      });
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex w-full max-w-lg max-h-[85vh] flex-col gap-4 rounded-lg bg-background p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold text-foreground">出餐扣料</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            「{prepPlan.name}」——預設為備料量，可逐項改成實際用量（設 0 表示該項不扣）。
          </p>
        </div>

        <div className="flex-1 overflow-y-auto rounded-md border">
          <ul className="divide-y">
            {lines.map((line) => (
              <li key={line.ingredientId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{line.ingredientName}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="w-24 rounded-md border px-2 py-1 text-right text-sm tabular-nums"
                    value={kgById[line.ingredientId] ?? ''}
                    onChange={(e) =>
                      setKgById((prev) => ({ ...prev, [line.ingredientId]: e.target.value }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">kg</span>
                </span>
              </li>
            ))}
          </ul>
          {planned.skipped.length > 0 && (
            <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              不扣除：{planned.skipped.map((s) => `${s.ingredientName}（${s.reason}）`).join('、')}
            </div>
          )}
        </div>

        <p className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
          扣除會逐項寫入庫存交易紀錄（可於庫存管理查核）；庫存不足時整批不會扣，
          請先至庫存盤點調整。扣除後此快照標記為已扣料，不可重複執行。
        </p>

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || activeCount === 0}>
            {submitting ? '扣除中…' : `扣除 ${activeCount} 項`}
          </Button>
        </div>
      </div>
    </div>
  );
}
