/**
 * Public share page — no authentication required.
 * Designed for vendors: mobile-friendly, print-optimized.
 *
 * Route: /share/:shareToken
 *
 * Feature 107: reads `publicOrderShares/{shareToken}` — a minimal snapshot of
 * the order — NOT `purchaseOrders`, which stays behind the email allowlist.
 * The URL token is the doc id, which is what makes the unauthenticated read
 * expressible in firestore.rules at all (rules cannot see query params on a
 * `get`). Revoking the link = deleting that snapshot doc.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PublicOrderShare, PurchaseOrderStatus } from '@/services/purchaseOrderService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (ts: Timestamp | undefined) =>
  ts
    ? ts.toDate().toLocaleDateString('zh-TW', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

const fmtKg     = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} kg`;
const fmtTaijin = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} 台斤`;

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT:     '草稿',
  PENDING:   '待採購',
  RECEIVED:  '已完成',
  CANCELLED: '已取消',
};

// ─── ShareOrderPage ────────────────────────────────────────────────────────────

export default function ShareOrderPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [order,   setOrder]   = useState<PublicOrderShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!shareToken) { setError('無效的採購單連結'); setLoading(false); return; }

    getDoc(doc(db, 'publicOrderShares', shareToken))
      .then((snap) => {
        // Missing doc covers both "never shared" and "link revoked" — the page
        // must not distinguish them, or it would confirm token guesses.
        if (!snap.exists()) { setError('此分享連結已失效或不存在'); return; }
        setOrder(snap.data() as PublicOrderShare);
      })
      .catch(() => setError('無法載入採購單，請稍後再試'))
      .finally(() => setLoading(false));
  }, [shareToken]);

  const totalKg = order?.items.reduce((s, i) => s + i.purchaseQtyKg, 0) ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        載入中…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-medium text-gray-700">{error || '發生錯誤'}</p>
          <p className="mt-1 text-sm text-gray-400">請確認連結是否正確。</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Print styles ──────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body { font-size: 12pt; color: #000; background: #fff; }
          .no-print { display: none !important; }
          .print-break-avoid { break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; }
          th { background: #f5f5f5; }
        }
      `}</style>

      <div className="mx-auto max-w-2xl px-4 py-8 print:px-0 print:py-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-6 border-b pb-4 print-break-avoid">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">採購單</h1>
              <p className="mt-0.5 font-mono text-xs text-gray-400">#{order.orderId}</p>
            </div>
            <button
              onClick={() => window.print()}
              className="no-print rounded-md border px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              列印 / 儲存 PDF
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-400">建立時間</dt>
              <dd className="font-medium text-gray-800">{fmtDate(order.orderCreatedAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-400">狀態</dt>
              <dd className="font-medium text-gray-800">
                {STATUS_LABEL[order.status] ?? order.status}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">品項數</dt>
              <dd className="font-medium text-gray-800">{order.items.length} 項</dd>
            </div>
          </dl>
        </div>

        {/* ── Items table ─────────────────────────────────────────────────── */}
        <div className="print-break-avoid overflow-hidden rounded-lg border print:rounded-none print:border-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500 print:bg-gray-100">
                <th className="px-4 py-3">食材名稱</th>
                <th className="px-4 py-3 text-right">數量 (kg)</th>
                <th className="px-4 py-3 text-right">數量 (台斤)</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, idx) => (
                <tr
                  key={item.ingredientId}
                  className={`border-b last:border-0 ${idx % 2 !== 0 ? 'bg-gray-50 print:bg-white' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {fmtKg(item.purchaseQtyKg)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {fmtTaijin(item.purchaseTaijin)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-gray-50 font-semibold print:bg-gray-100">
                <td className="px-4 py-3 text-gray-700">合計</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtKg(totalKg)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                  {fmtTaijin(order.items.reduce((s, i) => s + i.purchaseTaijin, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <p className="no-print mt-6 text-center text-xs text-gray-300">
          此為唯讀分享頁面 · 僅供廠商查閱
        </p>
        <p className="hidden print:mt-8 print:block print:text-center print:text-xs print:text-gray-400">
          此為系統自動產生之採購單，如有疑問請聯絡訂購方。
        </p>
      </div>
    </>
  );
}
