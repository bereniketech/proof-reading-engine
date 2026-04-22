import { useParams } from 'react-router-dom';
import ReviewPage from '../ReviewPage';

export function EditorPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  if (!sessionId) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>edit_note</span>
        <p>Open a document from the <a href="/dashboard" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Dashboard</a> to start editing.</p>
      </div>
    );
  }

  return <ReviewPage sessionId={sessionId} />;
}
