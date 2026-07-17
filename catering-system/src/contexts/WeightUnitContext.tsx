/**
 * WeightUnitContext — Feature 093: 全站重量顯示單位（翻譯器式一鍵切換）。
 *
 * 內部資料一律以 kg 儲存；此 context 只影響「顯示」。使用者在頂列切換
 * kg / 台斤 / 磅，全站重量顯示即時換算，選擇存 localStorage、重整後保留。
 * 不動任何 Firestore 資料。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { WEIGHT_UNITS, type WeightUnit } from '@/utils/unitConverter';

const STORAGE_KEY = 'group-meal:weightUnit';

function isWeightUnit(v: unknown): v is WeightUnit {
  return typeof v === 'string' && (WEIGHT_UNITS as string[]).includes(v);
}

interface WeightUnitContextValue {
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
  /** 循環切換 kg → 台斤 → 磅 → kg。 */
  cycle: () => void;
}

const WeightUnitContext = createContext<WeightUnitContextValue>({
  unit: 'kg',
  setUnit: () => {},
  cycle: () => {},
});

export function WeightUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (isWeightUnit(v)) return v;
    } catch { /* SSR/隱私模式 */ }
    return 'kg';
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, unit); } catch { /* ignore */ }
  }, [unit]);

  const setUnit = useCallback((u: WeightUnit) => setUnitState(u), []);
  const cycle = useCallback(() => {
    setUnitState((prev) => {
      const i = WEIGHT_UNITS.indexOf(prev);
      return WEIGHT_UNITS[(i + 1) % WEIGHT_UNITS.length];
    });
  }, []);

  const value = useMemo(() => ({ unit, setUnit, cycle }), [unit, setUnit, cycle]);
  return <WeightUnitContext.Provider value={value}>{children}</WeightUnitContext.Provider>;
}

/** 取得目前顯示單位與切換方法。 */
export function useWeightUnit(): WeightUnitContextValue {
  return useContext(WeightUnitContext);
}
