import { useEffect, useState, useCallback } from 'react';
import { ClipboardList } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { MenuImportBatch, MenuImportItem } from '@/services/types';
import {
  createBatch,
  parseAndCreateRowsItems,
  updateItem,
  startReview,
  finalizeBatch,
  archiveBatch,
  listBatches,
  listItems,
  type ColumnMapping,
} from '@/services/menuImportService';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { CsvUploadStep } from '@/components/menuImport/CsvUploadStep';
import { ColumnMappingForm } from '@/components/menuImport/ColumnMappingForm';
import { MenuImportBatchList } from '@/components/menuImport/MenuImportBatchList';
import { MenuImportItemReviewTable } from '@/components/menuImport/MenuImportItemReviewTable';

type WizardStep = 'list' | 'upload' | 'mapping' | 'review';

export default function MenuImportPage() {
  const [step, setStep] = useState<WizardStep>('list');
  const [batches, setBatches] = useState<MenuImportBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<MenuImportBatch | null>(null);
  const [items, setItems] = useState<MenuImportItem[]>([]);

  const [organizationName, setOrganizationName] = useState('');
  const [yearMonth, setYearMonth] = useState('');
  const [mealProgram, setMealProgram] = useState('');
  const [servingBaseline, setServingBaseline] = useState(100);
  const [csvText, setCsvText] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  const reloadBatches = useCallback(() => {
    listBatches(db)
      .then(setBatches)
      .catch((err) => toast({ title: '載入失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' }));
  }, []);

  useEffect(() => {
    reloadBatches();
  }, [reloadBatches]);

  const openBatch = useCallback((batch: MenuImportBatch) => {
    setActiveBatch(batch);
    listItems(db, batch.id)
      .then(setItems)
      .catch((err) => toast({ title: '載入失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' }));
    setStep('review');
  }, []);

  const handleCsvParsed = useCallback((text: string, headers: string[]) => {
    setCsvText(text);
    setCsvHeaders(headers);
    setStep('mapping');
  }, []);

  const handleCreateBatch = useCallback(
    async (mapping: ColumnMapping) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const batchId = await createBatch(
          db,
          {
            sourceFileName: fileName || '貼上內容',
            organizationName,
            yearMonth,
            mealProgram,
            servingBaseline,
          },
          uid,
        );
        const result = await parseAndCreateRowsItems(db, batchId, csvText, mapping, uid);
        if (result.errors.length > 0) {
          toast({ title: '部分資料略過', description: result.errors.join('；') });
        }
        toast({ title: '已建立暫存批次', description: `${result.rowCount} 列、${result.itemCount} 項菜色` });
        reloadBatches();
        setStep('list');
      } catch (err) {
        toast({ title: '建立失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' });
      }
    },
    [fileName, organizationName, yearMonth, mealProgram, servingBaseline, csvText, reloadBatches],
  );

  const refreshActiveBatch = useCallback(() => {
    if (!activeBatch) return;
    listBatches(db).then((all) => {
      const updated = all.find((b) => b.id === activeBatch.id);
      if (updated) setActiveBatch(updated);
    });
    listItems(db, activeBatch.id).then(setItems);
  }, [activeBatch]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <Toaster />

      <div className="flex items-center gap-3">
        <ClipboardList size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-semibold">月菜單匯入</h1>
          <p className="text-sm text-muted-foreground">CSV 暫存與欄位對應，僅供人工審核用，不會直接建立正式資料</p>
        </div>
      </div>

      {step === 'list' && (
        <>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setStep('upload')}>新增匯入批次</Button>
          </div>
          <MenuImportBatchList batches={batches} onSelect={openBatch} />
        </>
      )}

      {step === 'upload' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input className="rounded-md border px-3 py-2 text-sm" placeholder="機構名稱" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
            <input className="rounded-md border px-3 py-2 text-sm" placeholder="年月（YYYY-MM）" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
            <input className="rounded-md border px-3 py-2 text-sm" placeholder="餐別/餐程，例如：成人午餐" value={mealProgram} onChange={(e) => setMealProgram(e.target.value)} />
            <input
              type="number"
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="預估人數"
              value={servingBaseline}
              onChange={(e) => setServingBaseline(Number(e.target.value))}
            />
          </div>
          <CsvUploadStep
            onParsed={(text, headers) => {
              setFileName('貼上內容');
              handleCsvParsed(text, headers);
            }}
          />
          <div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStep('list')}>取消</Button>
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-4">
          <ColumnMappingForm headers={csvHeaders} onSubmit={handleCreateBatch} />
          <Button type="button" size="sm" variant="ghost" onClick={() => setStep('upload')}>上一步</Button>
        </div>
      )}

      {step === 'review' && activeBatch && (
        <div className="space-y-4">
          <Button type="button" size="sm" variant="ghost" onClick={() => setStep('list')}>返回列表</Button>
          <MenuImportItemReviewTable
            batch={activeBatch}
            items={items}
            onUpdateItem={(itemId, patch) => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              updateItem(db, activeBatch.id, itemId, patch, uid).then(refreshActiveBatch);
            }}
            onStartReview={() => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              startReview(db, activeBatch.id, uid).then(refreshActiveBatch);
            }}
            onFinalize={() => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              finalizeBatch(db, activeBatch.id, uid).then(() => {
                toast({ title: '已定案', description: '此批次已不可再編輯' });
                refreshActiveBatch();
              });
            }}
            onArchive={() => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              archiveBatch(db, activeBatch.id, uid).then(() => {
                toast({ title: '已封存' });
                refreshActiveBatch();
                reloadBatches();
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
