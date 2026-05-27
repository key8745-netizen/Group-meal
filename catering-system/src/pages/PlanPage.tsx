import { db } from '@/lib/firebase';
import { ProductionPlanner } from '@/components/ProductionPlanner';

export default function PlanPage() {
  return <ProductionPlanner db={db} />;
}
