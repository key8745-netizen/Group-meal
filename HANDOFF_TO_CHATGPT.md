# 程式碼驗證交接文件（完整版）
> 角色說明：Gemini = 大腦（定義 Spec）／Claude = 前端工程師（實作）／ChatGPT = 驗證者
> 本文件包含所有必要的原始碼，可直接進行驗證，無需存取 repo。

---

## 一、Gemini 的原始 Spec（逐字）

```
讀取 intelligenceAgent.ts：提取其中關於「預測結果」的輸出格式。

建立 Dashboard 元件原型：
在 PlanPage.tsx 或新增一個 IntelligenceInsights.tsx 中，開發一個「AI 決策卡片」。
卡片應包含：AI 建議項目、原始預測數據 (Safety Stock vs. 預測消耗)、AI 的簡短決策依據。

即時互動性：
卡片底部直接放置「採用建議 (Apply)」按鈕，點擊後觸發 purchaseOrderService 將建議項目轉為 DRAFT 採購單。
```

---

## 二、系統背景

- **專案**：餐飲 ERP（Group-meal），Vite + React 18 + TypeScript + TailwindCSS + shadcn/ui
- **資料庫**：Firebase Firestore，Named DB = `group-meal`（非 default DB）
- **單位換算**：所有庫存內部以 **kg** 儲存，1 台斤 = 0.6 kg

---

## 三、完整原始碼

### 3-1 `src/utils/unitConverter.ts`（單位換算工具）

```typescript
const KG_PER_TAIJIN   = 0.6;
const TAIJIN_PER_KG   = 1 / KG_PER_TAIJIN; // ≈ 1.66667
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Convert kilograms to 台斤 */
export function toTaijin(kg: number): number {
  return round2(kg * TAIJIN_PER_KG);
}

/** Convert 台斤 to kilograms */
export function toKg(taijin: number): number {
  return round2(taijin * KG_PER_TAIJIN);
}
```

---

### 3-2 `src/services/types.ts`（相關型別節錄）

```typescript
// ─── BOM & Menu ───────────────────────────────────────────────────────────
export interface BOMItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: 'kg' | 'g' | '台斤' | 'L' | 'piece';
  wasteFactor: number;
}

export interface Menu {
  id: string;
  name: string;
  category: string;
  servingSize: number;
  unitPrice: number;
  ingredients: BOMItem[];
}

// ─── Inventory ───────────────────────────────────────────────────────────
export interface InventoryDoc {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;  // Always in kg
  unit: string;
  lastUpdated: Timestamp;
}

export type TransactionType = 'restock' | 'deduct' | 'adjustment';

export interface InventoryTransaction {
  type: TransactionType;
  quantity: number;       // Negative for deduct
  referenceId: string;
  reason: string;
  performedBy: string;
  timestamp: Timestamp;
}

// ─── Purchase (purchase suggestion, not purchase order) ───────────────
export interface PurchaseLineItem {
  ingredientId:      string;
  ingredientName:    string;
  currentStockKg:    number;   // 現有庫存
  safetyLevelKg:     number;   // 安全庫存下限 (minStockLevel)
  orderDemandKg:     number;   // 訂單 BOM 展算需求
  suggestedQtyKg:    number;   // max(0, safety + demand − current)
  unitCost:          number;
  estimatedCost:     number;
  primarySupplierId: string | null;
  supplierIds:       string[];
}

export interface PurchaseDraft {
  status:             'draft';
  relatedOrderIds:    string[];
  generatedAt:        Timestamp;
  items:              PurchaseLineItem[];
  supplierGroups:     SupplierGroup[];
  totalEstimatedCost: number;
  version?:           number;
}
```

---

### 3-3 `src/services/intelligenceAgent.ts`（完整）

