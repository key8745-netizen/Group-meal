import { useState } from 'react';
import type { ColumnMapping } from '@/services/menuImportService';
import { Button } from '@/components/ui/button';

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '不對應' },
  { value: 'date', label: '日期' },
  { value: 'mealType', label: '餐別' },
  { value: 'staple', label: '主食' },
  { value: 'mainDish', label: '主菜' },
  { value: 'sideDish', label: '副菜' },
  { value: 'soup', label: '湯品' },
  { value: 'snack', label: '點心' },
  { value: 'fruit', label: '水果' },
  { value: 'other', label: '其他' },
];

interface Props {
  headers: string[];
  onSubmit: (mapping: ColumnMapping) => void;
}

export function ColumnMappingForm({ headers, onSubmit }: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const hasDate = Object.values(mapping).includes('date');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">將 CSV 欄位對應到系統角色（至少需對應「日期」）。</p>
      <div className="space-y-2">
        {headers.map((h) => (
          <div key={h} className="flex items-center gap-3">
            <span className="w-32 truncate text-sm font-medium" title={h}>{h}</span>
            <select
              className="rounded-md border px-2 py-1 text-sm"
              value={mapping[h] ?? ''}
              onChange={(e) =>
                setMapping((prev) => ({ ...prev, [h]: e.target.value }))
              }
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!hasDate}
          onClick={() => {
            const cleaned: ColumnMapping = {};
            Object.entries(mapping).forEach(([h, role]) => {
              if (role) cleaned[h] = role;
            });
            onSubmit(cleaned);
          }}
        >
          建立暫存批次
        </Button>
      </div>
    </div>
  );
}
