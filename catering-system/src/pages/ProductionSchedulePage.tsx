import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { getProductionWorkflowPlan } from '@/services/productionWorkflowService';
import type { ProductionScheduleSuggestion } from '@/services/types';
import {
  createProductionScheduleSuggestion,
  listProductionScheduleSuggestions,
  type ProductionScheduleInput,
} from '@/services/productionScheduleService';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { ProductionScheduleForm } from '@/components/productionSchedule/ProductionScheduleForm';
import { ProductionScheduleResult } from '@/components/productionSchedule/ProductionScheduleResult';
import { ProductionScheduleHistory } from '@/components/productionSchedule/ProductionScheduleHistory';

export default function ProductionSchedulePage() {
  const [submitting, setSubmitting] = useState(false);
  const [latestResult, setLatestResult] = useState<ProductionScheduleSuggestion | null>(null);
  const [latestPlanName, setLatestPlanName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedPlanName, setSelectedPlanName] = useState('');
  const [history, setHistory] = useState<ProductionScheduleSuggestion[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [taskNameById, setTaskNameById] = useState<Record<string, string>>({});

  async function loadHistory(planId: string) {
    try {
      const suggestions = await listProductionScheduleSuggestions(db, planId);
      setHistory(suggestions);
      setHistoryLoaded(true);
    } catch {
      setHistory([]);
      setHistoryLoaded(true);
    }
  }

  async function handleSubmit(planId: string, planName: string, input: ProductionScheduleInput) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast({ title: '錯誤', description: '請先登入', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const [suggestion, plan] = await Promise.all([
        createProductionScheduleSuggestion(db, planId, input, uid),
        getProductionWorkflowPlan(db, planId),
      ]);
      const names: Record<string, string> = {};
      for (const t of plan.tasks) names[t.id] = t.taskName;
      setTaskNameById(names);
      setLatestResult(suggestion);
      setLatestPlanName(planName);
      if (planId !== selectedPlanId) {
        setSelectedPlanId(planId);
        setSelectedPlanName(planName);
      }
      await loadHistory(planId);
      toast({ title: '排程完成', description: '已產生生產排程建議' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      if (msg.includes('No active tasks')) {
        toast({
          title: '無有效任務',
          description: '此製程規劃中無有效任務，無法產生排程建議',
          variant: 'destructive',
        });
      } else {
        toast({ title: '排程失敗', description: msg, variant: 'destructive' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <Toaster />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-semibold">生產排程</h1>
            <p className="text-sm text-muted-foreground">人力與製作順序自動排程建議</p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-3">
        排程建議不會回寫製程規劃，僅供排班參考。
      </p>

      {/* Form */}
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">新增排程建議</h2>
        <ProductionScheduleForm onSubmit={handleSubmit} submitting={submitting} />
      </section>

      {/* Latest result */}
      {latestResult && (
        <section>
          <h2 className="mb-3 text-base font-semibold">最新排程建議</h2>
          <ProductionScheduleResult
            result={latestResult}
            planName={latestPlanName}
            taskNameById={taskNameById}
          />
        </section>
      )}

      {/* History */}
      {historyLoaded && (
        <section>
          <h2 className="mb-3 text-base font-semibold">
            歷史排程記錄
            {selectedPlanName && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {selectedPlanName}
              </span>
            )}
          </h2>
          <ProductionScheduleHistory
            suggestions={history}
            planName={selectedPlanName}
            taskNameById={taskNameById}
          />
        </section>
      )}
    </div>
  );
}