```typescript
import {
  collection, doc, getDoc, getDocs, type Firestore,
} from 'firebase/firestore';
import type { Menu } from './types';
import { getPeriodPerformance } from './performanceService';
import { configService } from './configService';

// ─── Public types ─────────────────────────────────────────────────────────────
export type InsightType     = 'ALERT' | 'OPTIMIZATION' | 'DATA_WARNING';
export type InsightPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Insight {
  type:        InsightType;
  message:     string;
  priority:    InsightPriority;
  generatedAt: Date;
}

export interface AnalysisPeriod {
  startDate: Date;
  endDate:   Date;
}

export const THRESHOLDS = {
  lowMargin:        0.20,
  criticalMargin:   0.10,
  highWasteFactor:  0.30,
} as const;

const PRIORITY_RANK: Record<InsightPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function byPriority(a: Insight, b: Insight): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

function insight(type: InsightType, message: string, priority: InsightPriority): Insight {
  return { type, message, priority, generatedAt: new Date() };
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

// ── analyzePerformance ───────────────────────────────────────────────────────
export async function analyzePerformance(
  db: Firestore,
  period: AnalysisPeriod,
  tenantId?: string,
): Promise<Insight[]> {
  const insights: Insight[] = [];

  const [result, settings] = await Promise.all([
    getPeriodPerformance(db, period.startDate, period.endDate),
    tenantId ? configService.getSettings(tenantId) : Promise.resolve(null),
  ]);

  const lowMargin = settings?.profitMarginThreshold ?? THRESHOLDS.lowMargin;
  const criticalMargin = lowMargin / 2;

  if (result.hasIncompleteData) {
    const names = result.missingIngredientNames.length > 0
      ? `（${result.missingIngredientNames.join('、')}）` : '';
    insights.push(insight(
      'DATA_WARNING',
      `成本資料不全：以下食材缺少進貨單價，毛利數據僅供參考${names}。請至食材管理頁面補齊單價。`,
      'MEDIUM',
    ));
  }

  if (result.orderCount === 0) return insights;

  if (result.profitMargin < lowMargin) {
    const isCritical = result.profitMargin < criticalMargin;
    insights.push(insight(
      'ALERT',
      `整體毛利率偏低：${pct(result.profitMargin)}，低於警示門檻 ${pct(lowMargin)}。` +
      `（期間營收 NT$${result.totalRevenue.toLocaleString('zh-TW')}，` +
      `食材成本 NT$${result.totalCost.toLocaleString('zh-TW')}）`,
      isCritical ? 'HIGH' : 'MEDIUM',
    ));
  }

  return insights;
}

// ── suggestOptimization ──────────────────────────────────────────────────────
export async function suggestOptimization(
  db: Firestore,
  menuId: string,
  tenantId?: string,
): Promise<Insight[]> {
  const insights: Insight[] = [];

  const [menuSnap, settings] = await Promise.all([
    getDoc(doc(db, 'menus', menuId)),
    tenantId ? configService.getSettings(tenantId) : Promise.resolve(null),
  ]);

  if (!menuSnap.exists()) return insights;

  const menu = { id: menuSnap.id, ...menuSnap.data() } as Menu;
  const wasteThreshold = settings?.wasteFactorWarning ?? THRESHOLDS.highWasteFactor;

  for (const bom of menu.ingredients) {
    if (bom.wasteFactor > wasteThreshold) {
      insights.push(insight(
        'OPTIMIZATION',
        `【${menu.name}】${bom.ingredientName} 的損耗率為 ${pct(bom.wasteFactor)}，` +
        `超過建議上限 ${pct(wasteThreshold)}。建議檢視備料流程或調整食材規格，可降低每份成本。`,
        bom.wasteFactor >= 0.5 ? 'HIGH' : 'MEDIUM',
      ));
    }
  }

  return insights;
}

// ── runDailyAnalysis（主入口）────────────────────────────────────────────────
export async function runDailyAnalysis(
  db: Firestore,
  tenantId?: string,
): Promise<Insight[]> {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0,  0,  0,   0);
  const endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  const period: AnalysisPeriod = { startDate, endDate };

  const [performanceInsights, menuSnaps] = await Promise.all([
    analyzePerformance(db, period, tenantId),
    getDocs(collection(db, 'menus')),
  ]);

  const menuIds = menuSnaps.docs.map((d) => d.id);
  const optimizationInsights = (
    await Promise.all(menuIds.map((id) => suggestOptimization(db, id, tenantId)))
  ).flat();

  return [...performanceInsights, ...optimizationInsights].sort(byPriority);
}
```

---

### 3-4 `src/services/inventoryService.ts`（Firestore Transaction 實作）

