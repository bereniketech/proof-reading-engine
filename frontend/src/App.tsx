import { BrowserRouter, Navigate, Outlet, Route, Routes, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './context/useAuth';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { InsightsPage } from './pages/InsightsPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';

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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

