import { PackageSearch } from 'lucide-react';

export default function InventoryStatus() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-muted-foreground">
      <PackageSearch size={48} strokeWidth={1.2} />
      <p className="text-sm">庫存管理（開發中）</p>
    </div>
  );
}
