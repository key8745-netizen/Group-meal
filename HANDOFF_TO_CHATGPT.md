# 程式碼驗證交接文件
> 角色說明：Gemini = 大腦（定義 Spec）／Claude = 前端工程師（實作）／ChatGPT = 驗證者
> 本文件由 Claude 生成，交由 ChatGPT 做最終驗收。

---

## 一、任務背景（Spec）

**系統**：Group-meal 餐飲 ERP（Vite + React + TypeScript + Firebase Firestore）

**Gemini 下達的 Spec**：
1. 讀取 `intelligenceAgent.ts`，提取預測輸出格式
2. 建立 AI 決策卡片元件，包含：
   - AI 建議項目（Insight 卡片）
   - 原始預測數據（Safety Stock vs. 預測消耗）
   - AI 的簡短決策依據
3. 卡片底部「採用建議 (Apply)」按鈕 → 觸發 `purchaseOrderService` 建立 DRAFT 採購單

---

## 二、關鍵型別定義（上下文）

### `intelligenceAgent.ts` 輸出格式
```typescript
export type InsightType     = 'ALERT' | 'OPTIMIZATION' | 'DATA_WARNING';
export type InsightPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Insight {
  type:        InsightType;
  message:     string;      // 繁體中文，包含具體數值
  priority:    InsightPriority;
  generatedAt: Date;
}

// 入口函式
export async function runDailyAnalysis(db: Firestore, tenantId?: string): Promise<Insight[]>
```

### `purchaseService.ts` 輸出格式（採購建議）
```typescript
// PurchaseLineItem — 每個缺口食材的資料
interface PurchaseLineItem {
  ingredientId:      string;
  ingredientName:    string;
  currentStockKg:    number;   // 現有庫存
  safetyLevelKg:     number;   // 安全庫存下限
  orderDemandKg:     number;   // 訂單 BOM 展算需求
  suggestedQtyKg:    number;   // 建議採購量 = max(0, safety + demand − current)
  unitCost:          number;
  estimatedCost:     number;
}

// PurchaseDraft — generatePurchaseSuggestion() 的回傳值
interface PurchaseDraft {
  status:              'draft';
  items:               PurchaseLineItem[];
  supplierGroups:      SupplierGroup[];
  totalEstimatedCost:  number;
  relatedOrderIds:     string[];
  generatedAt:         Timestamp;
}
```

### `purchaseOrderService.ts` — 採購單操作
```typescript
// 傳入格式
interface PurchaseOrderItem {
  ingredientId:   string;
  name:           string;
  shortageKg:     number;
  shortageTaijin: number;   // 1 台斤 = 0.6 kg
}

// 狀態機
type PurchaseOrderStatus = 'DRAFT' | 'PENDING' | 'RECEIVED' | 'CANCELLED';
```

### 單位換算
```
1 台斤 = 0.6 kg
toTaijin(kg) = round2(kg / 0.6)
```

---

## 三、Claude 的實作（完整程式碼）

### 3-1 新增檔案：`src/components/IntelligenceInsights.tsx`

