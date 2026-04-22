import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import ReviewPage from '../ReviewPage';
import { SuggestionPanel } from '../components/SuggestionPanel';
import { apiBaseUrl } from '../lib/constants';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';

interface SectionForPanel {
  id: string;
  original_text: string;
  corrected_text: string | null;
  change_summary: string | null;
  status: SectionStatus;
}

export function EditorPage(){
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [sections, setSections] = useState<SectionForPanel[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accessToken = session?.access_token ?? '';

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const fetchSections = async (): Promise<string | null> => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json() as { success: boolean; data?: { session: { status: string }; sections: SectionForPanel[] } };
        if (json.success && json.data) {
          setSections(json.data.sections);
          return json.data.session.status;
        }
      } catch { /* silent */ }
      return null;
    };

    void fetchSections();

    pollRef.current = setInterval(async () => {
      const status = await fetchSections();
      if (status && status !== 'proofreading') {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, accessToken]);

  const handleSectionAccepted = (sectionId: string): void => {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, status: 'accepted' as SectionStatus } : s));
  };

  if (!sessionId) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>edit_note</span>
        <p>Open a document from the Dashboard to start editing.</p>
        <button onClick={() => navigate('/dashboard')} style={{ marginTop: '1rem', padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-outline-variant)', cursor: 'pointer', background: 'transparent', color: 'var(--color-on-surface)' }}>Go to Dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 3.75rem)', overflow: 'hidden', width: '100%', minWidth: 0 }}>

      {/* Left: editor canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ReviewPage sessionId={sessionId} />
        </div>
      </div>

      {/* Toggle button — visible on tablet (768–1279px), hidden on desktop */}
      <button
        onClick={() => setShowSuggestions((v) => !v)}
        aria-label={showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
        className="suggestion-panel-toggle"
        style={{
          position: 'fixed',
          bottom: '5rem',
          right: '1rem',
          zIndex: 50,
          alignItems: 'center',
          justifyContent: 'center',
          width: '3rem',
          height: '3rem',
          borderRadius: 'var(--radius-full)',
          border: 'none',
          cursor: 'pointer',
          background: 'var(--color-primary)',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
          {showSuggestions ? 'chevron_right' : 'rate_review'}
        </span>
      </button>

      {/* Right: SuggestionPanel — hidden on mobile unless toggled; hidden-on-tablet when dismissed */}
      <div className={`suggestion-panel-wrapper${showSuggestions ? ' show' : ' hidden'}`}>
        <SuggestionPanel
          sections={sections}
          accessToken={accessToken}
          onSectionAccepted={handleSectionAccepted}
        />
      </div>

    </div>
  );
}
