/**
 * InventoryAudit
 *
 * Displays all ingredients with their current stock in kg/台斤.
 * Each row has an inline edit input for manual adjustment.
 * Saving writes the new stock to `inventory/{id}` and records an
 * `adjustment` InventoryTransaction in `inventory/{id}/transactions`.
 *
 * Intended for weekly stock-taking, not real-time deductions.
 */

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ClipboardList, RotateCcw, Save } from 'lucide-react';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import type { Ingredient, InventoryDoc } from '@/services/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { toTaijin } from '@/utils/unitConverter';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditRow {
  ingredientId: string;
  name:         string;
  currentKg:    number;
  minStockKg:   number;
  /** The value currently typed into the edit input (string for controlled input) */
  editValue:    string;
  dirty:        boolean;
  saving:       boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtKg     = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} kg`;
const fmtTaijin = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} 台斤`;

function currentUser(): string {
  return auth.currentUser?.email ?? auth.currentUser?.uid ?? 'unknown';
}

// ─── InventoryAudit ───────────────────────────────────────────────────────────

export function InventoryAudit() {
  const [rows,    setRows]    = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load inventory + ingredients ──────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'inventory')),
    ])
      .then(([ingSnaps, invSnaps]) => {
        const invMap = new Map<string, number>();
        invSnaps.forEach((s) => {
          const d = s.data() as InventoryDoc;
          invMap.set(s.id, d.currentStock ?? 0);
        });

        const built: AuditRow[] = ingSnaps.docs.map((s) => {
          const ing      = { id: s.id, ...s.data() } as Ingredient;
          const currentKg = invMap.get(ing.id) ?? 0;
          return {
            ingredientId: ing.id,
            name:         ing.name,
            currentKg,
            minStockKg:   ing.minStockLevel ?? 0,
            editValue:    String(currentKg),
            dirty:        false,
            saving:       false,
          };
        });

        built.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
        setRows(built);
      })
      .catch(() => toast({ variant: 'destructive', title: '無法載入庫存資料' }))
      .finally(() => setLoading(false));
  }, []);

  // ── Row helpers ───────────────────────────────────────────────────────────

  function updateEdit(id: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.ingredientId === id
          ? { ...r, editValue: value, dirty: parseFloat(value) !== r.currentKg }
          : r,
      ),
    );
  }

  function resetRow(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.ingredientId === id
          ? { ...r, editValue: String(r.currentKg), dirty: false }
          : r,
      ),
    );
  }

  async function saveRow(id: string) {
    const row = rows.find((r) => r.ingredientId === id);
    if (!row) return;

    const newKg = parseFloat(row.editValue);
    if (isNaN(newKg) || newKg < 0) {
      toast({ variant: 'destructive', title: '請輸入有效的庫存量（≥ 0）' });
      return;
    }

    setRows((prev) =>
      prev.map((r) => r.ingredientId === id ? { ...r, saving: true } : r),
    );

    try {
      const invRef  = doc(db, 'inventory', id);
      const txCol   = collection(db, 'inventory', id, 'transactions');
      const txRef   = doc(txCol);
      const delta   = newKg - row.currentKg;
      const by      = currentUser();

      await runTransaction(db, async (t) => {
        const snap = await t.get(invRef);

        const existing = snap.exists()
          ? (snap.data() as InventoryDoc)
          : { ingredientId: id, ingredientName: row.name, currentStock: 0, unit: 'kg', lastUpdated: Timestamp.now() };

        t.set(invRef, {
          ...existing,
          currentStock: newKg,
          lastUpdated: serverTimestamp(),
        });

        t.set(txRef, {
          type:        'adjustment',
          quantity:    Math.round(delta * 1000) / 1000,
          referenceId: 'manual-audit',
          reason:      `手動盤點調整 (${existing.currentStock.toFixed(2)} → ${newKg.toFixed(2)} kg)`,
          performedBy: by,
          timestamp:   serverTimestamp(),
        });
      });

      setRows((prev) =>
        prev.map((r) =>
          r.ingredientId === id
            ? { ...r, currentKg: newKg, editValue: String(newKg), dirty: false, saving: false }
            : r,
        ),
      );

      toast({ title: '已儲存', description: `${row.name} 庫存已更新為 ${fmtKg(newKg)}` });
    } catch (err) {
      toast({
        variant:     'destructive',
        title:       '儲存失敗',
        description: err instanceof Error ? err.message : '請稍後再試。',
      });
      setRows((prev) =>
        prev.map((r) => r.ingredientId === id ? { ...r, saving: false } : r),
      );
    }
  }

  // ── Bulk save ─────────────────────────────────────────────────────────────

  const dirtyRows = rows.filter((r) => r.dirty);

  async function saveAll() {
    await Promise.allSettled(dirtyRows.map((r) => saveRow(r.ingredientId)));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">庫存盤點</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              手動校正庫存量，每次儲存均記錄盤點異動日誌。
            </p>
          </div>
        </div>

        {dirtyRows.length > 0 && (
          <Button onClick={saveAll} className="gap-2">
            <Save size={14} />
            儲存全部 ({dirtyRows.length})
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
          <ClipboardList size={40} strokeWidth={1.1} />
          <p className="text-sm">尚無食材資料，請先執行種子腳本</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>食材名稱</TableHead>
                <TableHead className="text-right">現有庫存</TableHead>
                <TableHead className="text-right">現有庫存 (台斤)</TableHead>
                <TableHead className="text-right">安全庫存</TableHead>
                <TableHead className="w-44">調整數量 (kg)</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => {
                const isBelowMin = row.currentKg < row.minStockKg;
                return (
                  <TableRow
                    key={row.ingredientId}
                    className={
                      row.dirty
                        ? 'bg-amber-50/60 dark:bg-amber-950/20'
                        : idx % 2 !== 0
                          ? 'bg-muted/30'
                          : ''
                    }
                  >
                    <TableCell className="font-medium">
                      {row.name}
                      {isBelowMin && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          低庫存
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      <span className={isBelowMin ? 'text-red-600 dark:text-red-400' : ''}>
                        {fmtKg(row.currentKg)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtTaijin(toTaijin(row.currentKg))}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtKg(row.minStockKg)}
                    </TableCell>

                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={row.editValue}
                        onChange={(e) => updateEdit(row.ingredientId, e.target.value)}
                        disabled={row.saving}
                        className="h-8 w-36 text-right tabular-nums"
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1">
                        {row.dirty && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resetRow(row.ingredientId)}
                              disabled={row.saving}
                              className="h-7 w-7 p-0"
                              title="還原"
                            >
                              <RotateCcw size={12} />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveRow(row.ingredientId)}
                              disabled={row.saving}
                              className="h-7 gap-1 px-2 text-xs"
                            >
                              <Save size={11} />
                              {row.saving ? '…' : '儲存'}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Toaster />
    </div>
  );
}
