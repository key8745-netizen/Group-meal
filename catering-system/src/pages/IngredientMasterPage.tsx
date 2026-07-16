/**
 * IngredientMasterPage — 食材主檔管理 (Feature 010)
 * CRUD (create / edit / activate-deactivate, no delete) for ingredient
 * master data on the existing `/ingredients/{id}` collection.
 */

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Plus, Package, Eye, EyeOff, Upload } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster, InventoryDoc, MarketPriceSnapshot } from '@/services/types';
import { fetchRecentMarketSnapshots } from '@/services/marketPriceService';
import { buildPriceHistory } from '@/services/marketPriceHistoryService';
import {
  listIngredients,
  createIngredient,
  updateIngredient,
  setIngredientActive,
  type IngredientMasterInput,
} from '@/services/ingredientMasterService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { IngredientMasterList } from '@/components/ingredients/IngredientMasterList';
import { IngredientMasterForm } from '@/components/ingredients/IngredientMasterForm';
import { SeedImportDialog } from '@/components/ingredients/SeedImportDialog';

type EditingState =
  | { mode: 'create' }
  | { mode: 'edit'; ingredient: IngredientMaster }
  | null;

function toFormValues(ingredient: IngredientMaster): IngredientMasterInput {
  // Legacy documents (pre-Feature-010) can be missing schema fields entirely.
  // Feeding `undefined` into the controlled form makes fields impossible to
  // change (e.g. the baseUnit select displays 'g' but never fires onChange),
  // so fall back to sensible defaults the user can then confirm and save.
  const validBaseUnit = ingredient.baseUnit === 'g' || ingredient.baseUnit === 'ml' || ingredient.baseUnit === 'pcs';
  return {
    name: ingredient.name ?? '',
    category: ingredient.category ?? '',
    baseUnit: validBaseUnit ? ingredient.baseUnit : 'g',
    purchaseUnit: ingredient.purchaseUnit || 'kg',
    conversionFactorToBaseUnit:
      typeof ingredient.conversionFactorToBaseUnit === 'number' && ingredient.conversionFactorToBaseUnit > 0
        ? ingredient.conversionFactorToBaseUnit
        : 1000,
    defaultPrice: typeof ingredient.defaultPrice === 'number' && Number.isFinite(ingredient.defaultPrice)
      ? ingredient.defaultPrice
      : 0,
    defaultPriceUnit: ingredient.defaultPriceUnit || 'kg',
    supplierId: ingredient.supplierId ?? null,
    notes: ingredient.notes ?? '',
    marketCropName: ingredient.marketCropName ?? '',
    minStockLevel: typeof ingredient.minStockLevel === 'number' && ingredient.minStockLevel >= 0
      ? ingredient.minStockLevel
      : 0,
    // Feature 071: 保鮮參數（未設定給預設，讓表單可直接編輯儲存）。
    isPerishable: ingredient.isPerishable !== false,
    defaultStorageType: ingredient.defaultStorageType ?? 'chilled',
    shelfLifeDaysChilled: ingredient.shelfLifeDaysChilled,
    shelfLifeDaysFrozen: ingredient.shelfLifeDaysFrozen,
    shelfLifeDaysAmbient: ingredient.shelfLifeDaysAmbient,
    warnThresholdDays: typeof ingredient.warnThresholdDays === 'number' ? ingredient.warnThresholdDays : 2,
    criticalThresholdDays: typeof ingredient.criticalThresholdDays === 'number' ? ingredient.criticalThresholdDays : 1,
    // Feature 079: 加工延壽預設良率（未設定則留空）。
    processedYieldRatio: typeof ingredient.processedYieldRatio === 'number' ? ingredient.processedYieldRatio : undefined,
  };
}

export default function IngredientMasterPage() {
  const [ingredients, setIngredients] = useState<IngredientMaster[]>([]);
  const [stockKgById, setStockKgById] = useState<Map<string, number>>(new Map());
  const [marketSnapshots, setMarketSnapshots] = useState<MarketPriceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showSeedImport, setShowSeedImport] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      // Feature 060: 一併載入目前庫存（kg），讓主檔清單能對照安全庫存。
      // Feature 063: 一併載入近期市價快照，供編輯時顯示市價走勢小圖。
      const [list, inventorySnap, snapshots] = await Promise.all([
        listIngredients(db, { includeInactive: true }),
        getDocs(collection(db, 'inventory')),
        fetchRecentMarketSnapshots(db, 14).catch(() => [] as MarketPriceSnapshot[]),
      ]);
      const stockMap = new Map<string, number>();
      inventorySnap.docs.forEach((d) => {
        const inv = d.data() as InventoryDoc;
        if (typeof inv.currentStock === 'number') stockMap.set(d.id, inv.currentStock);
      });
      setIngredients(list);
      setStockKgById(stockMap);
      setMarketSnapshots(snapshots);
    } catch {
      toast({ variant: 'destructive', title: '無法載入食材資料' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSave(input: IngredientMasterInput) {
    const uid = auth.currentUser?.uid ?? '';
    try {
      if (editing?.mode === 'edit') {
        await updateIngredient(db, editing.ingredient.id, input, uid);
        toast({ title: '儲存成功', description: `「${input.name}」已更新。` });
      } else {
        await createIngredient(db, input, uid);
        toast({ title: '新增成功', description: `「${input.name}」已建立。` });
      }
      setEditing(null);
      await reload();
    } catch (err) {
      toast({ variant: 'destructive', title: '儲存失敗', description: err instanceof Error ? err.message : '' });
    }
  }

  async function handleToggleActive(ingredient: IngredientMaster) {
    const uid = auth.currentUser?.uid ?? '';
    const nextActive = !ingredient.isActive;
    try {
      await setIngredientActive(db, ingredient.id, nextActive, uid);
      toast({ title: nextActive ? '已啟用' : '已停用', description: `「${ingredient.name}」` });
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '操作失敗' });
    }
  }

  const filtered = ingredients
    .filter((i) => showInactive || i.isActive !== false)
    .filter((i) => !search.trim() || i.name.includes(search) || i.category?.includes(search));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">食材主檔管理</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              管理食材的基本資料、單位換算與預設價格。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowSeedImport(true)}
            className="gap-1.5"
          >
            <Upload size={14} /> 匯入常用食材範本
          </Button>
          <Button onClick={() => setEditing({ mode: 'create' })} className="gap-1.5">
            <Plus size={14} /> 新增食材
          </Button>
        </div>
      </div>

      {showSeedImport && (
        <SeedImportDialog
          existingIngredients={ingredients}
          onClose={() => setShowSeedImport(false)}
          onImported={reload}
        />
      )}

      {editing?.mode === 'create' && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <IngredientMasterForm
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          placeholder="搜尋食材名稱或分類…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowInactive((v) => !v)}
        >
          {showInactive ? <EyeOff size={13} /> : <Eye size={13} />}
          {showInactive ? '隱藏已停用' : '顯示已停用'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <>
          {editing?.mode === 'edit' && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <IngredientMasterForm
                initial={toFormValues(editing.ingredient)}
                currentStockKg={stockKgById.get(editing.ingredient.id)}
                priceHistory={buildPriceHistory(marketSnapshots, editing.ingredient.marketCropName)}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          <IngredientMasterList
            ingredients={filtered}
            stockKgById={stockKgById}
            onEdit={(ing) => setEditing({ mode: 'edit', ingredient: ing })}
            onToggleActive={handleToggleActive}
          />
        </>
      )}

      <Toaster />
    </div>
  );
}
