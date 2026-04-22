import { useLocation, useNavigate } from 'react-router-dom';

const LAST_EDITOR_PATH_KEY = 'editorial.lastEditorPath';
const LAST_INSIGHTS_PATH_KEY = 'editorial.lastInsightsPath';

interface SidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type NavItem = {
  icon: string;
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
};

function getStoredPath(storageKey: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(storageKey);
}

function getNavItems(pathname: string): NavItem[] {
  return [
    {
      icon: 'description',
      label: 'Documents',
      href: '/dashboard',
      isActive: (currentPathname) => currentPathname === '/dashboard',
    },
    {
      icon: 'edit_note',
      label: 'Editor',
      href: pathname.startsWith('/editor/') ? pathname : getStoredPath(LAST_EDITOR_PATH_KEY) ?? '/dashboard',
      isActive: (currentPathname) => currentPathname.startsWith('/editor/'),
    },
    {
      icon: 'bar_chart',
      label: 'Insights',
      href: pathname.startsWith('/insights/') ? pathname : getStoredPath(LAST_INSIGHTS_PATH_KEY) ?? '/dashboard',
      isActive: (currentPathname) => currentPathname.startsWith('/insights/'),
    },
    {
      icon: 'person',
      label: 'Profile',
      href: '/profile',
      isActive: (currentPathname) => currentPathname.startsWith('/profile'),
    },
  ];
}

export function Sidebar({ onNavigate, collapsed = false, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = getNavItems(location.pathname);

  const width = collapsed ? '4.5rem' : '16rem';

  return (
    <aside
      style={{
        width,
        minHeight: '100vh',
        background: 'var(--color-surface-container-low)',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '1.5rem 0.75rem' : '1.5rem 1rem',
        gap: '0.5rem',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 40,
        boxShadow: '0 16px 40px var(--color-shadow-card)',
        transition: 'width var(--duration-fast), padding var(--duration-fast)',
        overflow: 'visible',
      }}
    >
      {/* Logo row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '2rem',
          justifyContent: collapsed ? 'center' : 'flex-start',
          overflow: 'hidden',
        }}
      >
        <img
          src="/favicon.png"
          alt="Editorial Intelligence"
          style={{ width: '3rem', height: '3rem', borderRadius: 'var(--radius-xl)', flexShrink: 0 }}
        />
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div className="font-display" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
              AI Curator
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', letterSpacing: '0.05rem' }}>v2.4</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }} aria-label="Primary">
        {navItems.map((item) => {
          const isActive = item.isActive(location.pathname);

          return (
            <button
              key={item.label}
              type="button"
              title={collapsed ? item.label : undefined}
              onClick={() => {
                navigate(item.href);
                onNavigate?.();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '0.75rem',
                padding: '0.625rem 0.875rem',
                borderRadius: 'var(--radius-lg)',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                background: isActive ? 'var(--color-surface-container-highest)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.9rem',
                transition: 'background var(--duration-fast), color var(--duration-fast)',
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {item.icon}
              </span>
              {!collapsed && item.label}
            </button>
          );
        })}
      </nav>

      {/* Upgrade card — hidden when collapsed */}
      {!collapsed && (
        <div
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-xl)',
            background: 'var(--color-surface-container-highest)',
            fontSize: '0.8rem',
            color: 'var(--color-on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.25rem' }}>Upgrade to Pro</div>
          <div>Unlock unlimited documents and advanced analytics.</div>
        </div>
      )}

      {/* Collapse toggle — mounted on the right edge, vertically centred */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            position: 'absolute',
            top: '50%',
            right: '-1rem',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1.25rem',
            height: '3rem',
            borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
            border: '1px solid var(--color-outline-variant)',
            borderLeft: 'none',
            cursor: 'pointer',
            background: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
            boxShadow: '2px 0 6px rgba(0,0,0,0.08)',
            zIndex: 41,
            transition: 'background var(--duration-fast), color var(--duration-fast)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container-highest)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container-low)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-on-surface-variant)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      )}
    </aside>
  );
}
