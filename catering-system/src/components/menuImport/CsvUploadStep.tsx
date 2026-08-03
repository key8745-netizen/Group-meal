import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { parseCsvText } from '@/services/menuImportService';
import { isWideMonthlyMenuTemplate, parseWideMonthlyMenuTemplate } from '@/services/wideMenuTemplateParser';
import { Button } from '@/components/ui/button';

interface Props {
  onParsed: (csvText: string, headers: string[], sourceFileName: string, preParseWarningCount: number) => void;
}

/**
 * Upper bound on an uploaded menu file. A monthly menu template is tens of KB;
 * 10 MB is generous. This bounds the work handed to `xlsx@0.18.5`, which still
 * carries GHSA-5pgg-2g8v-p4x9 (ReDoS, fixed in ≥ 0.20.2) and
 * GHSA-4r6h-8v6p-xvw6 (prototype pollution, fixed in ≥ 0.19.3) — neither fix is
 * on the npm registry, since SheetJS publishes to its own CDN. See CLAUDE.md
 * 「xlsx 相依」 for the upgrade command.
 *
 * A size cap is not a fix for either CVE; it just keeps a hostile file from
 * also being huge. The real containment here is that this parser only ever runs
 * client-side, in the allowlisted operator's own browser, on a file they chose.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function CsvUploadStep({ onParsed }: Props) {
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [sourceFileName, setSourceFileName] = useState('貼上內容');

  const handlePreview = useCallback(() => {
    const result = parseCsvText(csvText);
    setHeaders(result.headers);
    setErrors(result.errors);
  }, [csvText]);

  const handleCsvFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setErrors(['讀取檔案失敗，請確認檔案未損毀']);
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      setWarnings([]);
      setSourceFileName(file.name);
      const result = parseCsvText(text);
      setHeaders(result.headers);
      setErrors(result.errors);
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  const handleExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setErrors(['讀取檔案失敗，請確認檔案未損毀']);
    reader.onload = () => {
      // Previously unguarded: anything thrown in here (a corrupt or hostile
      // workbook makes XLSX.read throw) escaped as an unhandled error inside the
      // FileReader callback, so the UI just silently did nothing.
      try {
        const data = reader.result as ArrayBuffer;
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetName = workbook.SheetNames[0];
        const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
        if (!sheet) {
          setErrors(['這個 Excel 檔沒有任何工作表']);
          setHeaders([]);
          setWarnings([]);
          return;
        }

        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

        if (!isWideMonthlyMenuTemplate(matrix)) {
          setErrors(['未偵測到橫向月菜單版型（需含民國年月標題列與「日期」欄），請改用 CSV 上傳']);
          setHeaders([]);
          setWarnings([]);
          return;
        }

        const result = parseWideMonthlyMenuTemplate(matrix);
        setCsvText(result.csvText);
        setHeaders(result.headers);
        setErrors([]);
        setWarnings(result.warnings);
        setSourceFileName(file.name);
      } catch (err) {
        console.error('Excel 解析失敗:', err);
        setErrors(['無法解析這個 Excel 檔，請確認格式正確，或改用 CSV 上傳']);
        setHeaders([]);
        setWarnings([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        setErrors([`檔案過大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限為 ${MAX_FILE_BYTES / 1024 / 1024} MB`]);
        setHeaders([]);
        setWarnings([]);
        return;
      }

      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        handleExcelFile(file);
      } else {
        handleCsvFile(file);
      }
    },
    [handleExcelFile, handleCsvFile],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        支援 CSV（UTF-8）貼上/上傳，或上傳橫向月菜單 .xls / .xlsx 範本檔（含民國年月標題列）。
      </p>
      <input
        type="file"
        accept=".csv,text/csv,.xls,.xlsx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="text-sm"
      />
      <textarea
        className="w-full h-40 rounded-md border px-3 py-2 text-sm font-mono"
        placeholder="或將 CSV 內容貼於此處"
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
      />
      <Button type="button" size="sm" onClick={handlePreview} disabled={!csvText.trim()}>
        預覽欄位
      </Button>

      {errors.length > 0 && (
        <ul className="text-xs text-destructive list-disc pl-4 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="text-xs text-amber-600 list-disc pl-4 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {headers.length > 0 && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">偵測到欄位：</p>
          <div className="flex flex-wrap gap-2">
            {headers.map((h) => (
              <span key={h} className="rounded bg-muted px-2 py-1 text-xs">{h}</span>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => onParsed(csvText, headers, sourceFileName, warnings.length)}>
              下一步：欄位對應
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
