import type { MatchStatus } from '@/services/types';

interface Props {
  value: MatchStatus | 'all';
  counts: Record<MatchStatus, number>;
  onChange: (value: MatchStatus | 'all') => void;
}

const OPTIONS: { key: MatchStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unmatched', label: '未比對' },
  { key: 'pending_review', label: '待審核' },
  { key: 'mapped', label: '已對應' },
  { key: 'unresolved', label: '比對失敗' },
  { key: 'rejected', label: '已拒絕' },
];

export function MatchStatusFilterBar({ value, counts, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={[
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors border',
            value === key ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {label}{key !== 'all' ? `（${counts[key] ?? 0}）` : ''}
        </button>
      ))}
    </div>
  );
}
