/**
 * kitchenSettingsService — Feature 049: 我的廚房設定
 *
 * Owner-editable defaults for production scheduling (staff, equipment,
 * service time, capacity window). Stored as a single document at
 * `kitchenSettings/default`; every consumer of "auto" schedule parameters
 * (一日開工 step 5, 生產排程 form) reads from here so nothing is hard-coded
 * — per the owner's rule that every auto-suggested parameter must remain
 * manually adjustable.
 *
 * `getKitchenSettings` never throws: on missing doc or read failure it
 * returns `DEFAULT_KITCHEN_SETTINGS` (merged field-by-field so partially
 * filled docs from older versions stay valid).
 */

import { doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { AvailableStaffInput, AvailableEquipmentInput, EquipmentType } from './types';
import type { ProductionScheduleInput } from './productionScheduleService';

const COLLECTION = 'kitchenSettings';
const DOC_ID = 'default';

export interface KitchenSettings {
  /** 出餐時間 'HH:MM'（24 小時制），排程建議以此為完工目標。 */
  serviceTime: string;
  /** 可用工時窗（分鐘）。 */
  capacityWindowMinutes: number;
  /** 出餐前保留的緩衝（分鐘）。 */
  bufferMinutes: number;
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
  /** Feature 055: 每人食材成本目標（NT$/人）；0 = 未設定（不顯示比較）。 */
  targetCostPerServing: number;
}

/** zh-TW labels for the schedule equipment vocabulary. */
export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  none: '無（不佔設備）',
  sink: '水槽',
  cuttingStation: '切菜台',
  prepTable: '備料台',
  wok: '炒鍋',
  stoveBurner: '爐頭',
  stockPot: '湯鍋',
  deepFryer: '油炸鍋',
  oven: '烤箱',
  steamer: '蒸爐',
  holdingCabinet: '保溫箱',
  coolingArea: '冷卻區',
  packingTable: '分裝台',
  refrigerator: '冰箱',
};

/** Equipment types a kitchen can own — excludes the 'none' placeholder used by tasks. */
export const EQUIPMENT_INVENTORY_TYPES: EquipmentType[] =
  (Object.keys(EQUIPMENT_LABELS) as EquipmentType[]).filter((t) => t !== 'none');

export const DEFAULT_KITCHEN_SETTINGS: KitchenSettings = {
  serviceTime: '11:00',
  capacityWindowMinutes: 240,
  bufferMinutes: 30,
  availableStaff: [
    { role: '廚師', count: 2 },
    { role: '助手', count: 2 },
  ],
  availableEquipment: [
    { type: 'sink', count: 1 },
    { type: 'cuttingStation', count: 2 },
    { type: 'prepTable', count: 2 },
    { type: 'wok', count: 2 },
    { type: 'stoveBurner', count: 2 },
    { type: 'stockPot', count: 1 },
    { type: 'deepFryer', count: 1 },
    { type: 'steamer', count: 1 },
  ],
  targetCostPerServing: 0,
};

function sanitizeTime(value: unknown): string {
  // 兩位數 HH:MM——`new Date('YYYY-MM-DDTH:MM')` 的一位數小時非合法 ISO。
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : DEFAULT_KITCHEN_SETTINGS.serviceTime;
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

function sanitizeStaff(value: unknown): AvailableStaffInput[] {
  if (!Array.isArray(value)) return DEFAULT_KITCHEN_SETTINGS.availableStaff.map((s) => ({ ...s }));
  const rows = value
    .filter((r): r is AvailableStaffInput =>
      !!r && typeof r.role === 'string' && r.role.trim().length > 0
      && typeof r.count === 'number' && r.count > 0)
    .map((r) => ({ role: r.role.trim(), count: Math.round(r.count) }));
  return rows.length > 0 ? rows : DEFAULT_KITCHEN_SETTINGS.availableStaff.map((s) => ({ ...s }));
}

function sanitizeEquipment(value: unknown): AvailableEquipmentInput[] {
  if (!Array.isArray(value)) return DEFAULT_KITCHEN_SETTINGS.availableEquipment.map((e) => ({ ...e }));
  const rows = value
    .filter((r): r is AvailableEquipmentInput =>
      !!r && typeof r.type === 'string'
      && EQUIPMENT_INVENTORY_TYPES.includes(r.type as EquipmentType)
      && typeof r.count === 'number' && r.count > 0)
    .map((r) => ({ type: r.type, count: Math.round(r.count) }));
  return rows.length > 0 ? rows : DEFAULT_KITCHEN_SETTINGS.availableEquipment.map((e) => ({ ...e }));
}

/** Pure merge of a raw (possibly partial/legacy) doc with defaults. */
export function mergeKitchenSettings(raw: unknown): KitchenSettings {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    serviceTime: sanitizeTime(data.serviceTime),
    capacityWindowMinutes: sanitizePositiveInt(
      data.capacityWindowMinutes, DEFAULT_KITCHEN_SETTINGS.capacityWindowMinutes),
    bufferMinutes: sanitizePositiveInt(
      data.bufferMinutes, DEFAULT_KITCHEN_SETTINGS.bufferMinutes),
    availableStaff: sanitizeStaff(data.availableStaff),
    availableEquipment: sanitizeEquipment(data.availableEquipment),
    targetCostPerServing:
      typeof data.targetCostPerServing === 'number'
        && Number.isFinite(data.targetCostPerServing)
        && data.targetCostPerServing >= 0
        ? Math.round(data.targetCostPerServing * 10) / 10
        : 0,
  };
}

export async function getKitchenSettings(db: Firestore): Promise<KitchenSettings> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
    if (!snap.exists()) return mergeKitchenSettings(null);
    return mergeKitchenSettings(snap.data());
  } catch {
    return mergeKitchenSettings(null);
  }
}

export async function saveKitchenSettings(
  db: Firestore,
  settings: KitchenSettings,
  uid: string,
): Promise<void> {
  const clean = mergeKitchenSettings(settings);
  await setDoc(doc(db, COLLECTION, DOC_ID), {
    ...clean,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/**
 * Pure: builds a ProductionScheduleInput for `date` from kitchen settings —
 * the single place「自動排程參數」comes from.
 */
export function buildScheduleInput(date: string, settings: KitchenSettings): ProductionScheduleInput {
  return {
    targetServiceDateTime: new Date(`${date}T${settings.serviceTime}:00`),
    capacityWindowMinutes: settings.capacityWindowMinutes,
    bufferMinutes: settings.bufferMinutes,
    availableStaff: settings.availableStaff.map((s) => ({ ...s })),
    availableEquipment: settings.availableEquipment.map((e) => ({ ...e })),
  };
}
