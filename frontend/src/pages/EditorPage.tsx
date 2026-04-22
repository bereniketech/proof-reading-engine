import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import ReviewPage from '../ReviewPage';
import { SuggestionPanel } from '../components/SuggestionPanel';
import { apiBaseUrl } from '../lib/constants';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';
type ReferenceStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'vancouver';

interface SectionForPanel {
  id: string;
  original_text: string;
  corrected_text: string | null;
  change_summary: string | null;
  status: SectionStatus;
}

interface SessionInfo {
  id: string;
  filename: string;
  status: string;
}

const REFERENCE_STYLES = [
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'ieee', label: 'IEEE' },
  { value: 'vancouver', label: 'Vancouver' },
];

export function EditorPage(){
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [sections, setSections] = useState<SectionForPanel[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [referenceStyle, setReferenceStyle] = useState<ReferenceStyle>('apa');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isMatchingRefs, setIsMatchingRefs] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accessToken = session?.access_token ?? '';

  // Fetch session info for toolbar display and polling
  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const fetchSession = async (): Promise<void> => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json() as { success: boolean; data?: { session: SessionInfo; sections: SectionForPanel[] } };
        if (json.success && json.data) {
          setSessionInfo(json.data.session);
          setSections(json.data.sections);
        }
      } catch { /* silent */ }
    };

    void fetchSession();

    // Polling: start when proofreading, stop when done
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json() as { success: boolean; data?: { session: SessionInfo; sections: SectionForPanel[] } };
        if (json.success && json.data) {
          setSessionInfo(json.data.session);
          setSections(json.data.sections);
          if (json.data.session.status !== 'proofreading') {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* silent */ }
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, accessToken]);

  const handleMatchReferences = async (): Promise<void> => {
    if (!sessionId || !accessToken) return;
    setIsMatchingRefs(true);
    try {
      await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/match-references`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } finally {
      setIsMatchingRefs(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    if (!sessionId || !accessToken) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/export/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ reference_style: referenceStyle }),
      });
      if (!res.ok) { setExportError('Export failed. Please try again.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${sessionInfo?.filename ?? 'document'}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch { setExportError('Export failed. Please try again.'); }
    finally { setIsExporting(false); }
  };

  const handleSectionAccepted = (sectionId: string): void => {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, status: 'accepted' as SectionStatus } : s));
  };

  if (!sessionId) {
    return <div style={{ padding: '2rem' }}>No session ID provided. <button onClick={() => navigate('/dashboard')}>Go to Dashboard</button></div>;
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 3.5rem)', overflow: 'hidden' }}>

      {/* Left: editor canvas + toolbar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{
          padding: '0.75rem 1.5rem', background: 'var(--color-surface-container-low)',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <h1 className="font-display" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, flex: 1, color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sessionInfo?.filename ?? 'Loading...'}
          </h1>
          {sessionInfo?.status === 'proofreading' && (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span className="button-spinner" style={{ width: '1rem', height: '1rem' }} />
              Proofreading…
            </span>
          )}
          <button
            onClick={handleMatchReferences}
            disabled={isMatchingRefs}
            style={{ border: '1px solid var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)', borderRadius: 'var(--radius-lg)', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--color-on-surface)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>link</span>
            {isMatchingRefs ? 'Matching…' : 'Match References'}
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="gradient-editorial"
            style={{ border: 'none', borderRadius: 'var(--radius-lg)', padding: '0.5rem 0.875rem', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>picture_as_pdf</span>
            Export PDF
          </button>
          <button
            onClick={() => navigate(`/insights/${sessionId}`)}
            style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>bar_chart</span>
            Insights
          </button>
          {/* Mobile: toggle suggestions */}
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="mobile-only"
            style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-on-surface)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>auto_awesome</span>
          </button>
        </div>

        {/* ReviewPage canvas */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ReviewPage sessionId={sessionId} />
        </div>
      </div>

      {/* Right: SuggestionPanel — hidden on mobile unless toggled */}
      <div className={showSuggestions ? 'suggestion-panel-wrapper show' : 'suggestion-panel-wrapper'}>
        <SuggestionPanel
          sections={sections}
          accessToken={accessToken}
          onSectionAccepted={handleSectionAccepted}
        />
      </div>

      {/* Export modal */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-surface-container-lowest)', borderRadius: 'var(--radius-card)', padding: '2rem', width: 'min(400px, 90vw)', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
            <h2 className="font-display" style={{ margin: '0 0 1.25rem', fontWeight: 700 }}>Export PDF</h2>
            <label className="field" style={{ marginBottom: '1.25rem' }}>
              <span>Reference Style</span>
              <select className="field-select" value={referenceStyle} onChange={(e) => setReferenceStyle(e.target.value as ReferenceStyle)}>
                {REFERENCE_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            {exportError && <p className="feedback error">{exportError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowExportModal(false)} style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.625rem 1rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleExport} disabled={isExporting} className="gradient-editorial" style={{ border: 'none', borderRadius: 'var(--radius-lg)', padding: '0.625rem 1rem', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {isExporting ? 'Exporting…' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
