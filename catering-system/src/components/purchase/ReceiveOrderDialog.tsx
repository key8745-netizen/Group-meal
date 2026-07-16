/**
 * ReceiveOrderDialog — Feature 061: 收貨實收數量微調。
 *
 * PENDING → RECEIVED 前的確認對話框。每項預帶下單量，可逐項改成實際
 * 到貨量（設 0 = 未到貨，不入庫）。確認後透過
 * `purchaseOrderService.completeOrder(orderId, overrides)` 入庫。
 * 沿用 PrepPlanDeductDialog 的疊層與逐項可改樣式。
 */

import { useMemo, useState } from 'react';
import { purchaseOrderService, type PurchaseOrder } from '@/services/purchaseOrderService';
import { toTaijin } from '@/utils/unitConverter';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface Props {
  order: PurchaseOrder;
  onClose: () => void;
  onReceived: () => void;
}

export function ReceiveOrderDialog({ order, onClose, onReceived }: Props) {
  const items = order.items;
  const [kgById, setKgById] = useState<Record<string, string>>(
    () => Object.fromEntries(items.map((i) => [i.ingredientId, String(i.purchaseQtyKg)])),
  );
  const [submitting, setSubmitting] = useState(false);

  const receivedCount = items.filter((i) => Number(kgById[i.ingredientId]) > 0).length;

  const changed = useMemo(
    () => items.some((i) => Number(kgById[i.ingredientId]) !== i.purchaseQtyKg),
    [items, kgById],
  );

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const overrides = new Map<string, number>();
      for (const item of items) {
        const v = Number(kgById[item.ingredientId]);
        overrides.set(item.ingredientId, Number.isFinite(v) && v >= 0 ? v : 0);
      }
      await purchaseOrderService.completeOrder(order.id!, overrides);
      toast({
        title: '入庫成功',
        description: `採購單 #${order.id!.slice(-8)} 已完成入庫（${receivedCount} 項補回庫存）。`,
      });
      onReceived();
      onClose();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '入庫失敗',
        description: err instanceof Error ? err.message : '請稍後再試。',
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
          <h2 className="text-lg font-semibold text-foreground">確認收貨並入庫</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            採購單 #{order.id!.slice(-8)}——預設為下單量，可逐項改成實際到貨量（設 0 表示未到貨、不入庫）。
          </p>
        </div>

        <div className="flex-1 overflow-y-auto rounded-md border">
          <ul className="divide-y">
            {items.map((item) => {
              const kg = Number(kgById[item.ingredientId]);
              const valid = Number.isFinite(kg) && kg >= 0;
              return (
                <li key={item.ingredientId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{item.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">下單 {item.purchaseQtyKg} kg</span>
                  </div>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className={`w-24 rounded-md border px-2 py-1 text-right text-sm tabular-nums ${valid ? '' : 'border-destructive'}`}
                      value={kgById[item.ingredientId] ?? ''}
                      onChange={(e) =>
                        setKgById((prev) => ({ ...prev, [item.ingredientId]: e.target.value }))
                      }
                    />
                    <span className="w-24 text-right text-xs text-muted-foreground">
                      kg（{valid && kg > 0 ? `${toTaijin(kg)} 台斤` : '—'}）
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
          入庫會逐項寫入庫存交易紀錄（可於庫存管理查核）。此動作會把採購單標記為已完成，不可撤銷；
          若某項未到貨，把數量改成 0 即可（不影響其他項目入庫）。
        </p>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-muted-foreground">
            {changed ? '已調整實收量' : '未調整（沿用下單量）'}
          </span>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting || receivedCount === 0}>
              {submitting ? '入庫中…' : `確認入庫 ${receivedCount} 項`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
