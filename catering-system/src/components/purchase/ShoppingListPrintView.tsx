/**
 * ShoppingListPrintView — Feature 062: 待採購彙總採買清單（列印用）。
 *
 * 把所有待採購（PENDING）採購單彙總成一張可帶去市場的清單：每項含 kg 與
 * 台斤、來源單數，並附勾選欄方便現場核對。由 PurchaseOrderList 觸發
 * window.print()，僅在列印時顯示（print:block）。
 */

import type { ShoppingListSummary } from '@/services/shoppingListService';

export function ShoppingListPrintView({ summary }: { summary: ShoppingListSummary }) {
  const printedAt = new Date().toLocaleString('zh-TW');
  return (
    <div className="p-8 text-black">
      <h1 className="text-xl font-semibold">待採購彙總清單</h1>
      <p className="mt-1 text-sm text-gray-600">
        列印時間：{printedAt}　·　彙總 {summary.sourceOrderCount} 張待採購單　·　共 {summary.itemCount} 項食材
      </p>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="w-10 py-1 text-center">✓</th>
            <th className="py-1 text-left">食材</th>
            <th className="py-1 text-right">數量（台斤）</th>
            <th className="py-1 text-right">數量（kg）</th>
            <th className="py-1 text-left">來源</th>
          </tr>
        </thead>
        <tbody>
          {summary.lines.map((line) => (
            <tr key={line.ingredientId} className="border-b border-gray-300">
              <td className="py-2 text-center">
                <span className="inline-block h-4 w-4 border border-black" />
              </td>
              <td className="py-2 font-medium">{line.name}</td>
              <td className="py-2 text-right tabular-nums">{line.totalTaijin}</td>
              <td className="py-2 text-right tabular-nums text-gray-600">{line.totalKg}</td>
              <td className="py-2 text-gray-600">
                {line.orderCount > 1 ? `${line.orderCount} 張單彙總` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.itemCount === 0 && (
        <p className="mt-6 text-sm text-gray-600">目前沒有待採購的品項。</p>
      )}
    </div>
  );
}
