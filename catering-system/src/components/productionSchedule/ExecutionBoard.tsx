/**
 * Feature 107: 執行看板 — 烹飪中即時追蹤任務狀態。
 *
 * 狀態: pending → started → done（可重設）。
 * 進度存於 sessionStorage（key 由呼叫端提供，綁定當次排程），頁面重整不遺失。
 * 每 30 秒重算「現在偏移」，自動更新倒數與超時提示。
 * 不寫入 Firestore，無 schema 或 rules 異動。
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ScheduledTaskAssignment } from '@/services/types';

type TaskExecStatus = 'pending' | 'started' | 'done';
interface StoredState { status: TaskExecStatus; startedAt?: number }
type StateMap = Record<string, StoredState>;

interface Props {
  scheduledTasks: ScheduledTaskAssignment[];
  anchorISO: string;
  storageKey: string;
}

function clock(anchorISO: string, offsetMin: number): string {
  const t = new Date(new Date(anchorISO).getTime() + offsetMin * 60000);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

function loadStates(key: string): StateMap {
  try { return JSON.parse(sessionStorage.getItem(key) ?? '{}') as StateMap; } catch { return {}; }
}

export function ExecutionBoard({ scheduledTasks, anchorISO, storageKey }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [states, setStates] = useState<StateMap>(() => loadStates(storageKey));

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(states)); } catch {}
  }, [states, storageKey]);

  // Reset board if storageKey changed (different schedule loaded).
  useEffect(() => {
    setStates(loadStates(storageKey));
  }, [storageKey]);

  const anchorMs = new Date(anchorISO).getTime();
  const nowOffsetMin = (nowMs - anchorMs) / 60000;
  const nowLabel = clock(anchorISO, nowOffsetMin);
  const sorted = [...scheduledTasks].sort((a, b) => a.startOffsetMinutes - b.startOffsetMinutes);
  const doneCount = sorted.filter((t) => (states[t.taskId]?.status ?? 'pending') === 'done').length;
  const total = sorted.length;

  function setStatus(taskId: string, status: TaskExecStatus) {
    setStates((prev) => ({
      ...prev,
      [taskId]: status === 'started' ? { status, startedAt: Date.now() } : { status },
    }));
  }

  function statusOf(taskId: string): TaskExecStatus {
    return states[taskId]?.status ?? 'pending';
  }

  if (total === 0) return <p className="text-sm text-muted-foreground">沒有已排程的任務。</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Clock size={15} className="text-muted-foreground" />
          <span>現在 <span className="tabular-nums font-semibold">{nowLabel}</span></span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{doneCount}</span>/{total} 完成
          </span>
          {doneCount > 0 && (
            <button
              onClick={() => setStates({})}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              全部重設
            </button>
          )}
        </div>
      </div>

      {/* Progress track */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${(doneCount / total) * 100}%` }}
        />
      </div>

      {/* Task cards */}
      <div className="flex flex-col gap-2">
        {sorted.map((task) => {
          const status = statusOf(task.taskId);
          const isDone = status === 'done';
          const isStarted = status === 'started';
          const dur = task.endOffsetMinutes - task.startOffsetMinutes;
          const passive = dur - task.attentionMinutes;
          const overdueMin = Math.floor(nowOffsetMin - task.startOffsetMinutes);
          const untilMin = Math.ceil(task.startOffsetMinutes - nowOffsetMin);
          const overdue = !isDone && !isStarted && overdueMin > 0;

          let cardCls = 'rounded-lg border bg-card px-4 py-3 transition-colors';
          if (isDone) cardCls += ' opacity-55';
          else if (isStarted) cardCls += ' border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30';
          else if (overdue) cardCls += ' border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30';

          // Elapsed mins since "開始" was tapped (for started tasks)
          const startedAt = states[task.taskId]?.startedAt;
          const elapsedMin = startedAt ? Math.floor((nowMs - startedAt) / 60000) : 0;
          const attentionLeft = Math.max(0, task.attentionMinutes - elapsedMin);

          return (
            <div key={task.taskId} className={cardCls}>
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  ) : isStarted ? (
                    <PlayCircle size={18} className="text-blue-500" />
                  ) : overdue ? (
                    <AlertTriangle size={18} className="text-amber-500" />
                  ) : (
                    <div className="h-[18px] w-[18px] rounded-full border-2 border-muted-foreground/35" />
                  )}
                </div>

                {/* Task info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="tabular-nums text-sm font-semibold">
                      {clock(anchorISO, task.startOffsetMinutes)}
                    </span>
                    <span className={`truncate text-sm font-medium ${isDone ? 'text-muted-foreground line-through' : ''}`}>
                      {task.taskName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {task.attentionMinutes} 分{passive > 0 ? ` 顧 ＋ ${passive} 分免顧` : ''}
                    </span>
                  </div>

                  {/* Status line */}
                  {status === 'pending' && (
                    <p className={`mt-0.5 text-xs ${overdue ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      {overdue ? `⚠ 應 ${overdueMin} 分鐘前開始` : untilMin <= 0 ? '即將開始' : `再 ${untilMin} 分鐘開始`}
                    </p>
                  )}
                  {status === 'started' && (
                    <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
                      進行中 {elapsedMin} 分鐘
                      {attentionLeft > 0
                        ? `｜還需顧 ${attentionLeft} 分`
                        : passive > 0
                        ? '｜已進入免顧階段，可做其他事'
                        : ''}
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(task.taskId, 'started')}>
                      開始
                    </Button>
                  )}
                  {status === 'started' && (
                    <>
                      <Button size="sm" onClick={() => setStatus(task.taskId, 'done')}>
                        完成
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setStatus(task.taskId, 'pending')}>
                        取消
                      </Button>
                    </>
                  )}
                  {status === 'done' && (
                    <button
                      onClick={() => setStatus(task.taskId, 'pending')}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      重設
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {doneCount === total && total > 0 && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
          🎉 所有任務已完成！
        </div>
      )}
    </div>
  );
}
