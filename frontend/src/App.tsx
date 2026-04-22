import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './context/useAuth';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { InsightsPage } from './pages/InsightsPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProfilePage } from './pages/ProfilePage';

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Documents — Editorial Intelligence',
  '/profile': 'Profile — Editorial Intelligence',
  '/editor': 'Editor — Editorial Intelligence',
  '/insights': 'Insights — Editorial Intelligence',
  '/login': 'Sign In — Editorial Intelligence',
};

function PageTitle() {
  const location = useLocation();

  useEffect(() => {
    const match = Object.entries(ROUTE_TITLES).find(([path]) =>
      path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
    );
    document.title = match ? match[1] : 'Editorial Intelligence';
  }, [location.pathname]);

  return null;
}

function ProtectedRoute() {
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

function RootRedirect() {
  const { session, loading } = useAuth();

  if (loading) {
    return <></>;
  }

  return <Navigate to={session ? '/dashboard' : '/login'} replace />;
}

function LegacyReviewRedirect() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  if (sessionId) {
    return <Navigate to={`/editor/${encodeURIComponent(sessionId)}`} replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <PageTitle />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/review" element={<LegacyReviewRedirect />} />
        <Route path="/" element={<RootRedirect />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:sessionId" element={<EditorPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/insights/:sessionId" element={<InsightsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--color-on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>search_off</span>
                <h1 className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--color-on-surface)' }}>Page not found</h1>
                <p style={{ marginBottom: '1.5rem' }}>The page you're looking for doesn't exist.</p>
                <a href="/dashboard" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Go to Documents</a>
              </div>
            } />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

