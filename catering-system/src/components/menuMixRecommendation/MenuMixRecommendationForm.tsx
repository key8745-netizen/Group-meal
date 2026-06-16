import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { getDocs, collection, query, where } from 'firebase/firestore';
import type { Recipe, EquipmentType, AvailableStaffInput, AvailableEquipmentInput, MenuMixConstraints } from '@/services/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MenuMixRecommendationInput } from '@/services/menuMixRecommendationService';

const EQUIPMENT_TYPE_OPTIONS: EquipmentType[] = [
  'sink', 'cuttingStation', 'prepTable', 'wok', 'stoveBurner',
  'stockPot', 'deepFryer', 'oven', 'steamer', 'holdingCabinet',
  'coolingArea', 'packingTable', 'refrigerator',
];

const EQUIPMENT_LABELS: Record<string, string> = {
  sink: '水槽', cuttingStation: '切菜台', prepTable: '備料台', wok: '炒鍋',
  stoveBurner: '爐頭', stockPot: '湯鍋', deepFryer: '油炸鍋', oven: '烤箱',
  steamer: '蒸爐', holdingCabinet: '保溫箱', coolingArea: '冷卻區',
  packingTable: '分裝台', refrigerator: '冰箱',
};

interface Props {
  onSubmit: (input: MenuMixRecommendationInput, recipeNameSnapshots: Record<string, string>) => Promise<void>;
  submitting: boolean;
}

