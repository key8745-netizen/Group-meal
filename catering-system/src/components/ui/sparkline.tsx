/**
 * Sparkline — 極簡內嵌 SVG 折線圖（無外部套件）。
 *
 * 用於食材主檔的市價近況小圖（Feature 063）。單一數列，等距 x，
 * 依 min/max 正規化 y。少於兩點時不畫線（改由呼叫端顯示文字）。
 */

interface Props {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  /** 折線顏色（預設沿用 currentColor，可由外層 text-* 控制）。 */
  stroke?: string;
}

export function Sparkline({ values, width = 120, height = 28, className, stroke = 'currentColor' }: Props) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    // y 反轉：高價在上
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = points[points.length - 1].split(',');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="市價走勢"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill={stroke} />
    </svg>
  );
}
