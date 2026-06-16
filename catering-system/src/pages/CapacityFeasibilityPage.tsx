import { useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { CapacityFeasibilityCheck, CapacityResult } from '@/services/types';
import {
  createCapacityFeasibilityCheck,
  listCapacityFeasibilityChecks,
  type CapacityFeasibilityInput,
} from '@/services/capacityFeasibilityService';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { CapacityFeasibilityForm } from '@/components/capacityFeasibility/CapacityFeasibilityForm';
import { CapacityFeasibilityResult } from '@/components/capacityFeasibility/CapacityFeasibilityResult';
import { CapacityFeasibilityHistory } from '@/components/capacityFeasibility/CapacityFeasibilityHistory';

export default function CapacityFeasibilityPage() {
  const [submitting, setSubmitting] = useState(false);
  const [latestResult, setLatestResult] = useState<CapacityResult | null>(null);
  const [latestPlanName, setLatestPlanName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedPlanName, setSelectedPlanName] = useState('');
  const [history, setHistory] = useState<CapacityFeasibilityCheck[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  async function loadHistory(planId: string) {
    try {
      const checks = await listCapacityFeasibilityChecks(db, planId);
      setHistory(checks);
      setHistoryLoaded(true);
    } catch {
      setHistory([]);
      setHistoryLoaded(true);
    }
  }

  async function handleSubmit(planId: string, planName: string, input: CapacityFeasibilityInput) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast({ title: '錯誤', description: '請先登入', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const check = await createCapacityFeasibilityCheck(db, planId, input, uid);
      setLatestResult(check.result);
      setLatestPlanName(planName);
      if (planId !== selectedPlanId) {
        setSelectedPlanId(planId);
        setSelectedPlanName(planName);
      }
      await loadHistory(planId);
      toast({ title: '評估完成', description: `已產生產能可行性評估` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      if (msg.includes('No active tasks')) {
        toast({
          title: '無有效任務',
          description: '此製程規劃中無有效任務，無法產生評估',
          variant: 'destructive',
        });
      } else {
        toast({ title: '評估失敗', description: msg, variant: 'destructive' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <Toaster />

      <div className="flex items-center gap-3">
        <BarChart2 size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-semibold">產能評估</h1>
          <p className="text-sm text-muted-foreground">人工參考用啟發式接單能力評估</p>
        </div>
      </div>

      {/* Form */}
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">新增評估</h2>
        <CapacityFeasibilityForm onSubmit={handleSubmit} submitting={submitting} />
      </section>

      {/* Latest result */}
      {latestResult && (
        <section>
          <h2 className="mb-3 text-base font-semibold">最新評估結果</h2>
          <CapacityFeasibilityResult result={latestResult} planName={latestPlanName} />
        </section>
      )}

      {/* History */}
      {historyLoaded && (
        <section>
          <h2 className="mb-3 text-base font-semibold">
            歷史評估記錄
            {selectedPlanName && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {selectedPlanName}
              </span>
            )}
          </h2>
          <CapacityFeasibilityHistory checks={history} planName={selectedPlanName} />
        </section>
      )}
    </div>
  );
}
