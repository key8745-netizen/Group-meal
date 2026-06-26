/**
 * MasterDataDryRunReportPage — Feature 031: 已登入權限下的基礎資料 dry-run 報告
 *
 * Authenticated, read-only dry-run report for Feature 030's ingredient
 * master-data backfill readiness. Reads /ingredients through the existing
 * authenticated app Firestore path (ingredientMasterService.listIngredients)
 * and runs the same pure planning logic as the Feature 030 script
 * (ingredientBackfillPlanner.planBackfillForIngredient).
 *
 * This page never writes to Firestore. There is no updateDoc/setDoc/addDoc
 * call anywhere in this file — backfill execution remains a separate,
 * Gatekeeper-authorized step performed via the Node script's --execute flag.
 */

import { useState } from 'react';
import { ClipboardCheck, Copy, RefreshCcw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { listIngredients } from '@/services/ingredientMasterService';
import {
  planBackfillForIngredient,
  type BackfillRowResult,
  type ReportCategory,
} from '@/services/ingredientBackfillPlanner';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  willUpdate: 'willUpdate（將補齊欄位）',
  alreadyValid: 'alreadyValid（已具備有效欄位）',
  skippedNeedsManualMapping: 'skippedNeedsManualMapping（不在已知對照表，需人工處理）',
  invalidOrUnsafe: 'invalidOrUnsafe（既有值不合法，不自動覆寫）',
};

const CATEGORY_ORDER: ReportCategory[] = [
  'willUpdate',
  'alreadyValid',
  'skippedNeedsManualMapping',
  'invalidOrUnsafe',
];

function buildCopyableReport(results: BackfillRowResult[]): string {
  const byCategory: Record<ReportCategory, BackfillRowResult[]> = {
    willUpdate: [],
    alreadyValid: [],
    skippedNeedsManualMapping: [],
    invalidOrUnsafe: [],
  };
  for (const r of results) byCategory[r.category].push(r);

  const lines: string[] = [];
  lines.push('=== Feature 030/031 Master Data Dry-Run Report (authenticated in-app) ===');
  lines.push('');
  lines.push(`Total ingredients inspected: ${results.length}`);
  for (const cat of CATEGORY_ORDER) lines.push(`  ${cat}: ${byCategory[cat].length}`);
  lines.push('');
  for (const cat of CATEGORY_ORDER) {
    if (byCategory[cat].length === 0) continue;
    lines.push(`--- ${cat} ---`);
    for (const r of byCategory[cat]) {
      const fields = r.fieldsToAdd ? ` fieldsToAdd=${JSON.stringify(r.fieldsToAdd)}` : '';
      lines.push(`  [${r.id}] ${r.name} — ${r.reason}${fields}`);
    }
    lines.push('');
  }
  lines.push('Dry-run only — no writes performed by this page.');
  lines.push('=== End of report ===');
  return lines.join('\n');
}

export default function MasterDataDryRunReportPage() {
  const [results, setResults] = useState<BackfillRowResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateReport() {
    setLoading(true);
    try {
      const ingredients = await listIngredients(db, { includeInactive: true });
      const planned = ingredients.map((ing) => planBackfillForIngredient(ing));
      setResults(planned);
    } catch (err) {
      toast({ variant: 'destructive', title: '無法產生報告', description: err instanceof Error ? err.message : '未知錯誤' });
    } finally {
      setLoading(false);
    }
  }

  async function copyReport() {
    if (!results) return;
    try {
      await navigator.clipboard.writeText(buildCopyableReport(results));
      toast({ title: '已複製報告' });
    } catch {
      toast({ variant: 'destructive', title: '複製失敗' });
    }
  }

  const byCategory: Record<ReportCategory, BackfillRowResult[]> = {
    willUpdate: [],
    alreadyValid: [],
    skippedNeedsManualMapping: [],
    invalidOrUnsafe: [],
  };
  if (results) for (const r of results) byCategory[r.category].push(r);

  return (
    <div className="flex flex-col gap-4 p-6">
      <Toaster />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">基礎資料 Dry-Run 報告</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Feature 030/031 — 唯讀檢視食材主檔欄位補齊狀況，僅供審查用。
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyReport} disabled={!results} className="gap-1.5">
            <Copy size={14} /> 複製報告
          </Button>
          <Button onClick={generateReport} disabled={loading} className="gap-1.5">
            <RefreshCcw size={14} /> {loading ? '產生中…' : '產生報告'}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">
        此頁面僅供唯讀檢視，不會寫入任何資料；正式 backfill 仍須另行 Gatekeeper 授權，並透過
        <code className="mx-1 rounded bg-amber-100 px-1">scripts/backfillIngredientMasterFields.ts --execute</code>
        執行。
      </div>

      {results && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">總計檢視食材數：{results.length}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {CATEGORY_ORDER.map((cat) => (
                <div key={cat} className="rounded-md bg-muted/40 p-2">
                  <p className="text-xs text-muted-foreground">{cat}</p>
                  <p className="text-lg font-semibold">{byCategory[cat].length}</p>
                </div>
              ))}
            </div>
          </div>

          {CATEGORY_ORDER.map((cat) => {
            const rows = byCategory[cat];
            if (rows.length === 0) return null;
            return (
              <div key={cat} className="rounded-lg border">
                <div className="border-b bg-muted/30 px-4 py-2 text-sm font-medium">
                  {CATEGORY_LABELS[cat]} — {rows.length} 項
                </div>
                <div className="divide-y">
                  {rows.map((r) => (
                    <div key={r.id} className="px-4 py-2 text-sm">
                      <p className="font-medium">[{r.id}] {r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      {r.fieldsToAdd && (
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-xs">
                          {JSON.stringify(r.fieldsToAdd, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!results && !loading && (
        <p className="text-sm text-muted-foreground">點擊「產生報告」以讀取食材主檔並產生 dry-run 報告。</p>
      )}
    </div>
  );
}
