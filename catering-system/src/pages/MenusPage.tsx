import { useState } from 'react';
import { DishManager }      from '@/components/menus/DishManager';
import { MealPlanCalendar } from '@/components/menus/MealPlanCalendar';
import { TodayPrep }        from '@/components/menus/TodayPrep';
import { MenuImport }       from '@/components/menus/MenuImport';

type Tab = 'today' | 'calendar' | 'dishes' | 'import';

const TABS: { key: Tab; label: string }[] = [
  { key: 'today',    label: '今日備料' },
  { key: 'calendar', label: '每月計畫' },
  { key: 'dishes',   label: '菜色管理' },
  { key: 'import',   label: '匯入菜單' },
];

export default function MenusPage() {
  const [tab, setTab] = useState<Tab>('today');

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 border-b bg-muted/20 px-6 pt-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'rounded-t-md px-4 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'border border-b-background -mb-px bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'today'    && <TodayPrep />}
      {tab === 'calendar' && <MealPlanCalendar />}
      {tab === 'dishes'   && <DishManager />}
      {tab === 'import'   && <MenuImport />}
    </div>
  );
}
