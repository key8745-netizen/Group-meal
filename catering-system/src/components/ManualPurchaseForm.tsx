/**
 * ManualPurchaseForm
 *
 * Displays all ingredients in a table with an inline quantity input.
 * Any row where qty > 0 is included in the purchase order when submitted.
 * The user can type in kg; the 台斤 column updates automatically.
 */

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { ShoppingBasket, Send } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Ingredient, InventoryDoc } from '@/services/types';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { toTaijin } from '@/utils/unitConverter';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormRow {
  ingredientId:  string;
  name:          string;
  currentStockKg: number;
  qtyStr:        string;   // controlled input value
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtKg = (n: number) =>
  `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} kg`;

const fmtTaijin = (n: number) =>
  `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} 台斤`;

const parseQty = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
};

// ─── ManualPurchaseForm ───────────────────────────────────────────────────────

export function ManualPurchaseForm() {
  const [rows,       setRows]       = useState<FormRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search,     setSearch]     = useState('');

  // ── Load ingredients + current stock ──────────────────────────────────────

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'inventory')),
    ])
      .then(([ingSnaps, invSnaps]) => {
        const stockMap = new Map<string, number>();
        invSnaps.forEach((s) => {
          stockMap.set(s.id, (s.data() as InventoryDoc).currentStock ?? 0);
        });

        const built: FormRow[] = ingSnaps.docs.map((s) => {
          const ing = { id: s.id, ...s.data() } as Ingredient;
          return {
            ingredientId:  ing.id,
            name:          ing.name,
            currentStockKg: stockMap.get(ing.id) ?? 0,
            qtyStr:        '',
          };
        });

        built.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
        setRows(built);
      })
      .catch(() => toast({ variant: 'destructive', title: '無法載入食材清單' }))
      .finally(() => setLoading(false));
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function updateQty(id: string, value: string) {
    setRows((prev) =>
      prev.map((r) => r.ingredientId === id ? { ...r, qtyStr: value } : r),
    );
  }

  const selected = rows.filter((r) => parseQty(r.qtyStr) > 0);

  async function handleSubmit() {
    if (selected.length === 0) {
      toast({ variant: 'destructive', title: '請至少填寫一項採購數量' });
      return;
    }

    setSubmitting(true);
    try {
      const items = selected.map((r) => {
        const kg = parseQty(r.qtyStr);
        return {
          ingredientId:   r.ingredientId,
          name:           r.name,
          purchaseQtyKg:  kg,
          purchaseTaijin: toTaijin(kg),
        };
      });

      const orderId = await purchaseOrderService.createOrder(items);
      toast({
        title:       '採購單已建立',
        description: `採購單 #${orderId.slice(-8)} 共 ${items.length} 項，已進入待採購佇列。`,
      });

      // Reset quantities
      setRows((prev) => prev.map((r) => ({ ...r, qtyStr: '' })));
    } catch (err) {
      toast({
        variant:     'destructive',
        title:       '建立失敗',
        description: err instanceof Error ? err.message : '請稍後再試。',
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Filtered rows ─────────────────────────────────────────────────────────

  const displayed = search.trim()
    ? rows.filter((r) => r.name.includes(search.trim()))
    : rows;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBasket size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">手動建單</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              在採購數量欄填入數量（kg），最後點「送出採購單」。
            </p>
          </div>
        </div>

        {/* Submit button + selected summary */}
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <span className="text-sm text-muted-foreground">
              已選 <span className="font-semibold text-foreground">{selected.length}</span> 項
            </span>
          )}
          <Button
            onClick={handleSubmit}
            disabled={submitting || selected.length === 0}
            className="gap-2"
          >
            <Send size={14} />
            {submitting ? '建立中…' : '送出採購單'}
          </Button>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="搜尋食材名稱…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
          <ShoppingBasket size={40} strokeWidth={1.1} />
          <p className="text-sm">找不到符合「{search}」的食材</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>食材名稱</TableHead>
                <TableHead className="text-right">現有庫存</TableHead>
                <TableHead className="w-44">採購數量 (kg)</TableHead>
                <TableHead className="text-right">換算 (台斤)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((row, idx) => {
                const qty    = parseQty(row.qtyStr);
                const hasQty = qty > 0;
                return (
                  <TableRow
                    key={row.ingredientId}
                    className={
                      hasQty
                        ? 'bg-blue-50/60 dark:bg-blue-950/20'
                        : idx % 2 !== 0
                          ? 'bg-muted/30'
                          : ''
                    }
                  >
                    <TableCell className="font-medium">
                      {row.name}
                      {hasQty && (
                        <Badge className="ml-2 bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 text-xs border-0">
                          已加入
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtKg(row.currentStockKg)}
                    </TableCell>

                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="0"
                        value={row.qtyStr}
                        onChange={(e) => updateQty(row.ingredientId, e.target.value)}
                        disabled={submitting}
                        className="h-8 w-36 text-right tabular-nums"
                      />
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {qty > 0 ? fmtTaijin(toTaijin(qty)) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Selected summary footer */}
      {selected.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-2 text-sm font-medium">待採購清單預覽</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((r) => (
              <span
                key={r.ingredientId}
                className="rounded-full bg-background border px-3 py-1 text-xs"
              >
                {r.name} — {fmtKg(parseQty(r.qtyStr))}
              </span>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              <Send size={14} />
              {submitting ? '建立中…' : `送出採購單（${selected.length} 項）`}
            </Button>
          </div>
        </div>
      )}

      <Toaster />
    </div>
  );
}
