import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDocs, collection, Timestamp } from 'firebase/firestore';
import { PlusCircle, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Ingredient, Menu, OrderItem } from '@/services/types';
import { UnitConverter } from '@/services/unitConverter';
import { placeOrder } from '@/services/orderService';
import { InsufficientStockError } from '@/services/inventoryService';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// ─── Local types ──────────────────────────────────────────────────────────────

type Tab = 'menu' | 'custom';

interface MenuDraftItem {
  type: 'menu';
  menuId: string;
  menuName: string;
  servings: number;
  unitPrice: number;
  menu: Menu;
}

interface CustomDraftItem {
  type: 'custom';
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

type DraftItem = MenuDraftItem | CustomDraftItem;

interface RequirementRow {
  ingredientId: string;
  ingredientName: string;
  totalKg: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function computeRequirements(items: DraftItem[]): RequirementRow[] {
  const map = new Map<string, RequirementRow>();

  for (const item of items) {
    if (item.type === 'menu') {
      for (const bom of item.menu.ingredients) {
        if (bom.wasteFactor >= 1) continue;
        const adjustedQty = bom.quantity / (1 - bom.wasteFactor);
        const kgPerServing = UnitConverter.toKg(adjustedQty, bom.unit);
        const totalKg = r3(kgPerServing * item.servings);
        const row = map.get(bom.ingredientId);
        if (row) {
          row.totalKg = r3(row.totalKg + totalKg);
        } else {
          map.set(bom.ingredientId, {
            ingredientId: bom.ingredientId,
            ingredientName: bom.ingredientName,
            totalKg,
          });
        }
      }
    } else {
      const kgQty = (() => {
        try { return r3(UnitConverter.toKg(item.quantity, item.unit)); }
        catch { return r3(item.quantity); }
      })();
      const row = map.get(item.ingredientId);
      if (row) {
        row.totalKg = r3(row.totalKg + kgQty);
      } else {
        map.set(item.ingredientId, {
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientName,
          totalKg: kgQty,
        });
      }
    }
  }

  return Array.from(map.values());
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderEntry() {
  const { toast } = useToast();

  // ── Remote data
  const [menus, setMenus] = useState<Menu[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Tab & cart
  const [tab, setTab] = useState<Tab>('menu');
  const [items, setItems] = useState<DraftItem[]>([]);

  // ── Menu mode
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [servings, setServings] = useState(1);

  // ── Custom mode
  const [ingSearch, setIngSearch] = useState('');
  const [selectedIngId, setSelectedIngId] = useState('');
  const [customQty, setCustomQty] = useState(1);

  // ── Order header
  const [clientName, setClientName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load data
  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'menus')),
      getDocs(collection(db, 'ingredients')),
    ])
      .then(([menuSnaps, ingSnaps]) => {
        setMenus(menuSnaps.docs.map(d => ({ id: d.id, ...d.data() } as Menu)));
        setIngredients(ingSnaps.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
      })
      .catch(err =>
        toast({ variant: 'destructive', title: '載入失敗', description: err instanceof Error ? err.message : '' }),
      )
      .finally(() => setDataLoading(false));
  }, [toast]);

  // ── Derived state
  const requirements = useMemo(() => computeRequirements(items), [items]);

  const totalAmount = useMemo(
    () => r3(items.reduce((sum, item) =>
      item.type === 'menu'
        ? sum + item.unitPrice * item.servings
        : sum + item.unitCost * item.quantity,
      0)),
    [items],
  );

  const selectedMenu = useMemo(
    () => menus.find(m => m.id === selectedMenuId) ?? null,
    [menus, selectedMenuId],
  );

  const filteredIngredients = useMemo(() => {
    const q = ingSearch.trim().toLowerCase();
    return q ? ingredients.filter(i => i.name.toLowerCase().includes(q)) : [];
  }, [ingredients, ingSearch]);

  const selectedIngredient = useMemo(
    () => ingredients.find(i => i.id === selectedIngId) ?? null,
    [ingredients, selectedIngId],
  );

