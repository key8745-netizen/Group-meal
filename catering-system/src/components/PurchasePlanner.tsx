'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { PackageSearch, RefreshCw, Save, Send } from 'lucide-react';

import {
  ConcurrencyError,
  generatePurchaseSuggestion,
  markPurchaseOrdered,
  savePurchaseDraft,
  updatePurchaseDraft,
} from '@/services/purchaseService';
import type { PurchaseDraft, PurchaseLineItem, SupplierGroup } from '@/services/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchasePlannerProps {
  db: Firestore;
  /** When provided, only these orders contribute to demand calculation. */
  orderIds?: string[];
}

/** ingredientId → user-adjusted actual quantity in kg */
type EditedQtyMap = Record<string, number>;

/** PurchaseLineItem enriched with resolved display values */
type FinalItem = PurchaseLineItem & {
  effectiveQty: number;
  subtotal: number;
};

// ─── Pure helpers (no React) ──────────────────────────────────────────────────

const r3 = (n: number) => Math.round(n * 1000) / 1000;

const fmtKg = (n: number) =>
  `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} kg`;

const fmtCurrency = (n: number) =>
  `NT$ ${n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** Returns the user's edited quantity, or the system suggestion. */
function resolveQty(item: PurchaseLineItem, editedQtys: EditedQtyMap): number {
  return editedQtys[item.ingredientId] ?? item.suggestedQtyKg;
}

/**
 * Produces a save-ready PurchaseDraft with user-adjusted quantities baked in.
 * Rebuilds supplierGroups and totalEstimatedCost from scratch so the
 * persisted document is always internally consistent.
 */
function buildSavableDraft(
  draft: PurchaseDraft,
  editedQtys: EditedQtyMap,
): PurchaseDraft {
  const items: PurchaseLineItem[] = draft.items.map((item) => {
    const qty = resolveQty(item, editedQtys);
    return { ...item, suggestedQtyKg: qty, estimatedCost: r3(qty * item.unitCost) };
  });

  const groupMap = new Map<string, PurchaseLineItem[]>();
  for (const item of items) {
    const key = item.primarySupplierId ?? 'unassigned';
    const arr = groupMap.get(key) ?? [];
    arr.push(item);
    groupMap.set(key, arr);
  }

  const supplierGroups: SupplierGroup[] = Array.from(groupMap.entries()).map(
    ([supplierId, grpItems]) => ({
      supplierId,
      items: grpItems,
      subtotalCost: r3(grpItems.reduce((sum, i) => sum + i.estimatedCost, 0)),
    }),
  );

  return {
    ...draft,
    items,
    supplierGroups,
    totalEstimatedCost: r3(items.reduce((sum, i) => sum + i.estimatedCost, 0)),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border p-6">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border py-20 text-muted-foreground">
      <PackageSearch size={52} strokeWidth={1.1} />
      <p className="text-sm">目前無需採購 — 庫存水位充足，訂單需求已涵蓋。</p>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw size={13} className="mr-1.5" />
        重新檢查
      </Button>
    </div>
  );
}

// ─── PurchasePlanner ──────────────────────────────────────────────────────────

export function PurchasePlanner({ db, orderIds }: PurchasePlannerProps) {
  const { toast } = useToast();

  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [editedQtys, setEditedQtys] = useState<EditedQtyMap>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  /** Mirrors the `version` field of the last-loaded Firestore document. */
  const [loadedVersion, setLoadedVersion] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ordering, setOrdering] = useState(false);

  // ── Derived state ──────────────────────────────────────────────────────────

  /**
   * Single source of truth for all display values.
   * Both effectiveGroups and totalCost derive from this array so no value
   * is ever recomputed more than once per edit cycle.
   */
  const finalItems = useMemo<FinalItem[]>(
    () =>
      draft
        ? draft.items.map((item) => {
            const effectiveQty = editedQtys[item.ingredientId] ?? item.suggestedQtyKg;
            return { ...item, effectiveQty, subtotal: r3(effectiveQty * item.unitCost) };
          })
        : [],
    [draft, editedQtys],
  );

  const effectiveGroups = useMemo<Array<[string, { items: FinalItem[]; subtotal: number }]>>(
    () => {
      const map = new Map<string, { items: FinalItem[]; subtotal: number }>();
      for (const item of finalItems) {
        const key = item.primarySupplierId ?? 'unassigned';
        const entry = map.get(key) ?? { items: [], subtotal: 0 };
        entry.items.push(item);
        entry.subtotal = r3(entry.subtotal + item.subtotal);
        map.set(key, entry);
      }
      return Array.from(map.entries());
    },
    [finalItems],
  );

  const totalCost = useMemo(
    () => r3(finalItems.reduce((sum, item) => sum + item.subtotal, 0)),
    [finalItems],
  );

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setEditedQtys({});
    setDraftId(null);
    setLoadedVersion(0);
    try {
      const result = await generatePurchaseSuggestion(db, orderIds);
      setDraft(result);
      setLoadedVersion(result.version ?? 0);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '載入失敗',
        description: err instanceof Error ? err.message : '無法取得採購建議，請稍後再試。',
      });
    } finally {
      setLoading(false);
    }
  }, [db, orderIds, toast]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleQtyChange = useCallback((ingredientId: string, value: number) => {
    if (isNaN(value) || value < 0) return;
    setEditedQtys((prev) => ({ ...prev, [ingredientId]: r3(value) }));
  }, []);

  const handleSaveDraft = useCallback(async (): Promise<string | null> => {
    if (!draft) return null;
    setSaving(true);
    try {
      const savable = buildSavableDraft(draft, editedQtys);

      if (draftId) {
        // Document exists — update with optimistic lock check.
        await updatePurchaseDraft(db, draftId, savable, loadedVersion);
        setLoadedVersion(loadedVersion + 1);
        toast({ title: '草稿已更新', description: `文件 ID：${draftId}` });
        return draftId;
      } else {
        // First save — create new document (version initialised to 0 by service).
        const id = await savePurchaseDraft(db, savable);
        setDraftId(id);
        setLoadedVersion(0);
        toast({ title: '草稿已暫存', description: `文件 ID：${id}` });
        return id;
      }
    } catch (err) {
      if (err instanceof ConcurrencyError) {
        toast({
          variant: 'destructive',
          title: '版本衝突',
          description: err.message, // '資料已被他人修改，請刷新頁面'
        });
        // Reload a fresh suggestion; this also resets draftId / savedVersion.
        await loadDraft();
        return null;
      }
      toast({
        variant: 'destructive',
        title: '暫存失敗',
        description: err instanceof Error ? err.message : '請稍後再試。',
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [db, draft, draftId, editedQtys, loadDraft, loadedVersion, toast]);

  const handleMarkOrdered = useCallback(async () => {
    if (!draft) return;

    // Ensure we have a persisted doc ID before marking as ordered.
    const id = draftId ?? (await handleSaveDraft());
    if (!id) return; // save failed — handleSaveDraft already toasted the error

    setOrdering(true);
    try {
      await markPurchaseOrdered(db, id);
      toast({ title: '已正式發單', description: `採購單 ${id} 已送出。` });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '發單失敗',
        description: err instanceof Error ? err.message : '請稍後再試。',
      });
    } finally {
      setOrdering(false);
    }
  }, [db, draft, draftId, handleSaveDraft, toast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const busy = saving || ordering;

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">採購規劃</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            依庫存水位與訂單需求自動計算，可手動調整實際採購量。
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadDraft}
          disabled={loading || busy}
          aria-label="重新計算採購建議"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1.5 hidden sm:inline">重新計算</span>
        </Button>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <LoadingSkeleton />
      ) : !draft || draft.items.length === 0 ? (
        <EmptyState onRefresh={loadDraft} />
      ) : (
        <>
          {/* ── Supplier groups ── */}
          {effectiveGroups.map(([supplierId, { items, subtotal }]) => (
            <section key={supplierId} className="overflow-hidden rounded-lg border">

              {/* Group header */}
              <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    供應商
                  </span>
                  <Badge variant={supplierId === 'unassigned' ? 'outline' : 'secondary'}>
                    {supplierId === 'unassigned' ? '未指定' : supplierId}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  小計&ensp;
                  <span className="font-medium text-foreground">{fmtCurrency(subtotal)}</span>
                </span>
              </div>

              {/* Items table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材名稱</TableHead>
                    <TableHead className="text-right">目前庫存</TableHead>
                    <TableHead className="text-right">安全水位</TableHead>
                    <TableHead className="text-right">訂單需求</TableHead>
                    <TableHead className="text-right">系統建議量</TableHead>
                    <TableHead className="w-[148px] text-center">實際採購量 (kg)</TableHead>
                    <TableHead className="text-right">單價 / kg</TableHead>
                    <TableHead className="text-right">小計</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => {
                    const isEdited = item.ingredientId in editedQtys;

                    return (
                      <TableRow key={item.ingredientId} className={idx % 2 !== 0 ? 'bg-muted/30' : ''}>
                        <TableCell className="font-medium">{item.ingredientName}</TableCell>

                        <TableCell className="text-right text-muted-foreground">
                          {fmtKg(item.currentStockKg)}
                        </TableCell>

                        <TableCell className="text-right text-muted-foreground">
                          {fmtKg(item.safetyLevelKg)}
                        </TableCell>

                        <TableCell className="text-right text-muted-foreground">
                          {item.orderDemandKg > 0 ? fmtKg(item.orderDemandKg) : '—'}
                        </TableCell>

                        {/* System suggestion — struck-through when overridden */}
                        <TableCell className="text-right">
                          <span
                            className={
                              isEdited
                                ? 'text-xs text-muted-foreground line-through'
                                : 'text-sm'
                            }
                          >
                            {fmtKg(item.suggestedQtyKg)}
                          </span>
                        </TableCell>

                        {/* Controlled input — value comes from finalItems, resets on draft refresh */}
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            step={0.1}
                            value={item.effectiveQty}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              handleQtyChange(item.ingredientId, e.target.valueAsNumber)
                            }
                            className="h-8 w-full text-right tabular-nums"
                            aria-label={`${item.ingredientName} 實際採購量`}
                          />
                        </TableCell>

                        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                          {fmtCurrency(item.unitCost)}
                        </TableCell>

                        <TableCell className="text-right font-medium tabular-nums">
                          {fmtCurrency(item.subtotal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          ))}

          {/* ── Footer summary + actions ── */}
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                共 {draft.items.length} 項食材
                {draft.relatedOrderIds.length > 0 &&
                  `・${draft.relatedOrderIds.length} 張訂單`}
                {draftId && (
                  <span className="ml-2 font-mono text-xs opacity-60">#{draftId}</span>
                )}
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">
                {fmtCurrency(totalCost)}
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={busy}
                aria-label="暫存採購草稿"
              >
                <Save size={14} className="mr-1.5" />
                {saving ? '暫存中…' : '暫存草稿'}
              </Button>

              <Button
                onClick={handleMarkOrdered}
                disabled={busy}
                aria-label="正式送出採購單"
              >
                <Send size={14} className="mr-1.5" />
                {ordering ? '發單中…' : '正式發單'}
              </Button>
            </div>
          </div>
        </>
      )}

      {/*
        Toaster is placed here for self-containment.
        In production, move <Toaster /> to your app root layout so it isn't
        mounted multiple times.
      */}
      <Toaster />
    </div>
  );
}
