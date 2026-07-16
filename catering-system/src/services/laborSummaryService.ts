/**
 * laborSummaryService — Feature 065: 人力工時彙總（純函式，無 Firestore）。
 *
 * 製程任務各有 estimatedMinutes（隨備料 kg 縮放，kg 又隨人數縮放）與
 * staffRole / staffCount。此純函式把「進行中（active）」任務彙總成總人力
 * （人·分）與分角色明細；再由 estimateCompletionMinutes 依現場人數粗估
 * 完成時間，方便判斷「今天要幾個人、大概幾點備得完」。人數為可手動調整的
 * 規劃參數，非硬性排程。
 */

export interface LaborTaskInput {
  estimatedMinutes: number;
  staffRole?: string;
  staffCount?: number;
  taskStatus?: 'active' | 'archived';
}

export interface LaborRoleSummary {
  role: string;
  /** 人·分鐘（estimatedMinutes × staffCount 加總）。 */
  minutes: number;
  taskCount: number;
}

export interface LaborSummary {
  /** 總人力（人·分鐘）。 */
  totalMinutes: number;
  taskCount: number;
  /** 依人力由多到少排序。 */
  byRole: LaborRoleSummary[];
}

/** 彙總進行中任務的人力（archived 不計；estimatedMinutes × staffCount 為人·分）。 */
export function summarizeLabor(tasks: LaborTaskInput[]): LaborSummary {
  let totalMinutes = 0;
  let taskCount = 0;
  const byRoleMap = new Map<string, { minutes: number; taskCount: number }>();

  for (const t of tasks) {
    if (t.taskStatus === 'archived') continue;
    const minutes = Math.max(0, t.estimatedMinutes) * Math.max(1, t.staffCount ?? 1);
    if (minutes <= 0) continue;
    totalMinutes += minutes;
    taskCount++;
    const role = (t.staffRole ?? '').trim() || '未指定';
    const cur = byRoleMap.get(role) ?? { minutes: 0, taskCount: 0 };
    cur.minutes += minutes;
    cur.taskCount++;
    byRoleMap.set(role, cur);
  }

  const byRole = [...byRoleMap.entries()]
    .map(([role, v]) => ({ role, minutes: v.minutes, taskCount: v.taskCount }))
    .sort((a, b) => b.minutes - a.minutes);

  return { totalMinutes, taskCount, byRole };
}

/**
 * 依現場同時作業人數，粗估完成時間（分鐘）＝ ceil(總人·分 / 人數)。
 * 假設可平均分攤、忽略任務相依與角色限制，僅供規劃參考。
 */
export function estimateCompletionMinutes(totalMinutes: number, staffCount: number): number {
  const n = Math.max(1, Math.floor(staffCount));
  return Math.ceil(Math.max(0, totalMinutes) / n);
}
