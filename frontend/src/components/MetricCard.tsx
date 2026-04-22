import type { ReactNode, CSSProperties } from 'react';

interface MetricCardProps {
  icon?: string;         // Material Symbol name
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  glass?: boolean;
}

export function MetricCard({ icon, title, children, style, glass }: MetricCardProps){
  return (
    <div
      className={glass ? 'glass' : undefined}
      style={{
        background: glass ? undefined : 'var(--color-surface-container-lowest)',
        borderRadius: 'var(--radius-xl)', padding: '1.5rem',
        boxShadow: '0 2px 8px rgba(19,27,46,0.06)',
        display: 'flex', flexDirection: 'column', gap: '1rem',
        ...style,
      }}
    >
      {(icon || title) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {icon && (
            <div style={{
              width: '2.25rem', height: '2.25rem', borderRadius: '50%',
              background: 'var(--color-surface-container-highest)',
              display: 'grid', placeItems: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-tertiary)' }}>{icon}</span>
            </div>
          )}
          <h3 className="font-display" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}
