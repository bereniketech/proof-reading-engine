---
task: 005
feature: editorial-intelligence-ui
status: completed
depends_on: [004]
---

# Task 005: Build AppShell Layout (Sidebar + TopNav + BottomNav)

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app
Commands: /verify, /task-handoff

---

## Objective
Build the persistent authenticated layout shell: a desktop left sidebar (w-64), a sticky top navigation bar, and a mobile-only fixed bottom navigation bar. The `AppShell` component wraps all authenticated pages via React Router's `<Outlet />`. No page content goes here — only the chrome around pages.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/components/layout/AppShell.tsx — current stub from task-004
import { Outlet } from 'react-router-dom';
export function AppShell() { return <Outlet />; }
```

```css
/* frontend/src/styles.css — new tokens available after task-002 */
--color-primary: #3a388b;
--color-primary-container: #5250a4;
--color-surface-container-low: #f2f3ff;
--color-surface-container-highest: #dae2fd;
--color-on-surface: #1a1b2e;
--color-on-surface-variant: #45464f;
/* utility classes */
.gradient-editorial { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-container)); }
.glass { background: rgba(250,248,255,0.8); backdrop-filter: blur(12px); }
```

```typescript
// frontend/src/context/AuthContext.tsx — signOut available
export function useAuth(): AuthContextValue {
  // returns: { session, user, loading, signOut }
}
```

### Key Patterns in Use
- **Material Symbols** render as `<span className="material-symbols-outlined">icon_name</span>` — no extra import needed, loaded via Google Fonts link in index.html.
- **Responsive breakpoint** at `768px` (md). Use CSS media queries or inline style toggling — no Tailwind.
- **Active route detection** via `useLocation()` from react-router-dom — compare `location.pathname` against nav item `href`.
- **No state library** — sidebar open/close state lives in `AppShell` via `useState`.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/App.tsx`, stub page files, `frontend/src/lib/constants.ts`
**Decisions made:** Router wired; all routes defined; stub pages compiling.
**Context for this task:** Routing works. Now build the layout chrome.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Create `frontend/src/components/layout/Sidebar.tsx`:

```typescript
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { icon: 'description', label: 'Documents', href: '/dashboard' },
  { icon: 'edit_note', label: 'Editor', href: '/dashboard' }, // updated to last editor URL by EditorPage
  { icon: 'bar_chart', label: 'Insights', href: '/dashboard' },
  { icon: 'person', label: 'Profile', href: '/profile' },
];

export function Sidebar(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside style={{
      width: '16rem', minHeight: '100vh', background: 'var(--color-surface-container-low)',
      display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem', gap: '0.5rem',
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <div style={{
          width: '3rem', height: '3rem', borderRadius: 'var(--radius-xl)',
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))',
          display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>auto_stories</span>
        </div>
        <div>
          <div className="font-display" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)' }}>AI Curator</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', letterSpacing: '0.05rem' }}>v2.4</div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.href ||
            (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-lg)',
                border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                background: isActive ? 'var(--color-surface-container-highest)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                fontWeight: isActive ? 600 : 400, fontSize: '0.9rem',
                transition: 'background var(--duration-fast)',
              }}
            >
              <span className="material-symbols-outlined" style={{
                fontSize: '1.25rem',
                fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
              }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Upgrade prompt */}
      <div style={{
        padding: '1rem', borderRadius: 'var(--radius-xl)',
        background: 'var(--color-surface-container-highest)',
        fontSize: '0.8rem', color: 'var(--color-on-surface-variant)',
      }}>
        <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.25rem' }}>Upgrade to Pro</div>
        <div>Unlock unlimited documents and advanced analytics.</div>
      </div>
    </aside>
  );
}
```

