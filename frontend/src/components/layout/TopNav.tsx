import { useEffect, useRef, useState } from 'react';
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
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notifOpen) return;
    const handleOutsideClick = (event: MouseEvent): void => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [notifOpen]);

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

      <div ref={notifRef} style={{ position: 'relative' }}>
        <button
          aria-label="Notifications"
          aria-haspopup="true"
          aria-expanded={notifOpen}
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: 0 }}
        >
          <span className="material-symbols-outlined">notifications</span>
        </button>
        {notifOpen && (
          <div
            role="region"
            aria-label="Notifications panel"
            style={{
              position: 'absolute',
              top: '2.5rem',
              right: 0,
              width: '18rem',
              background: 'var(--color-surface-container-lowest)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              padding: '1rem',
              zIndex: 100,
              fontSize: '0.85rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-on-surface)', fontSize: '0.9rem' }}>Notifications</span>
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                aria-label="Close notifications"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>
              </button>
            </div>
            <p style={{ textAlign: 'center', padding: '1rem 0' }}>No new notifications</p>
          </div>
        )}
      </div>
      <button
        aria-label="Settings"
        type="button"
        onClick={() => navigate('/profile')}
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
