import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { getDocs, collection, query, where } from 'firebase/firestore';
import type { MenuMixRecommendation, ProductionWorkflowPlan } from '@/services/types';
import {
  createMenuMixRecommendation,
  listMenuMixRecommendations,
  type MenuMixRecommendationInput,
  type MenuMixRecommendationResult,
} from '@/services/menuMixRecommendationService';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { MenuMixRecommendationForm } from '@/components/menuMixRecommendation/MenuMixRecommendationForm';
import { MenuMixRecommendationResult as ResultCard } from '@/components/menuMixRecommendation/MenuMixRecommendationResult';
import { MenuMixRecommendationHistory } from '@/components/menuMixRecommendation/MenuMixRecommendationHistory';

export default function MenuMixRecommendationPage() {
  const [submitting, setSubmitting] = useState(false);
  const [latestResult, setLatestResult] = useState<MenuMixRecommendationResult | null>(null);
  const [history, setHistory] = useState<MenuMixRecommendation[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  async function loadHistory() {
    try {
      const recs = await listMenuMixRecommendations(db);
      setHistory(recs);
      setHistoryLoaded(true);
    } catch {
      setHistory([]);
      setHistoryLoaded(true);
    }
  }

  async function handleSubmit(
    input: MenuMixRecommendationInput,
    recipeNameSnapshots: Record<string, string>,
  ) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast({ title: '錯誤', description: '請先登入', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Load all active production workflow plans
      const planSnap = await getDocs(
        query(collection(db, 'productionWorkflowPlans'), where('isActive', '==', true)),
      );
      const plans: ProductionWorkflowPlan[] = planSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ProductionWorkflowPlan, 'id'>),
      }));

      const rec = await createMenuMixRecommendation(db, input, plans, recipeNameSnapshots, uid);
      setLatestResult(rec);
      await loadHistory();
      toast({ title: '建議完成', description: `已產生菜單組合建議` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      toast({ title: '建議失敗', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <Toaster />

      <div className="flex items-center gap-3">
        <ChefHat size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-semibold">菜單組合建議</h1>
          <p className="text-sm text-muted-foreground">人工參考用啟發式菜單組合配比建議</p>
        </div>
      </div>

      {/* Form */}
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">新增建議</h2>
        <MenuMixRecommendationForm onSubmit={handleSubmit} submitting={submitting} />
      </section>

      {/* Latest result */}
      {latestResult && (
        <section>
          <h2 className="mb-3 text-base font-semibold">最新建議結果</h2>
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <ResultCard result={latestResult} />
          </div>
        </section>
      )}

      {/* History */}
      {historyLoaded && (
        <section>
          <h2 className="mb-3 text-base font-semibold">歷史建議記錄</h2>
          <MenuMixRecommendationHistory records={history} />
        </section>
      )}
    </div>
  );
}
