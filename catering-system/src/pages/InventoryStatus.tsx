import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { PackageSearch, RefreshCw } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster, InventoryDoc, InventoryBatch, FreshnessState, StorageType } from '@/services/types';
import { pricePerKgFromDefault, todayLocalIsoDate } from '@/services/marketPriceService';
import { listAllBatches } from '@/services/inventoryBatchService';
import { batchState } from '@/services/freshnessService';
import { PreservationDialog, type PreservationSource } from '@/components/inventory/PreservationDialog';
import { createSeededBatch } from '@/services/inventoryBatchService';
import { planInitialBatchSeedBatch } from '@/services/initialBatchSeedPlanner';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { InventoryAudit } from '@/components/InventoryAudit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryRow {
  ingredientId: string;
  ingredientName: string;
  currentStockKg: number;
  safetyLevelKg: number;
  category: string;
  /** 每 kg 單價（基準價換算；未設定為 0）。 */
  pricePerKg: number;
  lastUpdated?: string;
  /** Feature 071: 該食材有剩餘的批次數。 */
  batchCount: number;
  /** Feature 071: 最急批次的保鮮狀態（null = 無批次資料）。 */
  worstFreshness: FreshnessState | null;
}

// Feature 071: 保鮮狀態顯示設定與「最急」排序（愈前愈急）。
const FRESHNESS_RANK: Record<FreshnessState, number> = {
  EXPIRED: 0, CRITICAL: 1, USE_FIRST: 2, FRESH: 3, DEPLETED: 4,
};
const FRESHNESS_CONFIG: Record<FreshnessState, { label: string; cls: string }> = {
  EXPIRED:   { label: '已過期',   cls: 'bg-red-100 text-red-700 border-red-200' },
  CRITICAL:  { label: '臨界',     cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  USE_FIRST: { label: '優先用',   cls: 'border-amber-400 text-amber-700' },
  FRESH:     { label: '新鮮',     cls: 'bg-green-100 text-green-700 border-green-200' },
  DEPLETED:  { label: '已用罄',   cls: 'text-muted-foreground' },
};

/** 取一組批次中「最急」的保鮮狀態；忽略已用罄；無有效批次回 null。 */
function worstBatchFreshness(
  batches: InventoryBatch[],
  ing: IngredientMaster | undefined,
  todayIso: string,
): FreshnessState | null {
  let worst: FreshnessState | null = null;
  for (const b of batches) {
    if (!(b.qtyRemainingKg > 0)) continue;
    const st = batchState(b, ing ?? {}, todayIso);
    if (st === 'DEPLETED') continue;
    if (worst === null || FRESHNESS_RANK[st] < FRESHNESS_RANK[worst]) worst = st;
  }
  return worst;
}

type StockStatus = 'ok' | 'low' | 'critical' | 'unknown';
type PageTab     = 'overview' | 'batches' | 'audit';

const STORAGE_LABELS: Record<StorageType, string> = { ambient: '常溫', chilled: '冷藏', frozen: '冷凍' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatus(current: number, safety: number): StockStatus {
  if (safety <= 0) return 'unknown';
  const ratio = current / safety;
  if (ratio >= 1) return 'ok';
  if (ratio >= 0.3) return 'low';
  return 'critical';
}

const statusConfig: Record<StockStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  extra: string;
}> = {
  ok:       { label: '充足',    variant: 'secondary',   extra: 'bg-green-100 text-green-700 border-green-200' },
  low:      { label: '偏低',    variant: 'outline',     extra: 'border-amber-400 text-amber-700' },
  critical: { label: '嚴重不足', variant: 'destructive', extra: '' },
  unknown:  { label: '未設定',  variant: 'outline',     extra: 'text-muted-foreground' },
};

const statusOrder: Record<StockStatus, number> = { critical: 0, low: 1, unknown: 2, ok: 3 };

type FilterKey = StockStatus | 'all';

const PAGE_TABS: { key: PageTab; label: string }[] = [
  { key: 'overview', label: '庫存總覽' },
  { key: 'batches',  label: '批次明細' },
  { key: 'audit',    label: '庫存盤點' },
];

// ─── InventoryStatus ──────────────────────────────────────────────────────────

export default function InventoryStatus() {
  const [pageTab, setPageTab] = useState<PageTab>('overview');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  // Feature 081: 批次明細分頁——原始批次 + 食材主檔對照 + 加工延壽目標。
  const [allBatches, setAllBatches] = useState<InventoryBatch[]>([]);
  const [ingredientById, setIngredientById] = useState<Map<string, IngredientMaster>>(new Map());
  const [preserveTarget, setPreserveTarget] = useState<PreservationSource | null>(null);
  // Feature 088: 初始批次種子（App 內從現有庫存啟用保鮮）。
  const [seeding, setSeeding] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inventorySnap, ingredientSnap, allBatches] = await Promise.all([
        getDocs(collection(db, 'inventory')),
        getDocs(collection(db, 'ingredients')),
        // Feature 071: 批次為並存期附加資料，讀取失敗不影響庫存總覽。
        listAllBatches(db).catch(() => [] as InventoryBatch[]),
      ]);

      const ingredientMap = new Map<string, IngredientMaster>();
      ingredientSnap.docs.forEach(doc => {
        ingredientMap.set(doc.id, { id: doc.id, ...doc.data() } as IngredientMaster);
      });
      setIngredientById(ingredientMap);
      setAllBatches(allBatches);

      const batchesByIngredient = new Map<string, InventoryBatch[]>();
      for (const b of allBatches) {
        const arr = batchesByIngredient.get(b.ingredientId) ?? [];
        arr.push(b);
        batchesByIngredient.set(b.ingredientId, arr);
      }
      const todayIso = todayLocalIsoDate();

      const data: InventoryRow[] = inventorySnap.docs.map(doc => {
        const inv = doc.data() as InventoryDoc;
        const ing = ingredientMap.get(inv.ingredientId);
        const currentStockKg = inv.currentStock ?? 0;
        // Feature 067: minStockLevel 一律以 kg 儲存（食材主檔「安全庫存(kg)」欄位），
        // 與首頁／儀表板的 computeLowStock 一致；不再依賴 legacy ing.unit 轉換，
        // 避免同一食材在不同頁面出現不同的安全水位。
        const safetyLevelKg = ing && typeof ing.minStockLevel === 'number' ? ing.minStockLevel : 0;
        const batches = (batchesByIngredient.get(inv.ingredientId) ?? []).filter((b) => b.qtyRemainingKg > 0);
        return {
          ingredientId: inv.ingredientId,
          ingredientName: inv.ingredientName,
          currentStockKg,
          safetyLevelKg,
          // Feature 067: 單價改用現行價格模型（基準價 → 每 kg），legacy unitCost
          // 對主檔管理的食材恆為 0（顯示 NT$0 誤導），改以 pricePerKgFromDefault。
          pricePerKg: ing ? (pricePerKgFromDefault(ing) ?? 0) : 0,
          category: ing?.category ?? '—',
          lastUpdated: inv.lastUpdated
            ? inv.lastUpdated.toDate().toLocaleDateString('zh-TW')
            : undefined,
          batchCount: batches.length,
          worstFreshness: worstBatchFreshness(batches, ing, todayIso),
        };
      });

      data.sort((a, b) => {
        const sa = getStatus(a.currentStockKg, a.safetyLevelKg);
        const sb = getStatus(b.currentStockKg, b.safetyLevelKg);
        if (statusOrder[sa] !== statusOrder[sb]) return statusOrder[sa] - statusOrder[sb];
        return a.ingredientName.localeCompare(b.ingredientName, 'zh-TW');
      });

      setRows(data);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStatus = (s: StockStatus) => rows.filter(r => getStatus(r.currentStockKg, r.safetyLevelKg) === s);
  const counts = {
    all:      rows.length,
    ok:       byStatus('ok').length,
    low:      byStatus('low').length,
    critical: byStatus('critical').length,
  };

  const displayed = filter === 'all'
    ? rows
    : rows.filter(r => getStatus(r.currentStockKg, r.safetyLevelKg) === filter);

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: `全部（${counts.all}）` },
    { key: 'critical', label: `嚴重不足（${counts.critical}）` },
    { key: 'low',      label: `偏低（${counts.low}）` },
    { key: 'ok',       label: `充足（${counts.ok}）` },
  ];

  // Feature 081: 有剩餘的批次，依效期 FEFO 排序（最急在前），附保鮮狀態與食材。
  const batchRows = useMemo(() => {
    const todayIso = todayLocalIsoDate();
    return allBatches
      .filter((b) => b.qtyRemainingKg > 0)
      .map((b) => {
        const ing = ingredientById.get(b.ingredientId);
        return {
          batch: b,
          name: ing?.name ?? b.ingredientId,
          freshness: batchState(b, ing ?? {}, todayIso) as FreshnessState,
          perishable: ing?.isPerishable !== false,
        };
      })
      .sort((a, b) => a.batch.expirationDate.localeCompare(b.batch.expirationDate));
  }, [allBatches, ingredientById]);

  // Feature 088: 「有庫存但無批次」的易腐食材 → 可建立初始批次讓保鮮系統看見。
  const seedablePlans = useMemo(() => {
    const withBatches = new Set(allBatches.map((b) => b.ingredientId));
    const list = rows.map((r) => ({
      id: r.ingredientId,
      name: r.ingredientName,
      currentStockKg: r.currentStockKg,
      hasBatches: withBatches.has(r.ingredientId),
      params: ingredientById.get(r.ingredientId) ?? {},
    }));
    return planInitialBatchSeedBatch(list, todayLocalIsoDate()).filter((p) => p.action === 'willSeed');
  }, [rows, allBatches, ingredientById]);

  async function handleSeedInitialBatches() {
    if (seedablePlans.length === 0) return;
    const proceed = await confirm({
      title: '從現有庫存建立初始批次',
      description:
        `將替 ${seedablePlans.length} 項「有庫存但無批次」的易腐食材各建立一筆初始批次，` +
        `讓保鮮警示能看見既有庫存。入庫日與效期為估計（今日起算保存期），可於批次明細調整。`,
      confirmLabel: `建立 ${seedablePlans.length} 筆`,
    });
    if (!proceed) return;
    setSeeding(true);
    try {
      let count = 0;
      for (const p of seedablePlans) {
        if (!p.batch) continue;
        try {
          await createSeededBatch(db, p.id, p.batch);
          count++;
        } catch { /* 單筆失敗略過 */ }
      }
      toast({ title: '初始批次已建立', description: `共 ${count} 筆；保鮮警示現在會涵蓋這些食材。` });
      await load();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* Page-level tab bar */}
      <div className="flex gap-1 border-b bg-muted/20 px-6 pt-4">
        {PAGE_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPageTab(key)}
            className={[
              'rounded-t-md px-4 py-2 text-sm font-medium transition-colors',
              pageTab === key
                ? 'border border-b-background -mb-px bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Audit tab */}
      {pageTab === 'audit' && <InventoryAudit />}

      {/* Overview tab */}
      {pageTab === 'overview' && (
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">庫存總覽</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                即時庫存水位，標示低於安全水位的食材。
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="重新整理">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="ml-1.5 hidden sm:inline">重新整理</span>
            </Button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {filterChips.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === key
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-muted text-muted-foreground hover:border-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
              <PackageSearch size={48} strokeWidth={1.2} />
              <p className="text-sm">無符合條件的庫存項目</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材名稱</TableHead>
                    <TableHead>類別</TableHead>
                    <TableHead className="text-right">目前庫存</TableHead>
                    <TableHead className="text-right">安全水位</TableHead>
                    <TableHead className="text-right">單價 / kg</TableHead>
                    <TableHead>批次 / 保鮮</TableHead>
                    <TableHead>更新日期</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((row, idx) => {
                    const status = getStatus(row.currentStockKg, row.safetyLevelKg);
                    const { label, variant, extra } = statusConfig[status];
                    const isAlert = status === 'critical' || status === 'low';
                    return (
                      <TableRow
                        key={row.ingredientId}
                        className={idx % 2 !== 0 ? 'bg-muted/30' : ''}
                      >
                        <TableCell className="font-medium">{row.ingredientName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${isAlert ? 'font-medium text-destructive' : ''}`}
                        >
                          {row.currentStockKg.toFixed(2)} kg
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.safetyLevelKg > 0 ? `${row.safetyLevelKg.toFixed(2)} kg` : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.pricePerKg > 0 ? `NT$ ${row.pricePerKg.toLocaleString()}` : '—'}
                        </TableCell>
                        <TableCell>
                          {row.batchCount === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className="tabular-nums text-muted-foreground">{row.batchCount} 批</span>
                              {row.worstFreshness && (
                                <Badge variant="outline" className={FRESHNESS_CONFIG[row.worstFreshness].cls}>
                                  {FRESHNESS_CONFIG[row.worstFreshness].label}
                                </Badge>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.lastUpdated ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={variant} className={extra}>
                            {label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Feature 081: 批次明細分頁 */}
      {pageTab === 'batches' && (
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">批次明細</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                依效期排序（最急在前）；易腐批次可「加工延壽」——煮熟冷藏/冷凍成新批次並記住來源。
              </p>
            </div>
            <div className="flex items-center gap-2">
              {seedablePlans.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-400 text-emerald-700 dark:text-emerald-400"
                  onClick={handleSeedInitialBatches}
                  disabled={seeding}
                >
                  {seeding ? '建立中…' : `從現有庫存建立初始批次（${seedablePlans.length}）`}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="重新整理">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span className="ml-1.5 hidden sm:inline">重新整理</span>
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : batchRows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
              <PackageSearch size={48} strokeWidth={1.2} />
              <p className="text-sm">尚無批次資料（收貨或加工延壽後會建立批次）</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材</TableHead>
                    <TableHead>批次</TableHead>
                    <TableHead>儲存</TableHead>
                    <TableHead className="text-right">剩餘</TableHead>
                    <TableHead>效期</TableHead>
                    <TableHead>保鮮</TableHead>
                    <TableHead>來源 / 加工</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchRows.map(({ batch, name, freshness, perishable }, idx) => (
                    <TableRow key={batch.ingredientId + batch.id} className={idx % 2 !== 0 ? 'bg-muted/30' : ''}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">#{batch.id}</TableCell>
                      <TableCell className="text-sm">
                        {STORAGE_LABELS[batch.storageType]}
                        {batch.processedLabel && (
                          <Badge variant="outline" className="ml-1.5 border-orange-400 font-normal text-orange-700 dark:text-orange-400">
                            {batch.processedLabel}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{batch.qtyRemainingKg.toFixed(2)} kg</TableCell>
                      <TableCell className="tabular-nums text-sm">{batch.expirationDate}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={FRESHNESS_CONFIG[freshness].cls}>
                          {FRESHNESS_CONFIG[freshness].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                        {batch.sourceNote ? (
                          <span title={batch.sourceNote} className="line-clamp-2">{batch.sourceNote}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {perishable && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 border-orange-400 px-2 text-xs text-orange-700 dark:text-orange-400"
                            onClick={() =>
                              setPreserveTarget({
                                batchId: batch.id,
                                ingredientId: batch.ingredientId,
                                ingredientName: name,
                                remainingKg: batch.qtyRemainingKg,
                              })
                            }
                          >
                            加工延壽
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Feature 081: 加工延壽對話框 */}
      {preserveTarget && (
        <PreservationDialog
          db={db}
          source={preserveTarget}
          ingredient={ingredientById.get(preserveTarget.ingredientId)}
          performedBy={auth.currentUser?.email ?? auth.currentUser?.uid ?? 'unknown'}
          onClose={() => setPreserveTarget(null)}
          onDone={(newBatchId) => {
            setPreserveTarget(null);
            toast({ title: '加工延壽完成', description: `已建立加工批次 #${newBatchId}` });
            load();
          }}
        />
      )}

      <Toaster />
      {confirmDialog}
    </div>
  );
}
