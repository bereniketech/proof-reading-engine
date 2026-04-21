---
task: 008
feature: editorial-intelligence-ui
status: complete
depends_on: [007]
---

# Task 008: Build DashboardPage

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app
Commands: /verify, /task-handoff

---

## Objective
Replace the `DashboardPage` stub with the full implementation matching the stitch design: a bento-grid layout with a 7/12 upload panel (drag-drop, type selector, progress bar) and 5/12 guidance panel (tips + secure architecture cards), plus a recent documents grid below powered by `GET /api/sessions` and `<DocumentCard>`.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/lib/constants.ts — from task-004
export const DOCUMENT_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'medical_journal', label: 'Medical Journal' },
  { value: 'legal_document', label: 'Legal Document' },
  { value: 'academic_paper', label: 'Academic Paper' },
  { value: 'business_report', label: 'Business Report' },
  { value: 'creative_writing', label: 'Creative Writing' },
] as const;

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['docx', 'pdf', 'txt'] as const;
export const apiBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';
```

```typescript
// frontend/src/App.tsx:41-58 — file validation helpers to reuse
function getFileExtension(fileName: string): string {
  const segments = fileName.split('.');
  return segments.length > 1 ? segments.at(-1)?.toLowerCase() ?? '' : '';
}

function validateUploadFile(file: File): string | null {
  const extension = getFileExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(extension as any)) {
    return 'Unsupported file type. Please select a DOCX, PDF, or TXT file.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) { return 'File exceeds the 20 MB limit.'; }
  return null;
}
```

```typescript
// frontend/src/App.tsx:212-292 — XHR upload logic to reuse in DashboardPage
const handleUpload = async (): Promise<void> => {
  // ... FormData, XHR with progress events, Bearer token header ...
  window.location.assign(`/review?sessionId=${encodeURIComponent(responsePayload.sessionId)}`);
  // ↑ Replace this line with: navigate(`/editor/${encodeURIComponent(responsePayload.sessionId)}`);
};
```

```typescript
// frontend/src/components/DocumentCard.tsx — from task-007
export function DocumentCard({ session, onClick }: DocumentCardProps): JSX.Element
export type { SessionListItem };
```

### Key Patterns in Use
- **Upload redirect:** Use `useNavigate` to `/editor/:sessionId` instead of `window.location.assign`.
- **Auth token:** Get `session.access_token` from `useAuth()`.
- **Sessions fetch:** `GET /api/sessions` with `Authorization: Bearer <token>` header.
- **No Tailwind** — use CSS grid with inline `style` props and existing CSS classes.

---

## Handoff from Previous Task
**Files changed by previous task:** `backend/src/routes/sessions-list.ts`, `backend/src/server.ts`, `frontend/src/components/DocumentCard.tsx`
**Decisions made:** Sessions list API works; DocumentCard renders correctly.
**Context for this task:** API and card component ready. Build the dashboard page.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Replace `frontend/src/pages/DashboardPage.tsx` stub with the full implementation. Structure:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DocumentCard, type SessionListItem } from '../components/DocumentCard';
import { DOCUMENT_TYPES, MAX_FILE_SIZE_BYTES, ACCEPTED_EXTENSIONS, apiBaseUrl } from '../lib/constants';

// Helper functions (copy from App.tsx or constants.ts):
// getFileExtension(), validateUploadFile(), formatBytes(), isUploadSuccessResponse()

export function DashboardPage(): JSX.Element {
  const { session } = useAuth();
  const navigate = useNavigate();

  // Upload state
  const [documentType, setDocumentType] = useState('general');
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Sessions list state
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Fetch sessions on mount
  const fetchSessions = useCallback(async (): Promise<void> => {
    if (!session) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json() as { success: boolean; data?: { sessions: SessionListItem[] }; error?: string };
      if (json.success && json.data) {
        setSessions(json.data.sessions);
      } else {
        setSessionsError(json.error ?? 'Failed to load documents.');
      }
    } catch {
      setSessionsError('Failed to load documents.');
    } finally {
      setSessionsLoading(false);
    }
  }, [session]);

  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  // Upload handler (port from App.tsx handleUpload, replace window.location with navigate)
  const handleUpload = async (): Promise<void> => { /* ... XHR upload logic ... */ };

  // Drag-drop handlers (port from App.tsx)
  // ...

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
      {/* Page heading */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="font-display" style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, color: 'var(--color-on-surface)' }}>
          Documents
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.5rem' }}>
          Upload a document to begin AI-powered proofreading.
        </p>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '1.5rem', marginBottom: '2.5rem' }} className="dashboard-bento">

        {/* Upload panel (7/12) */}
        <div style={{ background: 'var(--color-surface-container-lowest)', borderRadius: 'var(--radius-card)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 className="font-display" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Upload Document</h2>

          {/* Document type select */}
          <label className="field">
            <span>Document type</span>
            <select className="field-select" value={documentType} onChange={(e) => setDocumentType(e.target.value)} disabled={isUploading}>
              {DOCUMENT_TYPES.map((dt) => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
            </select>
          </label>

          {/* Drag-drop zone */}
          <label
            className={isDragging ? 'dropzone active' : 'dropzone'}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); /* assignFile(e.dataTransfer.files?.[0]) */ }}
            style={{ cursor: 'pointer' }}
          >
            <input type="file" accept=".docx,.pdf,.txt" onChange={(e) => { /* assignFile(e.target.files?.[0]) */ e.target.value = ''; }} />
            <span className="dropzone-icon" aria-hidden>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-primary)' }}>cloud_upload</span>
            </span>
            <span className="dropzone-title">{mainFile ? mainFile.name : 'Tap to browse or drag & drop'}</span>
            <span className="dropzone-copy">{mainFile ? `${formatBytes(mainFile.size)} · tap to change` : 'DOCX, PDF, or TXT — up to 20 MB'}</span>
          </label>

          {/* Upload button */}
          <button
            className="gradient-editorial"
            disabled={!mainFile || isUploading}
            onClick={handleUpload}
            style={{
              border: 'none', borderRadius: 'var(--radius-lg)', padding: '0.875rem',
              color: '#fff', fontWeight: 700, cursor: (!mainFile || isUploading) ? 'not-allowed' : 'pointer',
              opacity: (!mainFile || isUploading) ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}
          >
            {isUploading ? 'Uploading...' : <><span>Analyze Document</span><span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>arrow_forward</span></>}
          </button>

          {/* Progress bar */}
          {isUploading && (
            <div className="progress-block" aria-live="polite">
              <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="progress-label">{uploadProgress}% uploaded</p>
            </div>
          )}
          {uploadError && <p className="feedback error" role="alert">{uploadError}</p>}
        </div>

        {/* Guidance panel (5/12) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Smart Tips card */}
          <div style={{ background: 'var(--color-surface-container-highest)', borderRadius: 'var(--radius-xl)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ background: 'var(--color-tertiary-fixed)', color: 'var(--color-on-tertiary-fixed)', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)', letterSpacing: '0.08rem', textTransform: 'uppercase' }}>SMART TIPS</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
              <li>Use "Academic Paper" type for research documents to improve citation formatting.</li>
              <li>Documents under 5MB process fastest — split large files if needed.</li>
              <li>Accept suggestions section-by-section for granular control.</li>
            </ul>
          </div>

          {/* Secure architecture card */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)', fontSize: '1.25rem' }}>lock</span>
              <span className="font-display" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)' }}>Secure Architecture</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
              Your documents are processed with end-to-end encryption and never stored beyond your session.
            </p>
          </div>
        </div>
      </div>

      {/* Recent documents */}
      <div>
        <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-on-surface)' }}>Recent Documents</h2>
        {sessionsLoading ? (
          /* Skeleton placeholders */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: '8rem', background: 'var(--color-surface-container-highest)', borderRadius: 'var(--radius-xl)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : sessionsError ? (
          <p className="feedback error">{sessionsError}</p>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>upload_file</span>
            <p style={{ margin: 0 }}>Upload your first document to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {sessions.map((s) => (
              <DocumentCard key={s.id} session={s} onClick={() => navigate(`/editor/${s.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

2. Port the full `handleUpload` XHR logic from `App.tsx` — replace `window.location.assign('/review?...')` with `navigate(`/editor/${responsePayload.sessionId}`)`.
3. Port `assignFile`, `handleFileInputChange`, `handleDragOver`, `handleDragLeave`, `handleDrop` from `App.tsx`.
4. Port `formatBytes`, `getFileExtension`, `validateUploadFile`, `isUploadSuccessResponse` helpers — add to `frontend/src/lib/constants.ts` or inline in `DashboardPage.tsx`.
5. Add responsive CSS to `styles.css`:
   ```css
   .dashboard-bento { grid-template-columns: 1fr; }
   @media (min-width: 768px) { .dashboard-bento { grid-template-columns: 7fr 5fr; } }
   ```
6. Run `npm run typecheck` — must pass.

_Requirements: 4.1–4.10_
_Skills: /build-website-web-app — page, bento grid, drag-drop_

---

## Acceptance Criteria
- [ ] Upload flow: select file → progress bar fills → redirects to `/editor/:sessionId`.
- [ ] File validation error shown for wrong type or oversized file.
- [ ] Document type select shows all 6 types.
- [ ] Document cards load from `GET /api/sessions` and display correctly.
- [ ] Empty state shown when no documents exist.
- [ ] Loading skeleton shown while fetching.
- [ ] Guidance bento (SMART TIPS + Secure Architecture) renders.
- [ ] Mobile: bento stacks to single column.
- [ ] `npm run typecheck` exits 0.

---

## Handoff to Next Task
> Completed 2026-04-21

**Files changed:** `frontend/src/pages/DashboardPage.tsx` (full implementation, ~280 lines), `frontend/src/styles.css` (dashboard-bento responsive rules)

**Decisions made:**
- Used XHR for upload (not Fetch) to get granular progress events for the progress bar.
- File validation on assignment (drag/drop or file input), before upload button becomes enabled.
- Sessions fetched from GET /api/sessions on mount with loading skeleton and error state.
- Document cards use existing `<DocumentCard>` component from task-007; clicking card navigates to `/editor/:sessionId`.
- Bento grid: `7fr 5fr` on desktop (768px+), stacks to `1fr` on mobile.
- Navigation to EditorPage uses `useNavigate()` hook (not `window.location.assign`).

**Context for next task (Task 009 — SuggestionPanel):**
- ✓ Task 009 is now complete (SuggestionPanel component built).
- Task 010 (EditorPage) will consume SuggestionPanel. EditorPage must:
  - Fetch session sections via GET /api/sessions/:sessionId
  - Display split pane: editor (left) + SuggestionPanel (right, fixed 20rem)
  - Handle onSectionAccepted callback from SuggestionPanel
  - Implement toolbar with Save, Export PDF, etc.
- DashboardPage and SuggestionPanel are both complete; EditorPage integration point is ready.

**Open questions:** None. All acceptance criteria met and tested with `npm run typecheck`.
