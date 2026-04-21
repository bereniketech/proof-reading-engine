---
task: 010
feature: editorial-intelligence-ui
status: complete
depends_on: [009]
---

# Task 010: Build EditorPage (Wrapping ReviewPage)

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app, /code-writing-software-development
Commands: /verify, /task-handoff

---

## Objective
Replace the `EditorPage` stub with a full implementation that renders the existing `ReviewPage` in a new split-pane layout with `SuggestionPanel` on the right. Add a toolbar with Match References and Export PDF buttons. Preserve all existing section operations exactly. Implement 5-second polling when the session is proofreading.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/ReviewPage.tsx:1-10 — existing imports and types
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { SectionCard } from './components/SectionCard';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';
type ReferenceStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'vancouver';
```

```typescript
// frontend/src/ReviewPage.tsx:25-53 — SessionRecord and SectionRecord interfaces
interface SessionRecord {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SectionRecord {
  id: string;
  session_id: string;
  position: number;
  section_type: string;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
  reference_text: string | null;
  final_text: string | null;
  change_summary: string | null;
  status: SectionStatus;
  created_at: string;
  updated_at: string;
}
```

```typescript
// frontend/src/ReviewPage.tsx:125-127 — API base and poll interval
const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';
const POLL_INTERVAL_MS = 2000;
```

```typescript
// frontend/src/ReviewPage.tsx:135-136 — legacy URL reading (to remove; sessionId now from useParams)
function getSessionIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('sessionId');
}
```

```typescript
// frontend/src/components/SuggestionPanel.tsx — from task-009
interface SuggestionPanelProps {
  sections: SectionForPanel[];  // { id, original_text, corrected_text, change_summary, status }
  accessToken: string;
  onSectionAccepted: (sectionId: string) => void;
}
export function SuggestionPanel(props: SuggestionPanelProps): JSX.Element
```

### Key Patterns in Use
- **ReviewPage approach:** `ReviewPage` currently reads `sessionId` from URL query params (`getSessionIdFromUrl()`). The cleanest integration is to pass `sessionId` and `session` (Supabase) as props to `ReviewPage`, eliminating the URL reading. Update `ReviewPage` to accept `sessionId?: string` prop and use it if provided, falling back to `getSessionIdFromUrl()`.
- **Export:** `POST ${apiBaseUrl}/api/export/:sessionId` with body `{ reference_style }` — returns a PDF blob. Trigger download via `URL.createObjectURL`.
- **Match References:** `POST ${apiBaseUrl}/api/sessions/:sessionId/match-references` — sections update in response.
- **Polling:** `setInterval` every 5000ms while `session.status === 'proofreading'`; clear on unmount with `clearInterval`.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/components/SuggestionPanel.tsx`
**Decisions made:** SuggestionPanel accepts sections and calls PATCH on accept.
**Context for this task:** SuggestionPanel is ready. Now build the editor page that wraps ReviewPage.
**Open questions left:** _(none)_

---

## Implementation Steps

1. **Modify `frontend/src/ReviewPage.tsx`** minimally — add an optional `sessionId` prop:
   - Add `interface ReviewPageProps { sessionId?: string; }` and `export function ReviewPage({ sessionId: propSessionId }: ReviewPageProps = {})`.
   - In `getSessionIdFromUrl()` usage, prefer `propSessionId` if set: `const sessionId = propSessionId ?? getSessionIdFromUrl();`.
   - This is the only change to ReviewPage — all other logic is unchanged.

2. Replace `frontend/src/pages/EditorPage.tsx` stub:

```typescript
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ReviewPage } from '../ReviewPage';
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

export function EditorPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [sections, setSections] = useState<SectionForPanel[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [referenceStyle, setReferenceStyle] = useState('apa');
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
              <select className="field-select" value={referenceStyle} onChange={(e) => setReferenceStyle(e.target.value)}>
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
```

3. Add responsive CSS to `styles.css`:
   ```css
   .suggestion-panel-wrapper { display: none; }
   @media (min-width: 768px) { .suggestion-panel-wrapper { display: flex; } }
   .suggestion-panel-wrapper.show { display: flex; }
   .mobile-only { display: flex; }
   @media (min-width: 768px) { .mobile-only { display: none !important; } }
   ```

4. Run `npm run typecheck` — must pass. If `ReviewPage` doesn't export correctly, update its export statement.

_Requirements: 5.1–5.10, 11.1–11.6_
_Skills: /build-website-web-app — page composition; /code-writing-software-development — polling, state_

---

## Acceptance Criteria
- [ ] All existing section operations (accept, reject, edit, instruct, split, merge, add) work identically to current ReviewPage.
- [ ] SuggestionPanel visible on desktop (≥768px); hidden on mobile with toggle button.
- [ ] Match References button POSTs to correct endpoint.
- [ ] Export PDF modal opens; Download triggers PDF download.
- [ ] Polling starts when session status is "proofreading"; stops when status changes.
- [ ] Session filename displayed in toolbar.
- [ ] Insights navigation button links to `/insights/:sessionId`.
- [ ] `npm run typecheck` exits 0.

---

## Handoff to Next Task
> Completed 2026-04-21

**Files changed:**
- `frontend/src/ReviewPage.tsx`: Added optional `sessionId` prop interface; prefer prop over URL query param
- `frontend/src/pages/EditorPage.tsx`: Full implementation (~250 lines)
- `frontend/src/styles.css`: Added `.suggestion-panel-wrapper` and `.mobile-only` responsive rules

**Decisions made:**
- ReviewPage changes minimal: only added `ReviewPageProps` interface and used `propSessionId ?? getSessionIdFromUrl()` pattern
- EditorPage uses Fetch API for polling and export (not XHR) — simpler for JSON endpoints
- Polling interval is 5000ms (5 seconds) while `session.status === 'proofreading'`
- Export modal uses simple state-driven rendering; selected reference style stored in state
- SuggestionPanel receives sections from EditorPage state (fetched once on mount, updated via polling)
- Mobile responsive: suggestion panel hidden on <768px unless `.show` class applied via toggle button
- All ReviewPage operations (accept, reject, edit, instruct, split, merge, add) remain unchanged

**Context for next task (Task 011 — InsightsPage):**
- EditorPage is complete and integrated with ReviewPage + SuggestionPanel
- Insights button in EditorPage toolbar navigates to `/insights/:sessionId`
- Task 011 must build InsightsPage that fetches GET /api/sessions/:sessionId/insights
- Backend insights endpoint (Task 013) is not yet implemented
- For sequence: should implement Task 013 before Task 011 to have a working API

**Open questions:** None. All acceptance criteria met.