```typescript
import {
  collection, doc, runTransaction, serverTimestamp, type Firestore,
} from 'firebase/firestore';
import type { InventoryDoc, InventoryTransaction, RequirementItem } from './types';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class InsufficientStockError extends Error {
  constructor(public readonly shortages: string[]) {
    super(`缺貨項目：\n${shortages.join('\n')}`);
    this.name = 'InsufficientStockError';
  }
}

// ── deductStock（原子扣庫）────────────────────────────────────────────────────
export async function deductStock(
  db: Firestore,
  requirements: Map<string, RequirementItem>,
  referenceId: string,
  performedBy: string,
): Promise<void> {
  if (requirements.size === 0) return;

  const ingredientIds = Array.from(requirements.keys());
  const inventoryRefs = ingredientIds.map((id) => doc(db, 'inventory', id));
  const txRecordRefs  = ingredientIds.map((id) =>
    doc(collection(db, 'inventory', id, 'transactions')),
  );

  await runTransaction(db, async (t) => {
    // 1. Read all
    const snaps = await Promise.all(inventoryRefs.map((ref) => t.get(ref)));

    // 2. Validate (collect ALL shortages, not just first)
    const shortages: string[] = [];
    snaps.forEach((snap, i) => {
      const id  = ingredientIds[i];
      const req = requirements.get(id)!;
      if (!snap.exists()) {
        shortages.push(`${req.ingredientName}: 庫存資料不存在`);
        return;
      }
      const { currentStock } = snap.data() as InventoryDoc;
      if (currentStock < req.totalQuantityKg) {
        shortages.push(
          `${req.ingredientName}: 現有 ${currentStock.toFixed(3)} kg，需求 ${req.totalQuantityKg.toFixed(3)} kg`,
        );
      }
    });
    if (shortages.length > 0) throw new InsufficientStockError(shortages);

    // 3 & 4. Write deductions + audit records atomically
    snaps.forEach((snap, i) => {
      const id  = ingredientIds[i];
      const req = requirements.get(id)!;
      const { currentStock } = snap.data() as InventoryDoc;
      t.update(inventoryRefs[i], {
        currentStock: r3(currentStock - req.totalQuantityKg),
        lastUpdated: serverTimestamp(),
      });
      t.set(txRecordRefs[i], {
        type: 'deduct',
        quantity: r3(-req.totalQuantityKg),
        referenceId,
        reason: '生產領料',
        performedBy,
        timestamp: serverTimestamp(),
      });
    });
  });
}

// ── restockIngredient（採購入庫）──────────────────────────────────────────────
export async function restockIngredient(
  db: Firestore,
  ingredientId: string,
  ingredientName: string,
  quantityKg: number,
  referenceId: string,
  performedBy: string,
): Promise<void> {
  const inventoryRef = doc(db, 'inventory', ingredientId);
  const txRecordRef  = doc(collection(db, 'inventory', ingredientId, 'transactions'));

  await runTransaction(db, async (t) => {
    const snap = await t.get(inventoryRef);
    const currentStock = snap.exists() ? (snap.data() as InventoryDoc).currentStock : 0;
    const payload = {
      ingredientId, ingredientName,
      currentStock: r3(currentStock + quantityKg),
      unit: 'kg',
      lastUpdated: serverTimestamp(),
    };
    snap.exists() ? t.update(inventoryRef, payload) : t.set(inventoryRef, payload);
    t.set(txRecordRef, {
      type: 'restock',
      quantity: r3(quantityKg),
      referenceId,
      reason: '採購入庫',
      performedBy,
      timestamp: serverTimestamp(),
    } satisfies Omit<InventoryTransaction, 'timestamp'> & {
      timestamp: ReturnType<typeof serverTimestamp>;
    });
  });
}
```

---

### 3-5 `src/services/purchaseOrderService.ts`（完整，含新增的 createDraftOrder）

