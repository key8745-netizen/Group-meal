/**
 * WeightUnitToggle — Feature 093: 頂列全站重量單位切換（kg / 台斤 / 磅）。
 * 一鍵切換，全站重量顯示即時換算；選擇記憶於 localStorage。
 */

import { Scale } from 'lucide-react';
import { WEIGHT_UNITS } from '@/utils/unitConverter';
import { useWeightUnit } from '@/contexts/WeightUnitContext';

export function WeightUnitToggle() {
  const { unit, setUnit } = useWeightUnit();
  return (
    <div className="flex items-center gap-1" title="全站重量顯示單位（不影響實際儲存值）">
      <Scale size={14} className="text-muted-foreground" />
      <div className="flex overflow-hidden rounded-md border">
        {WEIGHT_UNITS.map((u) => (
          <button
            key={u}
            onClick={() => setUnit(u)}
            className={[
              'px-2 py-0.5 text-xs transition-colors',
              unit === u
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent',
            ].join(' ')}
            aria-pressed={unit === u}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
