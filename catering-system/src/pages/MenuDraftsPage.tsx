import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { MenuDraft } from '@/services/types';
import { listMenuDrafts } from '@/services/menuDraftService';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/use-toast';
import { MenuDraftHistory } from '@/components/menuDraft/MenuDraftHistory';

export default function MenuDraftsPage() {
  const [drafts, setDrafts] = useState<MenuDraft[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listMenuDrafts(db)
      .then((d) => setDrafts(d))
      .catch((err) => {
        toast({
          title: '載入失敗',
          description: err instanceof Error ? err.message : '未知錯誤',
          variant: 'destructive',
        });
      })
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <Toaster />

      <div className="flex items-center gap-3">
        <ClipboardCheck size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-semibold">草稿菜單</h1>
          <p className="text-sm text-muted-foreground">人工參考用草稿菜單，非正式菜單</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">草稿菜單記錄</h2>
        {loaded ? <MenuDraftHistory drafts={drafts} /> : <p className="text-sm text-muted-foreground">載入中…</p>}
      </section>
    </div>
  );
}