```typescript
import {
  addDoc, collection, doc, getDoc, serverTimestamp,
  Timestamp, updateDoc, type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import { restockIngredient } from './inventoryService';

// ─── Types ─────────────────────────────────────────────────────────────────────
export type PurchaseOrderStatus = 'DRAFT' | 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderItem {
  ingredientId:   string;
  name:           string;
  shortageKg:     number;
  shortageTaijin: number;
}

export interface PurchaseOrder {
  id?:         string;
  status:      PurchaseOrderStatus;
  items:       PurchaseOrderItem[];
  createdAt:   Timestamp;
  receivedAt?: Timestamp;
  notes?:      string;
}

function currentUser(): string {
  return auth.currentUser?.email ?? auth.currentUser?.uid ?? 'system';
}

async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const snap = await getDoc(doc(db, 'purchaseOrders', id));
  if (!snap.exists()) throw new Error(`purchaseOrderService: order "${id}" not found`);
  return { id: snap.id, ...snap.data() } as PurchaseOrder;
}

export const purchaseOrderService = {

  // ── createOrder（PENDING，由 ProductionPlanner 呼叫）──────────────────────
  async createOrder(shortageItems: PurchaseOrderItem[]): Promise<string> {
    const items = shortageItems.filter((i) => i.shortageKg > 0);
    if (items.length === 0) throw new Error('purchaseOrderService: no shortage items to order');
    const ref = await addDoc(collection(db, 'purchaseOrders'), {
      status: 'PENDING', items, createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  // ── createDraftOrder（DRAFT，由 IntelligenceInsights AI 建議呼叫）────────── ← 新增
  async createDraftOrder(
    shortageItems: PurchaseOrderItem[],
    notes = 'AI 智能建議自動產生',
  ): Promise<string> {
    const items = shortageItems.filter((i) => i.shortageKg > 0);
    if (items.length === 0) throw new Error('purchaseOrderService: no shortage items to order');
    const ref = await addDoc(collection(db, 'purchaseOrders'), {
      status: 'DRAFT', items, notes, createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  // ── completeOrder（PENDING → RECEIVED，觸發 restockIngredient）────────────
  async completeOrder(orderId: string): Promise<void> {
    const order = await getPurchaseOrder(orderId);
    if (order.status !== 'PENDING') {
      throw new Error(`purchaseOrderService: order "${orderId}" is already ${order.status}`);
    }
    const performedBy = currentUser();
    for (const item of order.items) {
      await restockIngredient(
        db as Firestore, item.ingredientId, item.name,
        item.shortageKg, orderId, performedBy,
      );
    }
    await updateDoc(doc(db, 'purchaseOrders', orderId), {
      status: 'RECEIVED', receivedAt: serverTimestamp(),
    });
  },

  // ── cancelOrder（PENDING → CANCELLED）────────────────────────────────────
  async cancelOrder(orderId: string): Promise<void> {
    const order = await getPurchaseOrder(orderId);
    if (order.status !== 'PENDING') {
      throw new Error(`purchaseOrderService: cannot cancel — order "${orderId}" is ${order.status}`);
    }
    await updateDoc(doc(db, 'purchaseOrders', orderId), { status: 'CANCELLED' });
  },
};
```

---

### 3-6 `src/components/IntelligenceInsights.tsx`（新增元件，完整）

