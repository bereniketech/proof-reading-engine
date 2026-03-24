import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

interface TopNavProps {
  onMenuToggle: () => void;
  title?: string;
}

function getDefaultTitle(pathname: string): string {
  if (pathname.startsWith('/editor/')) {
    return 'Editor';
  }

  if (pathname.startsWith('/insights/')) {
    return 'Insights';
  }

  if (pathname.startsWith('/profile')) {
    return 'Profile';
  }

  return 'Documents';
}

export function TopNav({ onMenuToggle, title }: TopNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <header
      className="glass"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        borderBottom: '1px solid var(--color-outline-variant)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0 1.5rem',
        minHeight: '3.75rem',
      }}
    >
      <button
        onClick={onMenuToggle}
        aria-label="Toggle menu"
        type="button"
        className="topnav-hamburger"
        style={{
          display: 'none',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-on-surface)',
          padding: 0,
          minWidth: '2.5rem',
          minHeight: '2.5rem',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined">menu</span>
      </button>

      <span className="font-display" style={{ fontWeight: 700, fontSize: '1rem', flex: 1, color: 'var(--color-on-surface)' }}>
        {title ?? getDefaultTitle(location.pathname)}
      </span>

      <button
        aria-label="Notifications"
        type="button"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: 0 }}
      >
        <span className="material-symbols-outlined">notifications</span>
      </button>
      <button
        aria-label="Settings"
        type="button"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: 0 }}
      >
        <span className="material-symbols-outlined">settings</span>
      </button>
      <button
        onClick={() => navigate('/dashboard')}
        type="button"
        className="gradient-editorial"
        style={{
          border: 'none',
          borderRadius: 'var(--radius-full)',
          padding: '0.5rem 1rem',
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.85rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          whiteSpace: 'nowrap',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
          add
        </span>
        New Document
      </button>
      <button
        onClick={() => void signOut()}
        type="button"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-on-surface-variant)',
          fontSize: '0.8rem',
          whiteSpace: 'nowrap',
        }}
      >
        Sign out
      </button>
    </header>
  );
}
