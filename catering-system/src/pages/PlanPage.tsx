import { Brain, RefreshCw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ProductionPlanner } from '@/components/ProductionPlanner';
import PurchaseSuggestionCard from '@/components/PurchaseSuggestionCard';
import { useIntelligenceInsights } from '@/hooks/useIntelligenceInsights';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function ActiveSuggestionsSection() {
  const { items, loading, error, refresh } = useIntelligenceInsights();

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">主動式採購建議</h2>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          重新分析
        </Button>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {!loading && error && (
        <Alert variant="destructive">
          <AlertDescription>載入失敗：{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && items.length === 0 && (
        <Alert>
          <AlertDescription>目前無缺貨風險或高損耗風險，庫存狀況良好。</AlertDescription>
        </Alert>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <PurchaseSuggestionCard key={item.ingredientId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function PlanPage() {
  return (
    <div className="space-y-10">
      <ActiveSuggestionsSection />
      <ProductionPlanner db={db} />
    </div>
  );
}
