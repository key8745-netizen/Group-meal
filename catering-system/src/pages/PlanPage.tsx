import { db } from '@/lib/firebase';
import { ProductionPlanner } from '@/components/ProductionPlanner';
import IntelligenceInsights from '@/components/IntelligenceInsights';

export default function PlanPage() {
  return (
    <div className="space-y-10">
      <IntelligenceInsights />
      <ProductionPlanner db={db} />
    </div>
  );
}
