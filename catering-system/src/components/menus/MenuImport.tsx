/**
 * MenuImport — two modes:
 *   1. Excel / CSV upload: parse rows → preview → save mealPlans to Firestore
 *   2. Photo upload: send image to Netlify /api/ocr-menu → AI extracts menu → preview → save
 *
 * Expected Excel/CSV format (one row per day):
 *   Column A  日期  e.g. 2024-01-15  or  1/15
 *   Column B  人數  e.g. 360
 *   Column C+ 菜色  dish name (as many columns as needed)
 *
 * The import will fuzzy-match dish names against existing menus in Firestore.
 * Unmatched names are shown as warnings but don't block the import.
 */

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Camera, FileSpreadsheet, AlertTriangle, Check, X } from 'lucide-react';
import type { Menu } from '@/services/types';
import { dishService, mealPlanService } from '@/services/mealPlanService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  date:      string;          // ISO YYYY-MM-DD
  headCount: number;
  dishNames: string[];        // raw names from the file
  menuIds:   string[];        // matched IDs
  unmatched: string[];        // names that couldn't be matched
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDate(raw: string | number, year?: number): string | null {
  if (typeof raw === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D or MM/DD with optional year
  const parts = s.split(/[\/\-]/);
  if (parts.length === 2) {
    const y = year ?? new Date().getFullYear();
    return `${y}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  if (parts.length === 3) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return null;
}

function matchDish(name: string, dishes: Menu[]): Menu | undefined {
  const n = name.trim();
  return dishes.find((d) => d.name === n) ??
    dishes.find((d) => d.name.includes(n) || n.includes(d.name));
}

function parseSheet(wb: XLSX.WorkBook, dishes: Menu[]): ParsedRow[] {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });
  const curYear = new Date().getFullYear();
  const result: ParsedRow[] = [];

  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const dateRaw = row[0];
    const date    = normalizeDate(dateRaw as string | number, curYear);
    if (!date) continue;

    const headCount   = parseInt(String(row[1]), 10) || 360;
    const dishColumns = (row as (string | number)[]).slice(2)
      .map((c) => String(c ?? '').trim())
      .filter(Boolean);

    if (dishColumns.length === 0) continue;

    const menuIds:   string[] = [];
    const unmatched: string[] = [];
    dishColumns.forEach((name) => {
      const match = matchDish(name, dishes);
      if (match) menuIds.push(match.id);
      else unmatched.push(name);
    });

    result.push({ date, headCount, dishNames: dishColumns, menuIds, unmatched });
  }

  return result;
}

// Resize image to ≤ 1200px wide, JPEG quality 0.75, to stay under Netlify's 6MB limit
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX  = 1200;
      const scale = img.width > MAX ? MAX / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Preview table ────────────────────────────────────────────────────────────

function PreviewTable({ rows }: { rows: ParsedRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left">日期</th>
            <th className="px-3 py-2 text-right">人數</th>
            <th className="px-3 py-2 text-left">菜色（已匹配）</th>
            <th className="px-3 py-2 text-left">未匹配</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.date} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
              <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.headCount}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {r.menuIds.length > 0
                    ? r.dishNames
                        .filter((n) => !r.unmatched.includes(n))
                        .map((n, j) => <Badge key={j} variant="secondary" className="text-xs">{n}</Badge>)
                    : <span className="text-muted-foreground text-xs">—</span>}
                </div>
              </td>
              <td className="px-3 py-2">
                {r.unmatched.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.unmatched.map((n, j) => (
                      <Badge key={j} variant="outline" className="border-amber-400 text-amber-700 text-xs gap-1">
                        <AlertTriangle size={9} /> {n}
                      </Badge>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MenuImport ───────────────────────────────────────────────────────────────

export function MenuImport() {
  const [mode,     setMode]     = useState<'excel' | 'photo'>('excel');
  const [dishes,   setDishes]   = useState<Menu[]>([]);
  const [preview,  setPreview]  = useState<ParsedRow[] | null>(null);
  const [imgSrc,   setImgSrc]   = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const fileRef  = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dishService.list().then(setDishes).catch(() => {});
  }, []);

  // ── Excel handler ────────────────────────────────────────────────────────

  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array', cellDates: true });
      const rows = parseSheet(wb, dishes);
      if (rows.length === 0) {
        toast({ variant: 'destructive', title: '找不到有效資料', description: '請確認檔案格式：A欄日期、B欄人數、C欄以後菜色名稱。' });
      } else {
        setPreview(rows);
      }
    } catch {
      toast({ variant: 'destructive', title: '檔案解析失敗' });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  // ── Photo handler ────────────────────────────────────────────────────────

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setImgSrc(null);
    try {
      const dataUrl  = await compressImage(file);
      setImgSrc(dataUrl);

      const base64   = dataUrl.split(',')[1];
      const res      = await fetch('/.netlify/functions/ocr-menu', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageBase64: base64 }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data: { rows: { date: string; headCount: number; dishes: string[] }[] } = await res.json();

      const parsed: ParsedRow[] = data.rows.map((r) => {
        const menuIds:   string[] = [];
        const unmatched: string[] = [];
        r.dishes.forEach((name) => {
          const m = matchDish(name, dishes);
          if (m) menuIds.push(m.id);
          else unmatched.push(name);
        });
        return { date: r.date, headCount: r.headCount, dishNames: r.dishes, menuIds, unmatched };
      });

      setPreview(parsed);
    } catch (err) {
      toast({
        variant: 'destructive',
        title:   '照片辨識失敗',
        description: err instanceof Error ? err.message : '請確認已設定 ANTHROPIC_API_KEY 環境變數。',
      });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  // ── Save confirmed rows ──────────────────────────────────────────────────

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    let saved = 0;
    try {
      for (const row of preview) {
        if (row.menuIds.length > 0) {
          await mealPlanService.save({
            date:      row.date,
            headCount: row.headCount,
            menuIds:   row.menuIds,
          });
          saved++;
        }
      }
      toast({ title: '匯入完成', description: `共儲存 ${saved} 天的菜單排程。` });
      setPreview(null);
      setImgSrc(null);
    } catch {
      toast({ variant: 'destructive', title: '部分儲存失敗' });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Upload size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">匯入菜單</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            上傳 Excel/CSV，或拍攝紙本菜單照片，AI 自動辨識後存入排程。
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        {([['excel', FileSpreadsheet, 'Excel / CSV'], ['photo', Camera, '拍照上傳']] as const).map(
          ([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => { setMode(key); setPreview(null); setImgSrc(null); }}
              className={[
                'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                mode === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <Icon size={14} /> {label}
            </button>
          ),
        )}
      </div>

      {/* ── Excel mode ───────────────────────────────────────────────────── */}
      {mode === 'excel' && (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-3">
            <FileSpreadsheet size={36} className="mx-auto text-muted-foreground/60" />
            <div>
              <p className="text-sm font-medium">點此上傳 Excel 或 CSV 檔案</p>
              <p className="text-xs text-muted-foreground mt-1">
                格式：A欄＝日期、B欄＝人數、C欄以後＝菜色名稱
              </p>
            </div>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={loading}>
              {loading ? '解析中…' : '選擇檔案'}
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcel} />
          </div>

          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium">範例格式</p>
            <pre className="font-mono">{`日期       人數  菜色1     菜色2     菜色3
2024-01-15  360  白米飯    番茄炒蛋  炒高麗菜
2024-01-16  360  白米飯    滷肉      炒青菜`}</pre>
          </div>
        </div>
      )}

      {/* ── Photo mode ───────────────────────────────────────────────────── */}
      {mode === 'photo' && (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-3">
            <Camera size={36} className="mx-auto text-muted-foreground/60" />
            <div>
              <p className="text-sm font-medium">上傳紙本菜單照片</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI（Claude Vision）自動辨識菜色與日期
              </p>
            </div>
            <Button variant="outline" onClick={() => photoRef.current?.click()} disabled={loading}>
              {loading ? 'AI 辨識中…' : '選擇照片'}
            </Button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          {imgSrc && (
            <div className="overflow-hidden rounded-lg border">
              <img src={imgSrc} alt="上傳的菜單" className="max-h-64 w-full object-contain" />
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              <p className="text-xs text-center text-muted-foreground">AI 正在辨識菜單內容…</p>
            </div>
          )}
        </div>
      )}

      {/* ── Preview & confirm ─────────────────────────────────────────────── */}
      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">預覽（共 {preview.length} 天）</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPreview(null); setImgSrc(null); }} className="gap-1">
                <X size={13} /> 取消
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                <Check size={13} /> {saving ? '儲存中…' : '確認匯入'}
              </Button>
            </div>
          </div>

          {preview.some((r) => r.unmatched.length > 0) && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
              <AlertTriangle size={13} />
              橘色標籤的菜色在系統中找不到對應記錄，不會被匯入。請先到「菜色管理」新增該菜色。
            </div>
          )}

          <PreviewTable rows={preview} />
        </div>
      )}

      <Toaster />
    </div>
  );
}
