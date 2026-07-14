/**
 * KitchenSettingsPage — Feature 049: 我的廚房設定 (/kitchen-settings)
 *
 * Owner-editable schedule parameters: 出餐時間、工時窗、緩衝、人力、設備。
 * 一日開工的排程建議與生產排程表單預設值都從這裡讀，存檔即生效——
 * 沒有任何寫死的參數。
 */

import { useEffect, useState } from 'react';
import { Settings2, Plus, Trash2 } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { EquipmentType } from '@/services/types';
import {
  getKitchenSettings,
  saveKitchenSettings,
  EQUIPMENT_LABELS,
  EQUIPMENT_INVENTORY_TYPES,
  type KitchenSettings,
} from '@/services/kitchenSettingsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

const EQUIPMENT_TYPES = EQUIPMENT_INVENTORY_TYPES;

export default function KitchenSettingsPage() {
  const [settings, setSettings] = useState<KitchenSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getKitchenSettings(db).then(setSettings);
  }, []);

  function update<K extends keyof KitchenSettings>(key: K, value: KitchenSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!settings) return;
    if (settings.availableStaff.some((s) => !s.role.trim() || !(s.count > 0))) {
      toast({ variant: 'destructive', title: '人力設定不完整', description: '每列都要有角色名稱與大於 0 的人數。' });
      return;
    }
    setSaving(true);
    try {
      await saveKitchenSettings(db, settings, auth.currentUser?.uid ?? '');
      toast({ title: '已儲存', description: '之後的一鍵開工與排程建議都會用這組參數。' });
    } catch (err) {
      toast({ variant: 'destructive', title: '儲存失敗', description: err instanceof Error ? err.message : '' });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Settings2 size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">我的廚房設定</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            一鍵開工與排程建議的預設參數。存檔即生效，個別排程仍可臨時調整。
          </p>
        </div>
      </div>

      {/* ── 時間 ── */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">出餐與工時</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="serviceTime" className="mb-1 block text-xs text-muted-foreground">出餐時間</label>
            <Input
              id="serviceTime"
              type="time"
              value={settings.serviceTime}
              onChange={(e) => update('serviceTime', e.target.value)}
              className="w-32"
            />
          </div>
          <div>
            <label htmlFor="capacityWindow" className="mb-1 block text-xs text-muted-foreground">工時窗（分鐘）</label>
            <Input
              id="capacityWindow"
              type="number"
              min={30}
              value={settings.capacityWindowMinutes}
              onChange={(e) => update('capacityWindowMinutes', Math.max(1, Number(e.target.value) || 1))}
              className="w-28"
            />
          </div>
          <div>
            <label htmlFor="buffer" className="mb-1 block text-xs text-muted-foreground">出餐前緩衝（分鐘）</label>
            <Input
              id="buffer"
              type="number"
              min={0}
              value={settings.bufferMinutes}
              onChange={(e) => update('bufferMinutes', Math.max(0, Number(e.target.value) || 0))}
              className="w-28"
            />
          </div>
          <div>
            <label htmlFor="targetCost" className="mb-1 block text-xs text-muted-foreground">每人食材成本目標（NT$）</label>
            <Input
              id="targetCost"
              type="number"
              min={0}
              step={0.5}
              value={settings.targetCostPerServing}
              onChange={(e) => update('targetCostPerServing', Math.max(0, Number(e.target.value) || 0))}
              className="w-28"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">0 = 不設目標。設了之後首頁挑菜會顯示超標/達標。</p>
          </div>
        </div>
      </section>

      {/* ── 人力 ── */}
      <section className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">人力</h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => update('availableStaff', [...settings.availableStaff, { role: '', count: 1 }])}
          >
            <Plus size={13} /> 加一列
          </Button>
        </div>
        <div className="space-y-2">
          {settings.availableStaff.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="角色（例：廚師）"
                value={row.role}
                onChange={(e) => {
                  const next = [...settings.availableStaff];
                  next[i] = { ...next[i], role: e.target.value };
                  update('availableStaff', next);
                }}
                className="w-44"
              />
              <Input
                type="number"
                min={1}
                value={row.count}
                onChange={(e) => {
                  const next = [...settings.availableStaff];
                  next[i] = { ...next[i], count: Math.max(1, Number(e.target.value) || 1) };
                  update('availableStaff', next);
                }}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">人</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={settings.availableStaff.length <= 1}
                onClick={() => update('availableStaff', settings.availableStaff.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          角色名稱需與製程任務的人力角色一致（自動任務草稿使用「廚師」與「助手」）。
        </p>
      </section>

      {/* ── 設備 ── */}
      <section className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">設備</h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => update('availableEquipment', [...settings.availableEquipment, { type: 'wok', count: 1 }])}
          >
            <Plus size={13} /> 加一列
          </Button>
        </div>
        <div className="space-y-2">
          {settings.availableEquipment.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                className="w-44 rounded-md border bg-background px-2 py-2 text-sm"
                value={row.type}
                onChange={(e) => {
                  const next = [...settings.availableEquipment];
                  next[i] = { ...next[i], type: e.target.value as EquipmentType };
                  update('availableEquipment', next);
                }}
              >
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EQUIPMENT_LABELS[t]}</option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                value={row.count}
                onChange={(e) => {
                  const next = [...settings.availableEquipment];
                  next[i] = { ...next[i], count: Math.max(1, Number(e.target.value) || 1) };
                  update('availableEquipment', next);
                }}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">台</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={settings.availableEquipment.length <= 1}
                onClick={() => update('availableEquipment', settings.availableEquipment.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <div>
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? '儲存中…' : '儲存設定'}
        </Button>
      </div>

      <Toaster />
    </div>
  );
}
