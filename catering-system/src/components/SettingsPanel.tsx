import { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import { configService, type SystemSettings } from '@/services/configService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

interface SettingsPanelProps {
  tenantId: string;
}

// ── Field descriptors ─────────────────────────────────────────────────────────

interface FieldMeta {
  key:         keyof SystemSettings;
  label:       string;
  description: string;
  unit:        '%' | '文字';
  min?:        number;
  max?:        number;
  step?:       number;
}

const FIELDS: FieldMeta[] = [
  {
    key:         'tenantName',
    label:       '機構名稱',
    description: '顯示在報表與通知中的名稱。',
    unit:        '文字',
  },
  {
    key:         'profitMarginThreshold',
    label:       '毛利警示門檻',
    description: '整體毛利率低於此值時，系統會觸發低毛利 ALERT。',
    unit:        '%',
    min:         1,
    max:         99,
    step:        1,
  },
  {
    key:         'wasteFactorWarning',
    label:       '損耗預警門檻',
    description: '菜單食材的損耗率超過此值時，系統會建議優化備料流程。',
    unit:        '%',
    min:         1,
    max:         99,
    step:        1,
  },
  {
    key:         'defaultSafetyBuffer',
    label:       '預設安全緩衝',
    description: '採購建議在安全水位上額外加購的比例。',
    unit:        '%',
    min:         0,
    max:         50,
    step:        1,
  },
];

// ── Conversion helpers (stored as decimal 0–1, displayed as %) ───────────────

function toDisplay(key: keyof SystemSettings, value: number | string): string {
  if (key === 'tenantName') return value as string;
  return String(Math.round((value as number) * 100));
}

function toStored(key: keyof SystemSettings, raw: string): number | string {
  if (key === 'tenantName') return raw;
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : Math.round(n) / 100;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsPanel({ tenantId }: SettingsPanelProps) {
  const [settings, setSettings]   = useState<SystemSettings | null>(null);
  const [displayVals, setDisplay] = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [dirty, setDirty]         = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    configService.getSettings(tenantId)
      .then((s) => {
        setSettings(s);
        setDisplay(
          Object.fromEntries(
            FIELDS.map((f) => [f.key, toDisplay(f.key, s[f.key] as number | string)]),
          ),
        );
      })
      .catch(() => toast({ variant: 'destructive', title: '載入設定失敗', description: '請稍後再試。' }))
      .finally(() => setLoading(false));
  }, [tenantId]);

  // ── Change handler ────────────────────────────────────────────────────────

  function handleChange(key: keyof SystemSettings, raw: string) {
    setDisplay((prev) => ({ ...prev, [key]: raw }));
    setDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;

    // Validate: all numeric fields must be positive numbers
    for (const f of FIELDS) {
      if (f.unit === '%') {
        const n = parseFloat(displayVals[f.key]);
        if (isNaN(n) || n < (f.min ?? 0) || n > (f.max ?? 100)) {
          toast({
            variant: 'destructive',
            title:   '數值無效',
            description: `${f.label} 必須介於 ${f.min ?? 0}% 至 ${f.max ?? 100}%。`,
          });
          return;
        }
      }
    }

    const updated: SystemSettings = { ...settings };
    for (const f of FIELDS) {
      (updated as unknown as Record<string, unknown>)[f.key] = toStored(f.key, displayVals[f.key]);
    }

    setSaving(true);
    try {
      await configService.updateSettings(tenantId, updated);
      setSettings(updated);
      setDirty(false);
      toast({ title: '設定已儲存' });
    } catch {
      toast({ variant: 'destructive', title: '儲存失敗', description: '請稍後再試。' });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">系統設定</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            調整診斷閾值與機構基本資訊。
          </p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSave}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">閾值與基本資訊</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

              {FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5 sm:grid-cols-[1fr_200px] sm:items-start">

                  {/* Label + description */}
                  <div>
                    <label
                      htmlFor={f.key}
                      className="text-sm font-medium leading-none"
                    >
                      {f.label}
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.description}
                    </p>
                  </div>

                  {/* Input */}
                  <div className="relative">
                    <Input
                      id={f.key}
                      type={f.unit === '%' ? 'number' : 'text'}
                      inputMode={f.unit === '%' ? 'numeric' : 'text'}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={displayVals[f.key] ?? ''}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      className={f.unit === '%' ? 'pr-7 text-right tabular-nums' : ''}
                    />
                    {f.unit === '%' && (
                      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                        %
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Divider + actions */}
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  {dirty ? '有未儲存的變更' : '目前已是最新狀態'}
                </p>
                <Button type="submit" disabled={saving || !dirty} className="gap-2">
                  <Save size={14} />
                  {saving ? '儲存中…' : '儲存'}
                </Button>
              </div>

            </CardContent>
          </Card>
        </form>
      )}

      <Toaster />
    </div>
  );
}
