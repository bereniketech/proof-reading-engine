interface ProgressBarProps {
  label: string;
  value: number;         // 0–100
  color?: string;        // CSS color string, defaults to primary
  showValue?: boolean;
}

export function ProgressBar({ label, value, color, showValue = true }: ProgressBarProps){
  const trackColor = color ?? 'var(--color-primary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>{label}</span>
        {showValue && <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{value}%</span>}
      </div>
      <div style={{ height: '0.5rem', borderRadius: 'var(--radius-full)', background: 'var(--color-surface-container-highest)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 'var(--radius-full)',
          background: trackColor,
          width: `${Math.max(0, Math.min(100, value))}%`,
          transition: 'width 0.6s ease-out',
        }} />
      </div>
    </div>
  );
}