  // ── Handlers
  const addMenu = useCallback(() => {
    if (!selectedMenu) return;
    setItems(prev => {
      const idx = prev.findIndex(i => i.type === 'menu' && i.menuId === selectedMenu.id);
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx && item.type === 'menu'
            ? { ...item, servings: item.servings + servings }
            : item,
        );
      }
      return [...prev, {
        type: 'menu',
        menuId: selectedMenu.id,
        menuName: selectedMenu.name,
        servings,
        unitPrice: selectedMenu.unitPrice,
        menu: selectedMenu,
      } satisfies MenuDraftItem];
    });
    setServings(1);
  }, [selectedMenu, servings]);

  const addIngredient = useCallback(() => {
    if (!selectedIngredient || customQty <= 0) return;
    setItems(prev => {
      const idx = prev.findIndex(i => i.type === 'custom' && i.ingredientId === selectedIngredient.id);
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx && item.type === 'custom'
            ? { ...item, quantity: r3(item.quantity + customQty) }
            : item,
        );
      }
      return [...prev, {
        type: 'custom',
        ingredientId: selectedIngredient.id,
        ingredientName: selectedIngredient.name,
        quantity: customQty,
        unit: selectedIngredient.unit,
        unitCost: selectedIngredient.unitCost,
      } satisfies CustomDraftItem];
    });
    setCustomQty(1);
    setSelectedIngId('');
    setIngSearch('');
  }, [selectedIngredient, customQty]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!clientName.trim()) { toast({ variant: 'destructive', title: '請填寫客戶名稱' }); return; }
    if (!deliveryDate)       { toast({ variant: 'destructive', title: '請選擇交貨日期' }); return; }
    if (items.length === 0)  { toast({ variant: 'destructive', title: '訂單內容不能為空' }); return; }

    setSaving(true);
    try {
      const orderItems: OrderItem[] = items.map(item =>
        item.type === 'menu'
          ? {
              menuId: item.menuId,
              menuName: item.menuName,
              quantity: item.servings,
              unitPrice: item.unitPrice,
              subtotal: r3(item.unitPrice * item.servings),
            }
          : {
              menuId: '',
              menuName: item.ingredientName,
              quantity: item.quantity,
              unitPrice: item.unitCost,
              subtotal: r3(item.unitCost * item.quantity),
              specialRequests: `custom:${item.ingredientId}:${item.unit}`,
            },
      );

      const orderId = await placeOrder(
        db,
        {
          orderDate:    Timestamp.now(),
          deliveryDate: Timestamp.fromDate(new Date(deliveryDate)),
          clientId:     '',
          clientName:   clientName.trim(),
          status:       'pending',
          items:        orderItems,
          totalAmount,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        '', // performedBy: fill in when Auth is integrated
      );

      toast({ title: '訂單已送出', description: `訂單 #${orderId}，客戶：${clientName}，共 ${items.length} 項` });
      setItems([]);
      setClientName('');
      setDeliveryDate('');
      setNotes('');
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        toast({
          variant: 'destructive',
          title: '庫存不足，訂單無法送出',
          description: err.shortages.join('\n'),
        });
      } else {
        toast({ variant: 'destructive', title: '送出失敗', description: err instanceof Error ? err.message : '請稍後再試' });
      }
    } finally {
      setSaving(false);
    }
  }, [clientName, deliveryDate, items, notes, toast, totalAmount]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-sm text-muted-foreground">
        載入中…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">

      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">新增訂單</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          選擇固定菜單或自訂食材組合，填寫後正式送出。
        </p>
      </div>

      {/* Order header */}
      <section className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        {[
          { label: '客戶名稱 *', type: 'text',  value: clientName,    onChange: setClientName,   placeholder: '請輸入客戶名稱' },
          { label: '交貨日期 *', type: 'date',  value: deliveryDate,  onChange: setDeliveryDate, placeholder: '' },
          { label: '備註',       type: 'text',  value: notes,         onChange: setNotes,        placeholder: '選填' },
        ].map(({ label, type, value, onChange, placeholder }) => (
          <div key={label} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <input
              type={type}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="flex w-fit gap-0.5 rounded-lg border bg-muted/40 p-1">
        {(['menu', 'custom'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t === 'menu' ? '選擇固定菜單' : '自訂食材組合'}
          </button>
        ))}
      </div>

      {/* Tab panel — Menu mode */}
      {tab === 'menu' ? (
        <section className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">菜單</label>
            <select
              value={selectedMenuId}
              onChange={e => setSelectedMenuId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">請選擇菜單…</option>
              {menus.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}（NT$ {m.unitPrice} / 份）
                </option>
              ))}
            </select>
            {/* BOM preview */}
            {selectedMenu && (
              <p className="text-xs text-muted-foreground">
                食材：{selectedMenu.ingredients.map(b => b.ingredientName).join('、')}
              </p>
            )}
          </div>
          <div className="w-28 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">份數</label>
            <input
              type="number" min={1}
              value={servings}
              onChange={e => setServings(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={addMenu}
            disabled={!selectedMenuId}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <PlusCircle size={14} /> 加入
          </button>
        </section>

      ) : (
        /* Tab panel — Custom mode */
        <section className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div className="relative flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">搜尋食材</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={ingSearch}
                onChange={e => { setIngSearch(e.target.value); setSelectedIngId(''); }}
                placeholder="輸入食材名稱…"
                className="w-full rounded-md border bg-background pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {/* Dropdown */}
            {ingSearch && !selectedIngId && filteredIngredients.length > 0 && (
              <ul className="absolute z-10 mt-0.5 max-h-48 w-full overflow-y-auto rounded-md border bg-background shadow-md">
                {filteredIngredients.slice(0, 8).map(ing => (
                  <li
                    key={ing.id}
                    onClick={() => { setSelectedIngId(ing.id); setIngSearch(ing.name); }}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                  >
                    {ing.name}
                    <span className="ml-1 text-xs text-muted-foreground">({ing.unit})</span>
                  </li>
                ))}
              </ul>
            )}
            {ingSearch && !selectedIngId && filteredIngredients.length === 0 && (
              <p className="text-xs text-muted-foreground">查無符合食材</p>
            )}
          </div>
          <div className="w-32 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              數量{selectedIngredient ? `（${selectedIngredient.unit}）` : ''}
            </label>
            <input
              type="number" min={0.1} step={0.1}
              value={customQty}
              onChange={e => setCustomQty(Math.max(0.1, Number(e.target.value)))}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={addIngredient}
            disabled={!selectedIngId}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <PlusCircle size={14} /> 加入
          </button>
        </section>
      )}

      {/* Cart */}
      {items.length > 0 && (
        <section className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            訂單內容
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">名稱</th>
                <th className="px-4 py-2 text-right font-medium">數量</th>
                <th className="px-4 py-2 text-right font-medium">單價</th>
                <th className="px-4 py-2 text-right font-medium">小計</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty     = item.type === 'menu' ? item.servings  : item.quantity;
                const price   = item.type === 'menu' ? item.unitPrice : item.unitCost;
                const unit    = item.type === 'menu' ? '份'           : item.unit;
                const name    = item.type === 'menu' ? item.menuName  : item.ingredientName;
                const subtotal = r3(qty * price);
                return (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {name}
                      {item.type === 'custom' && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                          自訂
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{qty} {unit}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      NT$ {price.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      NT$ {subtotal.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="移除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Requirements preview */}
      {requirements.length > 0 && (
        <section className="rounded-lg border p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            食材需求預覽（BOM 展開後）
          </p>
          <div className="flex flex-wrap gap-2">
            {requirements.map(req => (
              <span
                key={req.ingredientId}
                className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs tabular-nums"
              >
                {req.ingredientName}：{req.totalKg.toFixed(3)} kg
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-6 py-4">
        <div>
          <p className="text-sm text-muted-foreground">共 {items.length} 項</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">
            NT$ {totalAmount.toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || items.length === 0}
          className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          <ShoppingBag size={14} />
          {saving ? '送出中…' : '正式送出'}
        </button>
      </div>

      <Toaster />
    </div>
  );
}