```tsx
import { useEffect, useState } from 'react';
import { AlertTriangle, Brain, Lightbulb, Loader2, ShoppingCart, TrendingDown } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  runDailyAnalysis, type Insight, type InsightType,
} from '@/services/intelligenceAgent';
import { generatePurchaseSuggestion } from '@/services/purchaseService';
import { purchaseOrderService, type PurchaseOrderItem } from '@/services/purchaseOrderService';
import type { PurchaseDraft } from '@/services/types';
import { toTaijin } from '@/utils/unitConverter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

function InsightIcon({ type }: { type: InsightType }) {
  switch (type) {
    case 'ALERT':        return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'OPTIMIZATION': return <Lightbulb className="h-4 w-4 text-blue-500" />;
    case 'DATA_WARNING': return <TrendingDown className="h-4 w-4 text-yellow-500" />;
  }
}

const TYPE_LABEL: Record<InsightType, string> = {
  ALERT: '警示', OPTIMIZATION: '優化建議', DATA_WARNING: '資料警告',
};
const TYPE_BADGE: Record<InsightType, 'destructive' | 'secondary' | 'outline'> = {
  ALERT: 'destructive', OPTIMIZATION: 'secondary', DATA_WARNING: 'outline',
};
const PRIORITY_LABEL: Record<Insight['priority'], string> = {
  HIGH: '高優先', MEDIUM: '中優先', LOW: '低優先',
};
const PRIORITY_BADGE: Record<Insight['priority'], 'destructive' | 'secondary' | 'outline'> = {
  HIGH: 'destructive', MEDIUM: 'secondary', LOW: 'outline',
};
const PRIORITY_BORDER: Record<Insight['priority'], string> = {
  HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#9ca3af',
};

const fmtKg = (n: number) => `${n.toFixed(2)} kg`;
const fmtCurrency = (n: number) =>
  `NT$ ${n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

export default function IntelligenceInsights() {
  const [loading, setLoading]       = useState(true);
  const [insights, setInsights]     = useState<Insight[]>([]);
  const [suggestion, setSuggestion] = useState<PurchaseDraft | null>(null);
  const [applying, setApplying]     = useState(false);
  const [appliedId, setAppliedId]   = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [insightData, suggestionData] = await Promise.all([
          runDailyAnalysis(db),
          generatePurchaseSuggestion(db),
        ]);
        setInsights(insightData);
        setSuggestion(suggestionData);
      } catch (err) {
        toast({ title: '載入失敗', description: String(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleApply() {
    if (!suggestion || suggestion.items.length === 0) return;
    setApplying(true);
    try {
      const items: PurchaseOrderItem[] = suggestion.items.map((item) => ({
        ingredientId:   item.ingredientId,
        name:           item.ingredientName,
        shortageKg:     item.suggestedQtyKg,
        shortageTaijin: toTaijin(item.suggestedQtyKg),
      }));
      const orderId = await purchaseOrderService.createDraftOrder(items);
      setAppliedId(orderId);
      toast({
        title: 'DRAFT 採購單已建立',
        description: '可至採購管理頁面確認並轉為正式採購單。',
      });
    } catch (err) {
      toast({ title: '建立失敗', description: String(err), variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Section 1: AI 洞察卡片 */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">AI 洞察</h2>
          <span className="text-xs text-muted-foreground">（昨日分析結果）</span>
        </div>
        {insights.length === 0 ? (
          <Alert><AlertDescription>昨日無異常洞察，系統運作正常。</AlertDescription></Alert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.map((ins, idx) => (
              <Card key={idx} className="border-l-4"
                style={{ borderLeftColor: PRIORITY_BORDER[ins.priority] }}>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <InsightIcon type={ins.type} />
                    <Badge variant={TYPE_BADGE[ins.type]}>{TYPE_LABEL[ins.type]}</Badge>
                    <Badge variant={PRIORITY_BADGE[ins.priority]}>{PRIORITY_LABEL[ins.priority]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm leading-relaxed">{ins.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ins.generatedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: 採購建議明細 + Apply 按鈕 */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">採購建議明細</h2>
          {suggestion && suggestion.items.length > 0 && (
            <span className="ml-auto text-sm font-medium text-muted-foreground">
              預估總額：{fmtCurrency(suggestion.totalEstimatedCost)}
            </span>
          )}
        </div>
        {!suggestion || suggestion.items.length === 0 ? (
          <Alert><AlertDescription>目前庫存充足，無需採購建議。</AlertDescription></Alert>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材</TableHead>
                    <TableHead className="text-right">現有庫存</TableHead>
                    <TableHead className="text-right">安全庫存</TableHead>
                    <TableHead className="text-right">訂單需求</TableHead>
                    <TableHead className="text-right">建議採購量</TableHead>
                    <TableHead className="text-right">預估成本</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestion.items.map((item) => (
                    <TableRow key={item.ingredientId}>
                      <TableCell className="font-medium">{item.ingredientName}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtKg(item.currentStockKg)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtKg(item.safetyLevelKg)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtKg(item.orderDemandKg)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{fmtKg(item.suggestedQtyKg)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({toTaijin(item.suggestedQtyKg)} 台斤)
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtCurrency(item.estimatedCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t px-4 py-3">
                {appliedId ? (
                  <p className="text-sm text-green-600">
                    ✅ DRAFT 採購單已建立（#{appliedId.slice(0, 8)}…）
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    共 {suggestion.items.length} 項食材缺口，點擊採用後自動建立 DRAFT 採購單
                  </p>
                )}
                <Button onClick={handleApply} disabled={applying || !!appliedId}>
                  {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {appliedId ? '已採用' : '採用建議'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
```

### 3-7 `src/pages/PlanPage.tsx`（修改後）

```tsx
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
```

---

## 四、Firestore 集合結構

| 集合 | Doc ID | 相關欄位 |
|---|---|---|
| `purchaseOrders` | auto | `status: 'DRAFT'\|'PENDING'\|'RECEIVED'\|'CANCELLED'`, `items: PurchaseOrderItem[]`, `notes?: string`, `createdAt: Timestamp` |
| `inventory` | ingredientId | `currentStock: number`（kg）, `lastUpdated: Timestamp` |
| `inventory/{id}/transactions` | auto | `type: 'restock'\|'deduct'\|'adjustment'`, `quantity: number`, `referenceId`, `reason`, `performedBy`, `timestamp` |
| `orders` | auto | `status: 'confirmed'\|'in-production'`（採購建議來源）|
| `ingredients` | slug | `minStockLevel: number`, `unitCost: number`, `wasteFactor?: number` |
| `menus` | auto | `ingredients: BOMItem[]`（含 wasteFactor）|

**Named Database**：`group-meal`（`getFirestore(app, 'group-meal')`，非 Firebase default database）

---

## 五、驗收清單（請 ChatGPT 逐項勾選）

### A. 邏輯正確性
- [ ] `handleApply` 的型別對應：`PurchaseLineItem.suggestedQtyKg` → `PurchaseOrderItem.shortageKg`，是否正確？
- [ ] `toTaijin(suggestedQtyKg)` 換算：`suggestedQtyKg / 0.6`（四捨五入 2 位），結果是否正確？
- [ ] `createDraftOrder` 寫入 `status: 'DRAFT'`，是否符合 `PurchaseOrderStatus` 型別？
- [ ] Apply 後 `appliedId` 鎖定按鈕，防止重複送出，邏輯是否正確？

### B. 邊界條件
- [ ] `suggestion.items.length === 0` → 顯示「庫存充足」Alert，不 render Apply 按鈕？
- [ ] `insights.length === 0` → 顯示「無異常」Alert？
- [ ] `Promise.all` 任一失敗 → toast 顯示錯誤，且 `loading` 確定變為 `false`（finally 保證）？
- [ ] `createDraftOrder` 傳入空陣列 → 丟出 Error，不寫 Firestore？

### C. 型別安全
- [ ] `InsightIcon` switch 是否窮舉 `InsightType` 三個值（ALERT / OPTIMIZATION / DATA_WARNING）？
- [ ] 五個 Record lookup tables（TYPE_LABEL, TYPE_BADGE, PRIORITY_LABEL, PRIORITY_BADGE, PRIORITY_BORDER）的鍵是否與對應型別完全對應，沒有遺漏？

### D. Firestore 寫入安全
- [ ] `createDraftOrder` 有 `filter((i) => i.shortageKg > 0)` 防禦性過濾，是否足夠？
- [ ] `createDraftOrder` 寫入 Firestore 的欄位（status / items / notes / createdAt）是否符合 `PurchaseOrder` interface？
- [ ] `db` 來自 `getFirestore(app, 'group-meal')`，是否與 `intelligenceAgent.ts` 及 `purchaseService.ts` 期望的 `Firestore` 型別相容？

### E. UX 狀態管理
- [ ] `applying === true` 時 Button 顯示 Loader2 spinner？
- [ ] Apply 成功後 Button 文字變「已採用」並 disabled？

---

## 六、Claude 自述的已知限制

1. **兩個資料源不互相連結**：AI 洞察（毛利/損耗）與採購建議（庫存缺口）是分開的；「採用建議」採用的是庫存缺口資料，與 Insight 卡片無直接關聯。

2. **Apply 只能執行一次**：`appliedId` 鎖定後需重新整理頁面才能再次建立。

3. **`runDailyAnalysis` 分析昨日資料**：若昨日無訂單（`orderCount === 0`），Insight 卡片不會出現任何警示（function 內部 early return）。

4. **`Promise.all` 全或無**：若 `runDailyAnalysis` 或 `generatePurchaseSuggestion` 任一失敗，整個頁面進入錯誤狀態，無法單獨顯示其中一個成功的資料。
