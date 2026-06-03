import type { ConfidenceLevel } from '@/types/aiBoundary';

interface Props {
  level: ConfidenceLevel;
  className?: string;
}

const CONFIG: Record<ConfidenceLevel, { label: string; className: string }> = {
  HIGH:    { label: '高信心', className: 'bg-green-100 text-green-800 border-green-300' },
  MEDIUM:  { label: '中信心', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  LOW:     { label: '低信心', className: 'bg-orange-100 text-orange-800 border-orange-300' },
  BLOCKED: { label: '已阻擋', className: 'bg-red-100 text-red-800 border-red-300' },
};

export function AISuggestionConfidenceBadge({ level, className = '' }: Props) {
  const { label, className: colorClass } = CONFIG[level];
  return (
    <span
      data-testid="confidence-badge"
      data-level={level}
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${colorClass} ${className}`}
    >
      {label}
    </span>
  );
}