export function MenuMixRecommendationForm({ onSubmit, submitting }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [targetServingCount, setTargetServingCount] = useState(100);
  const [targetServiceDateTime, setTargetServiceDateTime] = useState('');
  const [capacityWindowMinutes, setCapacityWindowMinutes] = useState(240);
  const [bufferMinutes, setBufferMinutes] = useState(30);
  const [candidateRecipeIds, setCandidateRecipeIds] = useState<string[]>([]);
  const [excludedRecipeIds, setExcludedRecipeIds] = useState<string[]>([]);
  const [preferredRecipeIds, setPreferredRecipeIds] = useState<string[]>([]);
  const [maxFriedRatio, setMaxFriedRatio] = useState('');
  const [maxBakedRatio, setMaxBakedRatio] = useState('');
  const [maxSameProcessRatio, setMaxSameProcessRatio] = useState('');
  const [maxSameEquipmentRatio, setMaxSameEquipmentRatio] = useState('');
  const [availableStaff, setAvailableStaff] = useState<AvailableStaffInput[]>([{ role: '', count: 1 }]);
  const [availableEquipment, setAvailableEquipment] = useState<AvailableEquipmentInput[]>([{ type: 'wok', count: 1 }]);

  useEffect(() => {
    getDocs(query(collection(db, 'recipes'), where('isActive', '==', true)))
      .then((snap) => setRecipes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) }))))
      .catch(() => {});
  }, []);

  function toggleCandidate(id: string) {
    setCandidateRecipeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function addStaffRow() { setAvailableStaff((p) => [...p, { role: '', count: 1 }]); }
  function removeStaffRow(i: number) { setAvailableStaff((p) => p.filter((_, idx) => idx !== i)); }
  function updateStaffRow(i: number, f: keyof AvailableStaffInput, v: string | number) {
    setAvailableStaff((p) => p.map((r, idx) => idx === i ? { ...r, [f]: v } : r));
  }

  function addEquipRow() { setAvailableEquipment((p) => [...p, { type: 'sink', count: 1 }]); }
  function removeEquipRow(i: number) { setAvailableEquipment((p) => p.filter((_, idx) => idx !== i)); }
  function updateEquipRow(i: number, f: keyof AvailableEquipmentInput, v: string | number) {
    setAvailableEquipment((p) => p.map((r, idx) => idx === i ? { ...r, [f]: v } : r));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const constraints: MenuMixConstraints = {
      excludedRecipeIds: excludedRecipeIds.length > 0 ? excludedRecipeIds : undefined,
      preferredRecipeIds: preferredRecipeIds.length > 0 ? preferredRecipeIds : undefined,
      ...(maxFriedRatio !== '' ? { maxFriedRatio: parseFloat(maxFriedRatio) } : {}),
      ...(maxBakedRatio !== '' ? { maxBakedRatio: parseFloat(maxBakedRatio) } : {}),
      ...(maxSameProcessRatio !== '' ? { maxSameProcessRatio: parseFloat(maxSameProcessRatio) } : {}),
      ...(maxSameEquipmentRatio !== '' ? { maxSameEquipmentRatio: parseFloat(maxSameEquipmentRatio) } : {}),
    };
    const snapshots: Record<string, string> = {};
    for (const r of recipes) snapshots[r.id] = r.name;

    await onSubmit(
      {
        targetServingCount,
        targetServiceDateTime: new Date(targetServiceDateTime),
        capacityWindowMinutes,
        bufferMinutes,
        candidateRecipeIds,
        constraints,
        availableStaff,
        availableEquipment,
      },
      snapshots,
    );
  }

  const candidateSet = new Set(candidateRecipeIds);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex gap-4">
        <div className="flex flex-col gap-1.5 flex-1">
          <label htmlFor="targetServingCount" className="text-sm font-medium">目標份數 *</label>
          <Input
            id="targetServingCount"
            type="number"
            min={1}
            value={targetServingCount}
            onChange={(e) => setTargetServingCount(Number(e.target.value))}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label htmlFor="targetServiceDateTime" className="text-sm font-medium">目標出餐時間 *</label>
          <Input
            id="targetServiceDateTime"
            type="datetime-local"
            value={targetServiceDateTime}
            onChange={(e) => setTargetServiceDateTime(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col gap-1.5 flex-1">
          <label htmlFor="capacityWindowMinutes" className="text-sm font-medium">產能時窗（分鐘）*</label>
          <Input
            id="capacityWindowMinutes"
            type="number"
            min={1}
            value={capacityWindowMinutes}
            onChange={(e) => setCapacityWindowMinutes(Number(e.target.value))}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label htmlFor="bufferMinutes" className="text-sm font-medium">緩衝時間（分鐘）</label>
          <Input
            id="bufferMinutes"
            type="number"
            min={0}
            value={bufferMinutes}
            onChange={(e) => setBufferMinutes(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Candidate recipes */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">候選菜色 * (請至少選一項)</label>
        {recipes.length === 0 && (
          <p className="text-xs text-muted-foreground">載入中…</p>
        )}
        <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto rounded-md border p-2">
          {recipes.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={candidateRecipeIds.includes(r.id)}
                onChange={() => toggleCandidate(r.id)}
              />
              {r.name}
            </label>
          ))}
        </div>
      </div>

      {/* Excluded recipes */}
      {candidateRecipeIds.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">排除菜色</label>
          <div className="flex flex-wrap gap-2">
            {recipes.filter((r) => candidateSet.has(r.id)).map((r) => (
              <label key={r.id} className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludedRecipeIds.includes(r.id)}
                  onChange={() =>
                    setExcludedRecipeIds((p) =>
                      p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id],
                    )
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Preferred recipes */}
      {candidateRecipeIds.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">優先菜色</label>
          <div className="flex flex-wrap gap-2">
            {recipes
              .filter((r) => candidateSet.has(r.id) && !excludedRecipeIds.includes(r.id))
              .map((r) => (
                <label key={r.id} className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferredRecipeIds.includes(r.id)}
                    onChange={() =>
                      setPreferredRecipeIds((p) =>
                        p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id],
                      )
                    }
                  />
                  {r.name}
                </label>
              ))}
          </div>
        </div>
      )}

      {/* Ratio constraints */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">比例限制（選填，0–1）</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'maxFriedRatio', label: '炸物最大比例', val: maxFriedRatio, set: setMaxFriedRatio },
            { id: 'maxBakedRatio', label: '烤物最大比例', val: maxBakedRatio, set: setMaxBakedRatio },
            { id: 'maxSameProcessRatio', label: '同製程最大比例', val: maxSameProcessRatio, set: setMaxSameProcessRatio },
            { id: 'maxSameEquipmentRatio', label: '同設備最大比例', val: maxSameEquipmentRatio, set: setMaxSameEquipmentRatio },
          ].map(({ id, label, val, set }) => (
            <div key={id} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
              <Input
                id={id}
                type="number"
                step="0.05"
                min={0}
                max={1}
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder="不限制"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Available staff */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">可用人員</label>
          <Button type="button" variant="outline" size="sm" onClick={addStaffRow}>＋ 新增人員</Button>
        </div>
        {availableStaff.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              placeholder="職務角色"
              value={row.role}
              onChange={(e) => updateStaffRow(i, 'role', e.target.value)}
              className="flex-1"
              required
            />
            <Input
              type="number"
              min={1}
              value={row.count}
              onChange={(e) => updateStaffRow(i, 'count', Number(e.target.value))}
              className="w-20"
              required
            />
            {availableStaff.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeStaffRow(i)}>✕</Button>
            )}
          </div>
        ))}
      </div>

      {/* Available equipment */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">可用設備</label>
          <Button type="button" variant="outline" size="sm" onClick={addEquipRow}>＋ 新增設備</Button>
        </div>
        {availableEquipment.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm flex-1"
              value={row.type}
              onChange={(e) => updateEquipRow(i, 'type', e.target.value as EquipmentType)}
            >
              {EQUIPMENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{EQUIPMENT_LABELS[t] ?? t}</option>
              ))}
            </select>
            <Input
              type="number"
              min={1}
              value={row.count}
              onChange={(e) => updateEquipRow(i, 'count', Number(e.target.value))}
              className="w-20"
              required
            />
            {availableEquipment.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeEquipRow(i)}>✕</Button>
            )}
          </div>
        ))}
      </div>

      <Button type="submit" disabled={submitting || candidateRecipeIds.length === 0}>
        {submitting ? '建議中…' : '產生菜單組合建議'}
      </Button>
    </form>
  );
}
