import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TopNav } from './TopNav.tsx';

const LAST_EDITOR_PATH_KEY = 'editorial.lastEditorPath';
const LAST_INSIGHTS_PATH_KEY = 'editorial.lastInsightsPath';

function storeLastVisitedPath(pathname: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (pathname.startsWith('/editor/')) {
    window.localStorage.setItem(LAST_EDITOR_PATH_KEY, pathname);
  }

  if (pathname.startsWith('/insights/')) {
    window.localStorage.setItem(LAST_INSIGHTS_PATH_KEY, pathname);
  }
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    storeLastVisitedPath(location.pathname);
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-surface)' }}>
      <div className="desktop-sidebar">
        <Sidebar />
      </div>

      {sidebarOpen ? (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26, 27, 46, 0.28)',
            zIndex: 45,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            onClick={(event) => event.stopPropagation()}
            style={{ width: '16rem', maxWidth: '80vw' }}
          >
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 0 }}>
        <TopNav onMenuToggle={() => setSidebarOpen((current) => !current)} />
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            paddingBottom: '6rem',
          }}
        >
          <Outlet />
        </main>
      </div>

      <div className="mobile-bottom-nav">
        <BottomNav />
      </div>
    </div>
  );
}
