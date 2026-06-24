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
  computeContentFingerprint,
  findDuplicateBatches,
  type ColumnMapping,
  type DuplicateMatch,
} from '@/services/menuImportService';
import {
  evaluateOperationalFinalizeEligibility,
  finalizeToOperationalMenu,
} from '@/services/menuFinalizationService';
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
  const [preParseWarningCount, setPreParseWarningCount] = useState(0);
  const [pendingMapping, setPendingMapping] = useState<ColumnMapping | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [pendingFingerprint, setPendingFingerprint] = useState<string | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<{ createdMenuIds: string[]; skippedExistingMenuIds: string[] } | null>(null);

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
    setFinalizeResult(null);
    setShowFinalizeConfirm(false);
    listItems(db, batch.id)
      .then(setItems)
      .catch((err) => toast({ title: '載入失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' }));
    setStep('review');
  }, []);

  const handleCsvParsed = useCallback(
    (text: string, headers: string[], sourceFileName: string, warningCount: number) => {
      setCsvText(text);
      setCsvHeaders(headers);
      setFileName(sourceFileName);
      setPreParseWarningCount(warningCount);
      setStep('mapping');
    },
    [],
  );

  const doCreateBatch = useCallback(
    async (mapping: ColumnMapping, fingerprint: string | undefined, duplicateOfBatchId: string | undefined) => {
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
            ...(fingerprint ? { contentFingerprint: fingerprint } : {}),
            ...(duplicateOfBatchId ? { duplicateOfBatchId } : {}),
          },
          uid,
        );
        const result = await parseAndCreateRowsItems(db, batchId, csvText, mapping, uid, preParseWarningCount);
        if (result.errors.length > 0) {
          toast({ title: '部分資料略過', description: result.errors.join('；') });
        }
        toast({
          title: '已建立暫存批次',
          description: `${result.serviceDayCount} 個供餐日、${result.itemCount} 項菜色、略過 ${result.skippedRowCount} 列、${result.warningCount} 項警告`,
        });
        reloadBatches();
        setStep('list');
        setDuplicateMatches([]);
        setPendingMapping(null);
        setPendingFingerprint(undefined);
      } catch (err) {
        toast({ title: '建立失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' });
      }
    },
    [fileName, organizationName, yearMonth, mealProgram, servingBaseline, csvText, preParseWarningCount, reloadBatches],
  );

  const handleCreateBatch = useCallback(
    async (mapping: ColumnMapping) => {
      const fingerprint = await computeContentFingerprint(yearMonth, csvHeaders, csvText);
      const matches = findDuplicateBatches(batches, {
        sourceFileName: fileName || '貼上內容',
        organizationName,
        yearMonth,
        mealProgram,
        contentFingerprint: fingerprint,
      });
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        setPendingMapping(mapping);
        setPendingFingerprint(fingerprint);
        return;
      }
      await doCreateBatch(mapping, fingerprint, undefined);
    },
    [batches, csvHeaders, csvText, fileName, organizationName, yearMonth, mealProgram, doCreateBatch],
  );

  const confirmDuplicateAndCreate = useCallback(() => {
    if (!pendingMapping) return;
    const strongestMatch = duplicateMatches[0];
    doCreateBatch(pendingMapping, pendingFingerprint, strongestMatch?.batch.id);
  }, [pendingMapping, pendingFingerprint, duplicateMatches, doCreateBatch]);

  const cancelDuplicateImport = useCallback(() => {
    setDuplicateMatches([]);
    setPendingMapping(null);
    setPendingFingerprint(undefined);
  }, []);

  const refreshActiveBatch = useCallback(() => {
    if (!activeBatch) return;
    listBatches(db).then((all) => {
      const updated = all.find((b) => b.id === activeBatch.id);
      if (updated) setActiveBatch(updated);
    });
    listItems(db, activeBatch.id).then(setItems);
  }, [activeBatch]);

  const handleFinalizeToOperationalMenu = useCallback(async () => {
    if (!activeBatch) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setFinalizing(true);
    try {
      const result = await finalizeToOperationalMenu(db, activeBatch.id, uid);
      setFinalizeResult(result);
      setShowFinalizeConfirm(false);
      toast({ title: '已轉為正式營運菜單', description: `新增 ${result.createdMenuIds.length} 筆菜單` });
      refreshActiveBatch();
    } catch (err) {
      toast({ title: '轉換失敗', description: err instanceof Error ? err.message : '未知錯誤', variant: 'destructive' });
    } finally {
      setFinalizing(false);
    }
  }, [activeBatch, refreshActiveBatch]);

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
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              顯示已封存批次
            </label>
            <Button type="button" size="sm" onClick={() => setStep('upload')}>新增匯入批次</Button>
          </div>
          <MenuImportBatchList batches={batches} onSelect={openBatch} showArchived={showArchived} />
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
          <CsvUploadStep onParsed={handleCsvParsed} />
          <div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStep('list')}>取消</Button>
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-4">
          {duplicateMatches.length === 0 && (
            <>
              <ColumnMappingForm headers={csvHeaders} onSubmit={handleCreateBatch} />
              <Button type="button" size="sm" variant="ghost" onClick={() => setStep('upload')}>上一步</Button>
            </>
          )}

          {duplicateMatches.length > 0 && (
            <div className="rounded-md border border-amber-400 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-medium text-amber-800">偵測到可能重複匯入</p>
              <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1">
                {duplicateMatches.map((m) => (
                  <li key={m.batch.id}>
                    {m.level === 'contentFingerprint' && '內容完全相同'}
                    {m.level === 'filenameAndMonth' && '相同檔名與年月'}
                    {m.level === 'organizationAndMonth' && '相同機構與年月'}
                    {' — '}
                    {m.batch.sourceFileName}（{m.batch.yearMonth} {m.batch.mealProgram}，{m.batch.importStatus}，{m.batch.itemCount} 項菜色）
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 justify-end">
                <Button type="button" size="sm" variant="ghost" onClick={cancelDuplicateImport}>取消匯入</Button>
                <Button type="button" size="sm" onClick={confirmDuplicateAndCreate}>仍要繼續匯入</Button>
              </div>
            </div>
          )}
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

          {activeBatch.importStatus === 'finalized' && !activeBatch.operationalFinalizedAt && (
            <div className="rounded-md border p-4 space-y-3">
              <p className="text-sm font-medium">轉為正式營運菜單</p>
              {(() => {
                const eligibility = evaluateOperationalFinalizeEligibility(activeBatch, items);
                if (!showFinalizeConfirm) {
                  return (
                    <div className="space-y-2">
                      {!eligibility.eligible && (
                        <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1">
                          {eligibility.blockedReasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      )}
                      <Button type="button" size="sm" disabled={!eligibility.eligible} onClick={() => setShowFinalizeConfirm(true)}>
                        轉為正式營運菜單
                      </Button>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      將把 {eligibility.statusCounts.mapped} 筆已比對成功的項目轉換為正式營運菜單，此操作無法復原。
                    </p>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowFinalizeConfirm(false)} disabled={finalizing}>取消</Button>
                      <Button type="button" size="sm" onClick={handleFinalizeToOperationalMenu} disabled={finalizing}>
                        {finalizing ? '轉換中...' : '確認轉換'}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeBatch.operationalFinalizedAt && (
            <div className="rounded-md border border-emerald-400 bg-emerald-50 p-4 space-y-2">
              <p className="text-sm font-medium text-emerald-800">已轉為正式營運菜單</p>
              {finalizeResult && (
                <ul className="text-xs text-emerald-700 list-disc pl-4 space-y-1">
                  {finalizeResult.createdMenuIds.map((id) => (
                    <li key={id}>
                      <a className="underline" href="/recipe-menus">{id}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
