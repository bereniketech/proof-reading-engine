---
task: 004
feature: editorial-intelligence-ui
status: complete
depends_on: [003]
---

# Task 004: Rewrite App.tsx with React Router Routes

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app, /code-writing-software-development
Commands: /verify, /task-handoff

---

## Objective
Replace the current monolithic `App.tsx` (which contains both auth UI and upload UI) with a React Router `BrowserRouter` entry point that defines all 6 routes, a `ProtectedRoute` guard, and a `LegacyReviewRedirect` component. All existing page content moves into dedicated page files in later tasks — here we just wire the routing skeleton with placeholder page components.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/App.tsx:1-27 — constants to preserve (move to shared location or DashboardPage)
const DOCUMENT_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'medical_journal', label: 'Medical Journal' },
  { value: 'legal_document', label: 'Legal Document' },
  { value: 'academic_paper', label: 'Academic Paper' },
  { value: 'business_report', label: 'Business Report' },
  { value: 'creative_writing', label: 'Creative Writing' },
] as const;

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['docx', 'pdf', 'txt'] as const;
const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';
```

```typescript
// frontend/src/context/AuthContext.tsx — useAuth hook (from task-003)
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
// AuthContextValue: { session, user, loading, signOut }
```

```typescript
// frontend/src/ReviewPage.tsx:135-136 — legacy URL reading pattern to redirect
function getSessionIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('sessionId');
}
```

### Key Patterns in Use
- **`react-router-dom` v6 API:** `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `useParams`, `useNavigate`, `useLocation`, `useSearchParams`.
- **ProtectedRoute pattern:** Renders `<Outlet />` if authenticated, `<Navigate to="/login" replace />` if not. Shows loading spinner while `loading === true`.
- **Lazy imports** are NOT needed for this project size — use direct imports.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/context/AuthContext.tsx`, `frontend/src/main.tsx`
**Decisions made:** AuthProvider wraps the app; `useAuth()` available everywhere.
**Context for this task:** Auth context is ready. Now wire the router.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Create stub page files (empty components) for pages not yet built — needed to make imports compile:
   - `frontend/src/pages/LoginPage.tsx` — export `function LoginPage() { return <div>Login</div>; }`
   - `frontend/src/pages/DashboardPage.tsx` — export `function DashboardPage() { return <div>Dashboard</div>; }`
   - `frontend/src/pages/EditorPage.tsx` — export `function EditorPage() { return <div>Editor</div>; }`
   - `frontend/src/pages/InsightsPage.tsx` — export `function InsightsPage() { return <div>Insights</div>; }`
   - `frontend/src/pages/ProfilePage.tsx` — export `function ProfilePage() { return <div>Profile</div>; }`
   - `frontend/src/components/layout/AppShell.tsx` — export `function AppShell() { return <Outlet />; }` (import `Outlet` from react-router-dom)

2. Rewrite `frontend/src/App.tsx` completely:

```typescript
import { BrowserRouter, Navigate, Outlet, Route, Routes, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { InsightsPage } from './pages/InsightsPage';
import { ProfilePage } from './pages/ProfilePage';

function ProtectedRoute(): JSX.Element {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-surface)' }}>
        <div className="button-spinner" aria-label="Loading..." />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function RootRedirect(): JSX.Element {
  const { session, loading } = useAuth();
  if (loading) return <></>;
  return <Navigate to={session ? '/dashboard' : '/login'} replace />;
}

function LegacyReviewRedirect(): JSX.Element {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  if (sessionId) {
    return <Navigate to={`/editor/${encodeURIComponent(sessionId)}`} replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/review" element={<LegacyReviewRedirect />} />
        <Route path="/" element={<RootRedirect />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/editor/:sessionId" element={<EditorPage />} />
            <Route path="/insights/:sessionId" element={<InsightsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

3. Move shared constants to `frontend/src/lib/constants.ts`:
   - `DOCUMENT_TYPES`, `MAX_FILE_SIZE_BYTES`, `ACCEPTED_EXTENSIONS`, `apiBaseUrl`
   - Export them so `DashboardPage` and other pages can import them.

4. Run `npm run typecheck` — must pass. If stub files cause issues, fix the imports.

_Requirements: 2.4, 2.5, 2.6_
_Skills: /build-website-web-app — React Router, route guards_

---

## Acceptance Criteria
- [ ] Visiting `/` while unauthenticated redirects to `/login`.
- [ ] Visiting `/` while authenticated redirects to `/dashboard`.
- [ ] Visiting `/review?sessionId=abc` redirects to `/editor/abc`.
- [ ] Visiting `/dashboard` while unauthenticated redirects to `/login`.
- [ ] All 5 stub pages render without errors when navigated to (while authenticated).
- [ ] `npm run typecheck` exits 0 in `frontend/`.
- [ ] `frontend/src/lib/constants.ts` exports `DOCUMENT_TYPES`, `MAX_FILE_SIZE_BYTES`, `ACCEPTED_EXTENSIONS`, `apiBaseUrl`.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:**
- `frontend/src/App.tsx` — completely rewritten with React Router (BrowserRouter, Routes, ProtectedRoute, RootRedirect, LegacyReviewRedirect)
- `frontend/src/main.tsx` — simplified to always render App wrapped in AuthProvider; removed conditional ReviewPage logic
- `frontend/src/lib/constants.ts` — created with DOCUMENT_TYPES, MAX_FILE_SIZE_BYTES, ACCEPTED_EXTENSIONS, apiBaseUrl
- `frontend/src/pages/LoginPage.tsx` — created (stub)
- `frontend/src/pages/DashboardPage.tsx` — created (stub)
- `frontend/src/pages/EditorPage.tsx` — created (stub)
- `frontend/src/pages/InsightsPage.tsx` — created (stub)
- `frontend/src/pages/ProfilePage.tsx` — created (stub)
- `frontend/src/components/layout/AppShell.tsx` — created with `<Outlet />` wrapper

**Decisions made:**
- All 6 page stubs created with minimal placeholder content to allow imports
- Legacy `/review?sessionId=X` redirect implemented as LegacyReviewRedirect component
- ProtectedRoute uses useAuth() hook to check `session` and `loading` states
- RootRedirect navigates to /dashboard (authenticated) or /login (unauthenticated)
- BrowserRouter wraps all routes; nested Route structure with ProtectedRoute as parent guard
- No lazy imports used (project size doesn't require code-splitting)
- AppShell component positioned as single outlet wrapper for authenticated routes

**Context for next task:**
- App routing skeleton complete and type-checking
- Page stub files exist but contain minimal content (divs with page names)
- Constants extracted from monolithic App.tsx are available in `lib/constants.ts`
- All 6 protected routes redirect to login if not authenticated
- Legacy review URL pattern fully handled via router

**Open questions:** None