```tsx
import { useEffect, useState } from 'react';
import { AlertTriangle, Brain, Lightbulb, Loader2, ShoppingCart, TrendingDown } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  runDailyAnalysis,
  type Insight,
  type InsightType,
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
              <Card key={idx} className="border-l-4" style={{ borderLeftColor: PRIORITY_BORDER[ins.priority] }}>
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
                      <TableCell className="text-right text-muted-foreground">{fmtKg(item.currentStockKg)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtKg(item.safetyLevelKg)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtKg(item.orderDemandKg)}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{fmtKg(item.suggestedQtyKg)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({toTaijin(item.suggestedQtyKg)} 台斤)</span>
                      </TableCell>
                      <TableCell className="text-right">{fmtCurrency(item.estimatedCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t px-4 py-3">
                {appliedId ? (
                  <p className="text-sm text-green-600">✅ DRAFT 採購單已建立（#{appliedId.slice(0, 8)}…）</p>
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

### 3-2 修改：`src/services/purchaseOrderService.ts`（新增方法）

```typescript
// 在 purchaseOrderService 物件中新增：
async createDraftOrder(
  shortageItems: PurchaseOrderItem[],
  notes = 'AI 智能建議自動產生',
): Promise<string> {
  const items = shortageItems.filter((i) => i.shortageKg > 0);

  if (items.length === 0) {
    throw new Error('purchaseOrderService: no shortage items to order');
  }

  const ref = await addDoc(collection(db, 'purchaseOrders'), {
    status: 'DRAFT',
    items,
    notes,
    createdAt: serverTimestamp(),
  });

  return ref.id;
},
```

### 3-3 修改：`src/pages/PlanPage.tsx`

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

## 四、請 ChatGPT 驗證以下項目

### ✅ 驗收清單

**A. 邏輯正確性**
- [ ] `handleApply` 是否正確把 `PurchaseLineItem.suggestedQtyKg` 對應到 `PurchaseOrderItem.shortageKg`？
- [ ] `toTaijin(suggestedQtyKg)` 換算是否正確（1 台斤 = 0.6 kg，所以 1 kg ≈ 1.67 台斤）？
- [ ] `createDraftOrder` 寫入 Firestore 的 `status: 'DRAFT'` 是否符合 `PurchaseOrderStatus` 型別？
- [ ] Apply 後 `appliedId` 設為回傳的 doc ID，之後按鈕是否正確 disabled？

**B. 邊界條件**
- [ ] `suggestion.items.length === 0` 時是否顯示「庫存充足」提示，且不會 render Apply 按鈕？
- [ ] `insights.length === 0` 時是否顯示「無異常」提示？
- [ ] 資料載入失敗（Firebase 錯誤）時是否有 toast 錯誤訊息，且 `loading` 會變成 `false`？

**C. 型別安全**
- [ ] `InsightIcon` switch 是否窮舉 `InsightType` 的所有值（ALERT / OPTIMIZATION / DATA_WARNING）？
- [ ] `TYPE_LABEL`, `TYPE_BADGE`, `PRIORITY_LABEL`, `PRIORITY_BADGE`, `PRIORITY_BORDER` 的 Record 鍵是否與型別完全對應？

**D. 架構規範**
- [ ] `db` 來自 `@/lib/firebase`（`getFirestore(app, 'group-meal')`），是否與 `intelligenceAgent.ts` 和 `purchaseService.ts` 期望的 `Firestore` 型別相容？
- [ ] `createDraftOrder` 是否在現有的 `purchaseOrderService` 物件中（不是獨立 function），與其他方法一致？

**E. UX**
- [ ] Apply 按鈕在 `applying === true` 時是否顯示 Loader2 spinner？
- [ ] Apply 成功後按鈕是否變成「已採用」並 disabled，防止重複送出？

---

## 五、已知限制（Claude 自述）

1. **Insights 與採購建議是兩個獨立資料來源**：AI 洞察卡片（毛利率/損耗）和採購建議表格（庫存缺口）目前沒有直接連結。「採用建議」只採用採購缺口資料，不會只採用某一張洞察卡。

2. **Apply 只能執行一次**：採用後 `appliedId` 鎖定按鈕，若要再次建立需重新整理頁面。這是設計決策（防雙送），但 Gemini 可評估是否需要「撤銷 DRAFT」的反向操作。

3. **`runDailyAnalysis` 分析昨日資料**：若當日剛上線，昨日無訂單時所有 Insight 卡片不會出現（function 內部有 `if (result.orderCount === 0) return insights` 的 early return）。

4. **無錯誤邊界（Error Boundary）**：若 Firebase 呼叫中途失敗（例如 `runDailyAnalysis` 成功但 `generatePurchaseSuggestion` 失敗），`Promise.all` 會讓整個載入失敗，兩個區塊都不顯示。可考慮改為獨立 try-catch。

---

## 六、Firestore 集合結構（給 ChatGPT 的上下文）

| 集合 | Doc ID | 相關欄位 |
|---|---|---|
| `purchaseOrders` | auto | `status: 'DRAFT'\|'PENDING'\|'RECEIVED'\|'CANCELLED'`, `items: PurchaseOrderItem[]`, `notes: string`, `createdAt: Timestamp` |
| `orders` | auto | `status: 'confirmed'\|'in-production'`（採購建議計算來源）|
| `inventory` | ingredientId | `currentStock: number`（kg）|
| `ingredients` | slug | `minStockLevel`, `unitCost`, `wasteFactor` |

**Named Database**：`group-meal`（不是 Firebase default database）
