/**
 * WeightInput — Feature 094: 依全站顯示單位（kg/台斤/磅）輸入重量的欄位。
 *
 * 對外一律以 kg 溝通（valueKg / onChangeKg）；畫面依 useWeightUnit 顯示對應單位，
 * 使用者輸入該單位數值，內部即時換回 kg。切換全站單位時，顯示值自動換算。
 */

import { Input } from '@/components/ui/input';
import { toTaijin, toLb, inputToKg } from '@/utils/unitConverter';
import { useWeightUnit } from '@/contexts/WeightUnitContext';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function WeightInput({
  valueKg,
  onChangeKg,
  min = 0,
  placeholder,
  className,
}: {
  valueKg: number;
  onChangeKg: (kg: number) => void;
  min?: number;
  placeholder?: string;
  className?: string;
}) {
  const { unit } = useWeightUnit();
  const display = unit === '台斤' ? toTaijin(valueKg) : unit === '磅' ? toLb(valueKg) : round2(valueKg);

  return (
    <div className={`flex items-stretch ${className ?? ''}`}>
      <Input
        type="number"
        min={min}
        step="any"
        value={Number.isFinite(display) ? display : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChangeKg(Number.isFinite(v) ? Math.max(min, inputToKg(v, unit)) : 0);
        }}
        placeholder={placeholder}
        className="rounded-r-none"
      />
      <span className="inline-flex select-none items-center rounded-r-md border border-l-0 bg-muted px-2 text-xs text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}
