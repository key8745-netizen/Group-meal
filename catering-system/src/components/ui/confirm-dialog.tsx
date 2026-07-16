/**
 * confirm-dialog — 系統一致的確認對話框，取代原生 window.confirm。
 *
 * 提供 promise 版的 useConfirm：呼叫端保留原本的
 * `const ok = await confirm({...}); if (!ok) return;` 流程，只需在 JSX
 * 尾端渲染回傳的 `confirmDialog`。樣式沿用專案既有的 `fixed inset-0`
 * 疊層模式（見 PrepPlanDeductDialog），並支援多行說明（whitespace-pre-line）。
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  /** 說明文字，支援換行（\n）。 */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** destructive 時確認鈕轉為紅色（刪除/不可復原類）。 */
  tone?: 'default' | 'destructive';
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const CLOSED: ConfirmState = { open: false, title: '' };

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(CLOSED);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setState(CLOSED);
  }, []);

  const confirmDialog = state.open ? (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => settle(false)}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">{state.title}</h2>
          {state.description && (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {state.description}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={() => settle(false)}>
            {state.cancelLabel ?? '取消'}
          </Button>
          <Button
            type="button"
            variant={state.tone === 'destructive' ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {state.confirmLabel ?? '確認'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmDialog };
}
