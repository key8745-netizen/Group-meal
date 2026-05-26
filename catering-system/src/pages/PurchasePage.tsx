import { db } from '@/lib/firebase';
import { PurchasePlanner } from '@/components/PurchasePlanner';

export default function PurchasePage() {
  return <PurchasePlanner db={db} />;
}
