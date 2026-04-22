import { useLocation, useNavigate } from 'react-router-dom';

const LAST_EDITOR_PATH_KEY = 'editorial.lastEditorPath';
const LAST_INSIGHTS_PATH_KEY = 'editorial.lastInsightsPath';

type BottomNavItem = {
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

function getBottomNavItems(pathname: string): BottomNavItem[] {
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
      href: pathname.startsWith('/editor/') ? pathname : getStoredPath(LAST_EDITOR_PATH_KEY) ?? '/editor',
      isActive: (currentPathname) => currentPathname.startsWith('/editor'),
    },
    {
      icon: 'bar_chart',
      label: 'Insights',
      href: pathname.startsWith('/insights/') ? pathname : getStoredPath(LAST_INSIGHTS_PATH_KEY) ?? '/insights',
      isActive: (currentPathname) => currentPathname.startsWith('/insights'),
    },
    {
      icon: 'person',
      label: 'Profile',
      href: '/profile',
      isActive: (currentPathname) => currentPathname.startsWith('/profile'),
    },
  ];
}

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = getBottomNavItems(location.pathname);

  return (
    <nav
      className="bottom-nav"
      aria-label="Mobile"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--color-surface-container-lowest)',
        borderTop: '1px solid var(--color-outline-variant)',
        display: 'flex',
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {navItems.map((item) => {
        const isActive = item.isActive(location.pathname);

        return (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.href)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.625rem 0',
              border: 'none',
              cursor: 'pointer',
              background: isActive ? 'var(--color-surface-container-highest)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              fontSize: '0.65rem',
              fontWeight: isActive ? 600 : 500,
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '1.4rem',
                fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {item.icon}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
