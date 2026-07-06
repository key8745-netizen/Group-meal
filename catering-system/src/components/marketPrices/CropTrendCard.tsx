/**
 * CropTrendCard — Feature 037: 市價趨勢與採購時機建議
 *
 * Renders a single crop's 30-day price trend line chart plus its
 * buy-timing signal badge, for use on MarketPricePage.
 */

import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CropTrend } from '@/services/marketPriceTrendService';

const SIGNAL_META: Record<CropTrend['signal'], { label: string; className: string }> = {
  goodBuy: { label: '適合採購', className: 'bg-green-100 text-green-700' },
  wait: { label: '建議觀望', className: 'bg-amber-100 text-amber-700' },
  normal: { label: '價格平穩', className: 'bg-muted text-foreground' },
  noData: { label: '資料不足', className: 'bg-muted text-muted-foreground' },
};

function fmtMoney(n: number | null): string {
  return n != null ? `$${n.toFixed(2)}` : '—';
}

export function CropTrendCard({ trend }: { trend: CropTrend }) {
  const meta = SIGNAL_META[trend.signal];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{trend.cropName}</CardTitle>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
          {meta.label}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {trend.points.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
            尚無資料
          </div>
        ) : (
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip
                  formatter={(value) => [typeof value === 'number' ? `$${value.toFixed(2)}` : value, '均價']}
                  labelFormatter={(label) => `${label}`}
                  contentStyle={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                    padding: '6px 10px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgPrice"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          最新 {fmtMoney(trend.latestPrice)}
          {trend.latestDate ? `（${trend.latestDate}）` : ''}
          {' · '}近7日均 {fmtMoney(trend.sevenDayAvg)}
          {' · '}區間 {fmtMoney(trend.periodMin)} ~ {fmtMoney(trend.periodMax)}
        </div>
        <div className="text-xs text-muted-foreground">{trend.signalNote}</div>
      </CardContent>
    </Card>
  );
}
