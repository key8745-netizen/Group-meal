import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { parseCsvText } from '@/services/menuImportService';
import { isWideMonthlyMenuTemplate, parseWideMonthlyMenuTemplate } from '@/services/wideMenuTemplateParser';
import { Button } from '@/components/ui/button';

interface Props {
  onParsed: (csvText: string, headers: string[], sourceFileName: string, preParseWarningCount: number) => void;
}

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
    reader.onload = () => {
      const data = reader.result as ArrayBuffer;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
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
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFile = useCallback(
    (file: File) => {
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
