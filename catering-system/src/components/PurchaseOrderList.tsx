import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { CheckCircle, ChevronDown, ChevronRight, ClipboardCopy, Link2, Package, Printer, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  purchaseOrderService,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '@/services/purchaseOrderService';
import { buildConsolidatedShoppingList } from '@/services/shoppingListService';
import { formatWeight } from '@/utils/unitConverter';
import { useWeightUnit } from '@/contexts/WeightUnitContext';
import { ShoppingListPrintView } from '@/components/purchase/ShoppingListPrintView';

const TENANT_ID: string =
  (import.meta.env.VITE_TENANT_ID as string | undefined) ??
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ??
  'umas-booking-manager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { ReceiveOrderDialog } from '@/components/purchase/ReceiveOrderDialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (ts: Timestamp | undefined) =>
  ts ? ts.toDate().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';


const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT:     '草稿',
  PENDING:   '待採購',
  RECEIVED:  '已完成',
  CANCELLED: '已取消',
};

const STATUS_VARIANT: Record<PurchaseOrderStatus, 'outline' | 'secondary' | 'destructive'> = {
  DRAFT:     'outline',
  PENDING:   'outline',
  RECEIVED:  'secondary',
  CANCELLED: 'destructive',
};

const TABS: PurchaseOrderStatus[] = ['DRAFT', 'PENDING', 'RECEIVED'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShareButton({ orderId }: { orderId: string }) {
  const [copied, setCopied] = useState(false);
  const [busy,   setBusy]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Feature 107: the URL is no longer derivable from the order id — the link
  // only works once a publicOrderShares snapshot exists, so mint it first.
  async function handleShare() {
    setBusy(true);
    try {
      const token = await purchaseOrderService.createShareLink(orderId);
      const url   = `${window.location.origin}/share/${token}`;

      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard blocked (non-HTTPS / permission) — show it to copy by hand
        toast({ title: '分享連結', description: url });
      }
    } catch (err) {
      toast({
        title:       '無法建立分享連結',
        description: err instanceof Error ? err.message : '請稍後再試',
        variant:     'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      disabled={busy}
      className="gap-1.5 text-xs"
    >
      {copied ? <ClipboardCopy size={13} /> : <Link2 size={13} />}
      {busy ? '產生中…' : copied ? '已複製' : '分享'}
    </Button>
  );
}

function OrderCard({ order, onApprove, onComplete }: {
  order: PurchaseOrder;
  onApprove: (id: string) => void;
  onComplete: (order: PurchaseOrder) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { unit } = useWeightUnit();

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center justify-between bg-muted/30 px-4 py-3 hover:bg-muted/50"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="font-mono text-xs text-muted-foreground">#{order.id?.slice(-8)}</span>
          <Badge variant={STATUS_VARIANT[order.status]}>
            {STATUS_LABEL[order.status]}
          </Badge>
          <span className="text-sm text-muted-foreground">{fmtDate(order.createdAt)}</span>
          <span className="text-xs text-muted-foreground">
            共 {order.items.length} 項
          </span>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <ShareButton orderId={order.id!} />

          {/* DRAFT: must go through human approval before purchasing */}
          {order.status === 'DRAFT' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => onApprove(order.id!)}
            >
              <ShieldCheck size={13} />
              核准草稿
            </Button>
          )}

          {/* PENDING: human confirms physical receipt and triggers restock */}
          {order.status === 'PENDING' && (
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onComplete(order)}
            >
              <CheckCircle size={13} />
              確認入庫
            </Button>
          )}
        </div>
      </div>

      {/* Expandable item table */}
      {expanded && order.notes && (
        <div className="border-b bg-amber-50/60 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
          {order.notes}
        </div>
      )}
      {expanded && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>食材名稱</TableHead>
              <TableHead className="text-right">採購量</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item, idx) => (
              <TableRow key={item.ingredientId} className={idx % 2 !== 0 ? 'bg-muted/30' : ''}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatWeight(item.purchaseQtyKg, unit)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── PurchaseOrderList ────────────────────────────────────────────────────────

export function PurchaseOrderList() {
  const [orders,      setOrders]      = useState<PurchaseOrder[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<PurchaseOrderStatus>('PENDING');
  const [completing,  setCompleting]  = useState<Set<string>>(new Set());
  // Feature 061: 收貨對話框（逐項可改實收量）
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  // Feature 062: 待採購彙總採買清單（列印用；null = 非列印狀態）
  const [shoppingList, setShoppingList] = useState<ReturnType<typeof buildConsolidatedShoppingList> | null>(null);

  // ── Real-time listener ───────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'purchaseOrders'),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseOrder)));
        setLoading(false);
      },
      () => {
        toast({ variant: 'destructive', title: '無法載入採購單' });
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  // ── Approve DRAFT → PENDING (requires human action) ─────────────────────
  async function handleApprove(orderId: string) {
    setCompleting((prev) => new Set(prev).add(orderId));
    try {
      await purchaseOrderService.approveDraftOrder(orderId, TENANT_ID);
      toast({ title: '草稿已核准', description: `採購單 #${orderId.slice(-8)} 已轉為待採購。` });
    } catch (err) {
      toast({
        variant:     'destructive',
        title:       '核准失敗',
        description: err instanceof Error ? err.message : '請稍後再試。',
      });
    } finally {
      setCompleting((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const tabOrders = orders.filter((o) => o.status === activeTab);
  const pendingOrders = orders.filter((o) => o.status === 'PENDING');

  // Feature 062: 彙總所有待採購單 → 一張採買清單，列印帶去市場
  function handlePrintShoppingList() {
    setShoppingList(buildConsolidatedShoppingList(pendingOrders));
    setTimeout(() => {
      window.print();
      setShoppingList(null);
    }, 0);
  }

  return (
    <>
    <div className="flex flex-col gap-6 p-6 print:hidden">

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">採購單管理</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              即時追蹤採購進度，確認入庫後自動補回庫存。
            </p>
          </div>
        </div>
        {pendingOrders.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handlePrintShoppingList}
          >
            <Printer size={14} />
            列印採買清單
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        {TABS.map((tab) => {
          const count = orders.filter((o) => o.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {STATUS_LABEL[tab]}
              {count > 0 && (
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                  activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : tabOrders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
          <Package size={40} strokeWidth={1.1} />
          <p className="text-sm">目前沒有{STATUS_LABEL[activeTab]}的採購單</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tabOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onApprove={completing.has(order.id!) ? () => {} : handleApprove}
              onComplete={setReceivingOrder}
            />
          ))}
        </div>
      )}

      {receivingOrder && (
        <ReceiveOrderDialog
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onReceived={() => setReceivingOrder(null)}
        />
      )}

      <Toaster />
    </div>

    {shoppingList && (
      <div className="hidden print:block">
        <ShoppingListPrintView summary={shoppingList} />
      </div>
    )}
    </>
  );
}
