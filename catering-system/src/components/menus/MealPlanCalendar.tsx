/**
 * MealPlanCalendar — month-view calendar for scheduling daily menus.
 * Click any day to open a side-panel that lets you pick dishes and set headcount.
 * Data is stored in mealPlans/{YYYY-MM-DD} in Firestore.
 */

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, X, Check } from 'lucide-react';
import type { MealPlan, Menu } from '@/services/types';
import { mealPlanService, dishService } from '@/services/mealPlanService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function monthRange(y: number, m: number): [string, string] {
  return [isoDate(y, m, 1), isoDate(y, m, new Date(y, m + 1, 0).getDate())];
}

function buildGrid(y: number, m: number): (number | null)[] {
  const first  = new Date(y, m, 1).getDay();
  const days   = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Day editor panel ─────────────────────────────────────────────────────────

function DayPanel({
  date,
  plan,
  dishes,
  onSave,
  onClose,
}: {
  date: string;
  plan: MealPlan | null;
  dishes: Menu[];
  onSave: (p: MealPlan) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(plan?.menuIds ?? []);
  const [headCount,   setHeadCount]   = useState(plan?.headCount ?? 360);
  const [notes,       setNotes]       = useState(plan?.notes ?? '');
  const [saving,      setSaving]      = useState(false);

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ date, headCount, menuIds: selectedIds, notes });
    } finally {
      setSaving(false);
    }
  }

  const grouped = dishes.reduce<Record<string, Menu[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="w-72 shrink-0 rounded-lg border bg-background shadow-lg flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-medium">{date.slice(5).replace('-', '/')}</span>
        <button onClick={onClose}><X size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">供餐人數</label>
          <Input type="number" min={1} value={headCount}
            onChange={(e) => setHeadCount(parseInt(e.target.value, 10) || 0)}
            className="h-8 w-28 text-right tabular-nums" />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium">今日菜色</p>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{cat}</p>
              {(items as Menu[]).map((d) => {
                const on = selectedIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggle(d.id)}
                    className={[
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors text-left',
                      on
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted/60',
                    ].join(' ')}
                  >
                    {on && <Check size={12} />}
                    <span className={on ? '' : 'ml-[20px]'}>{d.name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">備註</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="選填" className="h-8 text-sm" />
        </div>
      </div>

      <div className="border-t p-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          <Check size={13} /> {saving ? '儲存中…' : '儲存'}
        </Button>
      </div>
    </div>
  );
}

// ─── MealPlanCalendar ─────────────────────────────────────────────────────────

export function MealPlanCalendar() {
  const now  = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth());
  const [plans,   setPlans]   = useState<Map<string, MealPlan>>(new Map());
  const [dishes,  setDishes]  = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [active,  setActive]  = useState<string | null>(null);   // selected date

  const todayStr = isoDate(now.getFullYear(), now.getMonth(), now.getDate());

  useEffect(() => {
    setLoading(true);
    const [from, to] = monthRange(year, month);
    Promise.all([
      mealPlanService.getRange(from, to),
      dishService.list(),
    ])
      .then(([monthPlans, menuList]) => {
        setPlans(new Map(monthPlans.map((p) => [p.date, p])));
        setDishes(menuList);
      })
      .catch(() => toast({ variant: 'destructive', title: '無法載入菜單資料' }))
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setActive(null);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setActive(null);
  }

  async function handleSave(plan: MealPlan) {
    try {
      await mealPlanService.save(plan);
      setPlans((prev) => new Map(prev).set(plan.date, plan));
      setActive(null);
      toast({ title: '已儲存', description: `${plan.date} 菜單已更新。` });
    } catch {
      toast({ variant: 'destructive', title: '儲存失敗' });
    }
  }

  const grid   = buildGrid(year, month);
  const dishMap = new Map(dishes.map((d) => [d.id, d]));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <CalendarDays size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">每月菜單計畫</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">點選日期排定當天菜色與供餐人數。</p>
        </div>
      </div>

      <div className="flex items-start gap-4">
        {/* Calendar */}
        <div className="flex-1 min-w-0">
          {/* Month nav */}
          <div className="mb-3 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={prevMonth} className="h-8 w-8 p-0">
              <ChevronLeft size={14} />
            </Button>
            <span className="min-w-24 text-center font-medium">
              {year} 年 {month + 1} 月
            </span>
            <Button variant="ghost" size="sm" onClick={nextMonth} className="h-8 w-8 p-0">
              <ChevronRight size={14} />
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              {/* Weekday header */}
              <div className="grid grid-cols-7 border-b bg-muted/30">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-2 text-center text-xs font-medium text-muted-foreground">{w}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7">
                {grid.map((day, idx) => {
                  if (day === null) {
                    return <div key={idx} className="h-24 border-b border-r last:border-r-0 bg-muted/10" />;
                  }
                  const dateStr = isoDate(year, month, day);
                  const plan    = plans.get(dateStr);
                  const isToday = dateStr === todayStr;
                  const isActive = dateStr === active;
                  const col = idx % 7;

                  return (
                    <button
                      key={idx}
                      onClick={() => setActive((a) => a === dateStr ? null : dateStr)}
                      className={[
                        'h-24 border-b border-r last:border-r-0 p-1.5 text-left align-top transition-colors',
                        col === 0 ? 'text-red-500' : col === 6 ? 'text-blue-500' : '',
                        isActive ? 'bg-primary/10 ring-1 ring-inset ring-primary' : 'hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <div className={[
                        'mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium',
                        isToday ? 'bg-primary text-primary-foreground' : '',
                      ].join(' ')}>
                        {day}
                      </div>
                      {plan && plan.menuIds.length > 0 && (
                        <div className="space-y-0.5">
                          {plan.menuIds.slice(0, 3).map((id) => {
                            const d = dishMap.get(id);
                            return d ? (
                              <div key={id} className="truncate rounded bg-primary/10 px-1 text-[10px] text-primary">
                                {d.name}
                              </div>
                            ) : null;
                          })}
                          {plan.menuIds.length > 3 && (
                            <div className="text-[10px] text-muted-foreground">+{plan.menuIds.length - 3} 道</div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Day editor side panel */}
        {active && (
          <DayPanel
            date={active}
            plan={plans.get(active) ?? null}
            dishes={dishes}
            onSave={handleSave}
            onClose={() => setActive(null)}
          />
        )}
      </div>

      <Toaster />
    </div>
  );
}
