/**
 * DishManager — CRUD for dishes (menus collection).
 * Lists all dishes, lets users create/edit (with inline BOM editor) and delete.
 */

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { ChefHat, Plus, Pencil, Trash2, X, Check, GripVertical } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { BOMItem, Ingredient, Menu } from '@/services/types';
import { dishService } from '@/services/mealPlanService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// ─── Types ────────────────────────────────────────────────────────────────────

type EditingMenu = Omit<Menu, 'id'> & { id?: string };

const CATEGORIES = ['主食', '主菜', '副菜', '湯品', '點心', '其他'];
const BOM_UNITS: BOMItem['unit'][] = ['kg', 'g', '台斤', 'L', 'piece'];

// ─── BOM Row editor ───────────────────────────────────────────────────────────

function BomRow({
  item,
  ingredients,
  onChange,
  onRemove,
}: {
  item: BOMItem;
  ingredients: Ingredient[];
  onChange: (b: BOMItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <GripVertical size={14} className="shrink-0 text-muted-foreground/40" />
      <select
        value={item.ingredientId}
        onChange={(e) => {
          const ing = ingredients.find((i) => i.id === e.target.value);
          if (ing) onChange({ ...item, ingredientId: ing.id, ingredientName: ing.name });
        }}
        className="h-8 flex-1 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">選擇食材…</option>
        {ingredients.map((i) => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>
      <Input
        type="number" min={0} step={0.1}
        value={item.quantity}
        onChange={(e) => onChange({ ...item, quantity: parseFloat(e.target.value) || 0 })}
        className="h-8 w-20 text-right tabular-nums"
        placeholder="數量"
      />
      <select
        value={item.unit}
        onChange={(e) => onChange({ ...item, unit: e.target.value as BOMItem['unit'] })}
        className="h-8 w-20 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {BOM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <Input
        type="number" min={0} max={0.99} step={0.01}
        value={item.wasteFactor}
        onChange={(e) => onChange({ ...item, wasteFactor: parseFloat(e.target.value) || 0 })}
        className="h-8 w-20 text-right tabular-nums"
        placeholder="廢料率"
        title="廢料率 (0~0.99)"
      />
      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── DishForm ─────────────────────────────────────────────────────────────────

function DishForm({
  initial,
  ingredients,
  onSave,
  onCancel,
}: {
  initial: EditingMenu;
  ingredients: Ingredient[];
  onSave: (m: EditingMenu) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EditingMenu>(initial);
  const [saving, setSaving] = useState(false);

  function addBomRow() {
    setForm((f) => ({
      ...f,
      ingredients: [
        ...f.ingredients,
        { ingredientId: '', ingredientName: '', quantity: 0, unit: 'kg', wasteFactor: 0 },
      ],
    }));
  }

  function updateBom(idx: number, item: BOMItem) {
    setForm((f) => {
      const next = [...f.ingredients];
      next[idx] = item;
      return { ...f, ingredients: next };
    });
  }

  function removeBom(idx: number) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast({ variant: 'destructive', title: '請填寫菜色名稱' }); return; }
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium">菜色名稱 *</label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="例：番茄炒蛋" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">類別</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">單份售價 (NT$)</label>
          <Input type="number" min={0} value={form.unitPrice}
            onChange={(e) => setForm((f) => ({ ...f, unitPrice: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>

      {/* BOM editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">食材配方（每人份）</p>
          <div className="hidden text-[10px] text-muted-foreground gap-2 sm:flex">
            <span className="w-[calc(theme(width.20)+theme(spacing.2))] text-right">數量</span>
            <span className="w-20 text-center">單位</span>
            <span className="w-20 text-right">廢料率</span>
          </div>
        </div>
        {form.ingredients.length === 0 && (
          <p className="text-xs text-muted-foreground italic">尚未加入任何食材</p>
        )}
        {form.ingredients.map((item, idx) => (
          <BomRow
            key={idx}
            item={item}
            ingredients={ingredients}
            onChange={(b) => updateBom(idx, b)}
            onRemove={() => removeBom(idx)}
          />
        ))}
        <Button variant="outline" size="sm" onClick={addBomRow} className="gap-1.5 text-xs">
          <Plus size={12} /> 加入食材
        </Button>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          <Check size={13} /> {saving ? '儲存中…' : '儲存'}
        </Button>
      </div>
    </div>
  );
}

// ─── DishManager ─────────────────────────────────────────────────────────────

export function DishManager() {
  const [dishes,      setDishes]      = useState<Menu[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [editing,     setEditing]     = useState<EditingMenu | null>(null);
  const [search,      setSearch]      = useState('');

  useEffect(() => {
    Promise.all([dishService.list(), getDocs(collection(db, 'ingredients'))])
      .then(([menus, ingSnap]) => {
        setDishes(menus.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')));
        setIngredients(ingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Ingredient)));
      })
      .catch(() => toast({ variant: 'destructive', title: '無法載入資料' }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(form: EditingMenu) {
    try {
      const id = await dishService.save({ ...form, id: form.id ?? '' } as Menu);
      const saved = { ...form, id } as Menu;
      setDishes((prev) => {
        const exists = prev.find((d) => d.id === id);
        return exists
          ? prev.map((d) => (d.id === id ? saved : d))
          : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
      });
      setEditing(null);
      toast({ title: '儲存成功', description: `菜色「${saved.name}」已更新。` });
    } catch (err) {
      toast({ variant: 'destructive', title: '儲存失敗', description: err instanceof Error ? err.message : '' });
    }
  }

  async function handleDelete(dish: Menu) {
    if (!confirm(`確定要刪除「${dish.name}」嗎？`)) return;
    try {
      await dishService.remove(dish.id);
      setDishes((prev) => prev.filter((d) => d.id !== dish.id));
      toast({ title: '已刪除', description: `「${dish.name}」已移除。` });
    } catch {
      toast({ variant: 'destructive', title: '刪除失敗' });
    }
  }

  const displayed = search.trim()
    ? dishes.filter((d) => d.name.includes(search) || d.category.includes(search))
    : dishes;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">菜色管理</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              建立每道菜的食材配方（每人份 BOM），供備料計算使用。
            </p>
          </div>
        </div>
        <Button onClick={() => setEditing({ ...dishService.empty() })} className="gap-1.5">
          <Plus size={14} /> 新增菜色
        </Button>
      </div>

      {/* New dish form */}
      {editing && !editing.id && (
        <DishForm
          initial={editing}
          ingredients={ingredients}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      <Input
        placeholder="搜尋菜色名稱或類別…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
          <ChefHat size={40} strokeWidth={1.1} />
          <p className="text-sm">{search ? `找不到「${search}」` : '尚無菜色，點右上角新增'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((dish) => (
            <div key={dish.id} className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                <Badge variant="outline">{dish.category}</Badge>
                <span className="flex-1 font-medium">{dish.name}</span>
                <span className="text-xs text-muted-foreground">{dish.ingredients.length} 項食材</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => setEditing(editing?.id === dish.id ? null : { ...dish })}>
                  <Pencil size={13} />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(dish)}>
                  <Trash2 size={13} />
                </Button>
              </div>
              {editing?.id === dish.id && (
                <DishForm
                  initial={editing}
                  ingredients={ingredients}
                  onSave={handleSave}
                  onCancel={() => setEditing(null)}
                />
              )}
              {editing?.id !== dish.id && dish.ingredients.length > 0 && (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  {dish.ingredients.map((b) => b.ingredientName).filter(Boolean).join('、')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Toaster />
    </div>
  );
}
