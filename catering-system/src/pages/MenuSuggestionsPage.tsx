/**
 * MenuSuggestionsPage — 菜單建議 (Feature 039: merges the previously separate
 * 菜單組合建議 / 性價比菜單建議 pages into one tabbed page).
 *
 * Old routes (/menu-mix-recommendations, /cost-menu-suggestions) redirect
 * here — see App.tsx.
 */

import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { MenuMixTab } from '@/components/menuSuggestions/MenuMixTab';
import { CostAwareTab } from '@/components/menuSuggestions/CostAwareTab';

type Tab = 'mix' | 'cost';

const TABS: { key: Tab; label: string }[] = [
  { key: 'mix',  label: '產能組合' },
  { key: 'cost', label: '性價比' },
];

export default function MenuSuggestionsPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'cost' ? 'cost' : 'mix');

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-6 pt-6">
        <ChefHat size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-semibold">菜單建議</h1>
          <p className="text-sm text-muted-foreground">人工參考用啟發式菜單建議——產能組合配比與性價比排序</p>
        </div>
      </div>

      {/* Tab bar */}
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

      {tab === 'mix'  && <MenuMixTab />}
      {tab === 'cost' && <CostAwareTab />}
    </div>
  );
}
