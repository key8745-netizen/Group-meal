/**
 * DailyOpsPage — 每日工作總覽 (Feature 038: Daily Ops Cockpit)
 *
 * Single read-only page showing, for a chosen date, the status of the whole
 * operating chain: 菜單 → 備料快照 → 採購需求草稿 → 製程規劃 → 排程建議 → 市價快取,
 * with next-action hints and links into the relevant feature pages.
 *
 * Entirely read-only — no writes are performed from this page.
 */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  ArrowRight,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { loadDailyOpsOverview, type OpsStepKey, type OpsStepStatus } from '@/services/dailyOpsService';
import type { DailyOpsOverview } from '@/services/dailyOpsService';
import { todayLocalIsoDate } from '@/services/marketPriceService';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const STEP_TITLE: Record<OpsStepKey, string> = {
  menu: '當日菜單',
  prepPlan: '備料快照',
  purchaseDraft: '採購需求草稿',
  workflowPlan: '製程規劃',
  scheduleSuggestion: '排程建議',
  marketPrice: '市場行情',
};

function StatusIcon({ status }: { status: OpsStepStatus }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={20} className="shrink-0 text-green-600" />;
    case 'partial':
      return <AlertTriangle size={20} className="shrink-0 text-amber-500" />;
    case 'missing':
      return <XCircle size={20} className="shrink-0 text-red-500" />;
    case 'na':
      return <MinusCircle size={20} className="shrink-0 text-muted-foreground/40" />;
  }
}

const STATUS_BADGE_CLASS: Record<OpsStepStatus, string> = {
  done: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  missing: 'bg-red-100 text-red-700',
  na: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<OpsStepStatus, string> = {
  done: '完成',
  partial: '部分完成',
  missing: '尚未建立',
  na: '不適用',
};

export default function DailyOpsPage() {
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get('date') || todayLocalIsoDate());
  const [overview, setOverview] = useState<DailyOpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(targetDate: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await loadDailyOpsOverview(db, targetDate);
      setOverview(result);
    } catch {
      setError('載入每日工作總覽失敗，請稍後再試');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const applicableSteps = overview?.steps.filter((s) => s.status !== 'na') ?? [];
  const doneCount = applicableSteps.filter((s) => s.status === 'done').length;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <ListChecks size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">每日工作總覽</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            檢視所選日期的供膳作業鏈狀態：菜單 → 備料快照 → 採購需求草稿 → 製程規劃 → 排程建議 → 市場行情。
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="max-w-[180px]"
        />
        {overview && !loading && (
          <span className="text-sm text-muted-foreground">
            {doneCount}/{applicableSteps.length} 步驟完成
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        overview && (
          <div className="flex flex-col gap-3">
            {overview.steps.map((step) => (
              <div
                key={step.key}
                className="rounded-lg border bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={step.status} />
                    <span className="font-medium">{STEP_TITLE[step.key]}</span>
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_BADGE_CLASS[step.status],
                      ].join(' ')}
                    >
                      {STATUS_LABEL[step.status]}
                    </span>
                    {step.status !== 'na' && (
                      <span className="text-xs text-muted-foreground">{step.count} 筆</span>
                    )}
                  </div>
                  <Link
                    to={step.linkTo}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    前往
                    <ArrowRight size={12} />
                  </Link>
                </div>

                {step.detailLines.length > 0 && (
                  <ul className="ml-[30px] space-y-0.5 text-sm text-muted-foreground">
                    {step.detailLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}

                {step.nextActionHint && (
                  <div className="ml-[30px] rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                    <Link to={step.linkTo} className="hover:underline">
                      {step.nextActionHint} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