2. Create `frontend/src/components/layout/TopNav.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface TopNavProps {
  onMenuToggle: () => void;
  title?: string;
}

export function TopNav({ onMenuToggle, title }: TopNavProps): JSX.Element {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'rgba(250,248,255,0.85)', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--color-outline-variant)',
      display: 'flex', alignItems: 'center', gap: '1rem',
      padding: '0 1.5rem', height: '3.5rem',
    }}>
      {/* Hamburger (mobile only) */}
      <button
        onClick={onMenuToggle}
        aria-label="Toggle menu"
        style={{
          display: 'none', background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--color-on-surface)',
        }}
        className="topnav-hamburger"
      >
        <span className="material-symbols-outlined">menu</span>
      </button>

      {/* Title */}
      <span className="font-display" style={{ fontWeight: 700, fontSize: '1rem', flex: 1, color: 'var(--color-on-surface)' }}>
        {title ?? 'AI Curator'}
      </span>

      {/* Right controls */}
      <button aria-label="Notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined">notifications</span>
      </button>
      <button aria-label="Settings" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined">settings</span>
      </button>
      <button
        onClick={() => navigate('/dashboard')}
        className="gradient-editorial"
        style={{
          border: 'none', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem',
          color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.375rem',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
        New Document
      </button>
      <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', fontSize: '0.8rem' }}>
        Sign out
      </button>
    </header>
  );
}
```

3. Create `frontend/src/components/layout/BottomNav.tsx`:

```typescript
import { useLocation, useNavigate } from 'react-router-dom';

const BOTTOM_NAV_ITEMS = [
  { icon: 'description', label: 'Documents', href: '/dashboard' },
  { icon: 'edit_note', label: 'Editor', href: '/dashboard' },
  { icon: 'bar_chart', label: 'Insights', href: '/dashboard' },
  { icon: 'person', label: 'Profile', href: '/profile' },
];

export function BottomNav(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--color-surface-container-lowest)',
      borderTop: '1px solid var(--color-outline-variant)',
      display: 'flex', zIndex: 40,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}
    className="bottom-nav"
    >
      {BOTTOM_NAV_ITEMS.map((item) => {
        const isActive = location.pathname === item.href;
        return (
          <button
            key={item.label}
            onClick={() => navigate(item.href)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '0.25rem', padding: '0.625rem 0', border: 'none', cursor: 'pointer',
              background: isActive ? 'var(--color-surface-container-highest)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              fontSize: '0.65rem', fontWeight: isActive ? 600 : 400,
            }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: '1.4rem',
              fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
            }}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
```

4. Replace `frontend/src/components/layout/AppShell.tsx` stub with the real implementation:

```typescript
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';

export function AppShell(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-surface)' }}>
      {/* Desktop sidebar */}
      <div className="desktop-sidebar">
        <Sidebar />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 0 }} className="main-content">
        <TopNav onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav">
        <BottomNav />
      </div>
    </div>
  );
}
```

5. Add responsive CSS to `frontend/src/styles.css` (append at end):

```css
/* AppShell responsive layout */
.desktop-sidebar { display: none; }
.mobile-bottom-nav { display: block; }
.topnav-hamburger { display: flex !important; }

@media (min-width: 768px) {
  .desktop-sidebar { display: block; }
  .mobile-bottom-nav { display: none; }
  .topnav-hamburger { display: none !important; }
  .main-content { margin-left: 16rem; }
}

.bottom-nav { display: flex; }
@media (min-width: 768px) {
  .bottom-nav { display: none; }
}
```

6. Run `npm run typecheck` — must pass.

_Requirements: 2.1, 2.2, 2.3_
_Skills: /build-website-web-app — layout, responsive design_

---

## Acceptance Criteria
- [ ] On desktop (≥768px): sidebar visible, bottom nav hidden, main content offset 16rem left.
- [ ] On mobile (<768px): sidebar hidden, bottom nav visible, no left offset.
- [ ] Active nav item highlighted with `surface-container-highest` bg on both Sidebar and BottomNav.
- [ ] TopNav renders without overlapping content.
- [ ] "New Document" button in TopNav navigates to `/dashboard`.
- [ ] Sign out button calls `signOut()` from AuthContext.
- [ ] `npm run typecheck` exits 0.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** `frontend/src/App.tsx`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/TopNav.tsx`, `frontend/src/components/layout/BottomNav.tsx`, `frontend/src/styles.css`, `bug-log.md`
**Decisions made:**
- Added desktop-only fixed sidebar and mobile-only bottom nav using the 768px breakpoint from the feature spec.
- Persisted the last visited editor and insights routes in localStorage so navigation can return to the most recent session when available.
- Implemented a mobile sidebar drawer in AppShell so the TopNav hamburger performs a real open/close action without requiring page-level state.
**Context for next task:** Authenticated routes now render inside a responsive shell, so task 006 can focus only on replacing the LoginPage stub with the editorial design and Supabase auth form behavior.
**Open questions:** None.
