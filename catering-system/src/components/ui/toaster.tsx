import { useToasts } from '@/hooks/use-toast';

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={[
            'min-w-72 max-w-sm rounded-lg border p-4 shadow-lg',
            t.variant === 'destructive'
              ? 'border-destructive/50 bg-destructive text-destructive-foreground'
              : 'border bg-background text-foreground',
          ].join(' ')}
        >
          {t.title && <p className="text-sm font-semibold">{t.title}</p>}
          {t.description && (
            <p className="mt-1 whitespace-pre-line text-xs opacity-90">{t.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
