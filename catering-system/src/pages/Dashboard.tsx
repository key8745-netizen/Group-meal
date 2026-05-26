import { LayoutDashboard } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-muted-foreground">
      <LayoutDashboard size={48} strokeWidth={1.2} />
      <p className="text-sm">儀表板（開發中）</p>
    </div>
  );
}
