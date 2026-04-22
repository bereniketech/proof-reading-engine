interface CircularProgressProps {
  value: number;      // 0–100
  size?: number;      // px, default 96
  strokeWidth?: number; // default 8
  color?: string;     // default tertiary-fixed
}

export function CircularProgress({ value, size = 96, strokeWidth = 8, color }: CircularProgressProps){
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const trackColor = color ?? 'var(--color-tertiary-fixed)';
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-label={`${value}%`}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--color-surface-container-highest)" strokeWidth={strokeWidth} />
      {/* Fill */}
      <circle
        cx={cx} cy={cy} r={radius} fill="none"
        stroke={trackColor} strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
      {/* Center text — rotate back to upright */}
      <text
        x={cx} y={cy}
        textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px`, fontSize: `${size * 0.22}px`, fontWeight: 800, fill: 'var(--color-on-surface)', fontFamily: 'Manrope, sans-serif' }}
      >
        {value}%
      </text>
    </svg>
  );
}
