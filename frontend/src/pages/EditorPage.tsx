import { useNavigate, useParams } from 'react-router-dom';
import ReviewPage from '../ReviewPage';

export function EditorPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  if (!sessionId) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>edit_note</span>
        <p>Open a document from the <a href="/dashboard" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Dashboard</a> to start editing.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 3.75rem)', overflow: 'hidden', width: '100%', minWidth: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ReviewPage sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
