import { cn } from '@/lib/utils';

export function ProgressRing({
  pct,
  size = 48,
  stroke = 4,
  className,
  showLabel = true,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  className?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} className={cn('shrink-0', className)}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        fill="none"
        className="stroke-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        className="stroke-primary transition-[stroke-dashoffset] duration-500"
        strokeDasharray={c}
        strokeDashoffset={c - (clamped / 100) * c}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {showLabel && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-foreground font-semibold"
          style={{ fontSize: size / 4.2 }}
        >
          {Math.round(clamped)}%
        </text>
      )}
    </svg>
  );
}

export function formatWatchTime(totalSec: number): string {
  if (totalSec < 60) return totalSec > 0 ? '<1m' : '0m';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
