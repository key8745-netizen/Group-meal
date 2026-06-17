import { useState, useCallback } from 'react';
import { parseCsvText } from '@/services/menuImportService';
import { Button } from '@/components/ui/button';

interface Props {
  onParsed: (csvText: string, headers: string[]) => void;
}

export function CsvUploadStep({ onParsed }: Props) {
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handlePreview = useCallback(() => {
    const result = parseCsvText(csvText);
    setHeaders(result.headers);
    setErrors(result.errors);
  }, [csvText]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      const result = parseCsvText(text);
      setHeaders(result.headers);
      setErrors(result.errors);
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">僅支援 CSV（UTF-8）。請貼上內容或上傳檔案。</p>
      <input
        type="file"
        accept=".csv,text/csv"
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

      {headers.length > 0 && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">偵測到欄位：</p>
          <div className="flex flex-wrap gap-2">
            {headers.map((h) => (
              <span key={h} className="rounded bg-muted px-2 py-1 text-xs">{h}</span>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => onParsed(csvText, headers)}>
              下一步：欄位對應
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
