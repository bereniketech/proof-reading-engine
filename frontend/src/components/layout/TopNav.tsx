import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

interface TopNavProps {
  onMenuToggle: () => void;
  title?: string;
}

function getDefaultTitle(pathname: string): string {
  if (pathname.startsWith('/editor/')) return 'Editor';
  if (pathname.startsWith('/insights/')) return 'Insights';
  if (pathname.startsWith('/profile')) return 'Profile';
  return 'Documents';
}

function getInitial(email: string): string {
  return email.charAt(0).toUpperCase();
}

export function TopNav({ onMenuToggle, title }: TopNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  const initial = session?.user?.email ? getInitial(session.user.email) : '?';

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


      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
          style={{
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: '50%',
            border: '2px solid var(--color-outline-variant)',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))',
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: 'Manrope, sans-serif',
          }}
        >
          {initial}
        </button>

        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.5rem)',
              right: 0,
              minWidth: '11rem',
              background: 'var(--color-surface-container-lowest)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              overflow: 'hidden',
              zIndex: 100,
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); navigate('/profile'); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--color-on-surface)',
                textAlign: 'left',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-on-surface-variant)' }}>person</span>
              Profile
            </button>
            <div style={{ height: '1px', background: 'var(--color-outline-variant)', margin: '0 0.75rem' }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); void signOut(); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--color-error)',
                textAlign: 'left',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>logout</span>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
