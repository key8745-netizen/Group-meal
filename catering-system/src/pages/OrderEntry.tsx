import { ClipboardList } from 'lucide-react';

export default function OrderEntry() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-muted-foreground">
      <ClipboardList size={48} strokeWidth={1.2} />
      <p className="text-sm">訂單管理（開發中）</p>
    </div>
  );
}
