import { useEffect, useRef, useState } from 'react';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';

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

interface SessionPayload {
  session: SessionRecord;
  sections: SectionRecord[];
}

interface ApiSuccessResponse {
  success: true;
  data: SessionPayload;
}

interface ApiErrorResponse {
  success: false;
  error: string;
}

type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
const POLL_INTERVAL_MS = 2000;

const STATUS_LABELS: Record<SectionStatus, string> = {
  pending: 'Pending',
  ready: 'Ready',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

function getSessionIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('sessionId');
}

function allNonPending(sections: SectionRecord[]): boolean {
  return sections.length > 0 && sections.every((s) => s.status !== 'pending');
}

function StatusBadge({ status }: { readonly status: SectionStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function ReviewPage() {
  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(null);
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const firstSectionSetRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const sessionId = getSessionIdFromUrl();

  // Initialize Supabase auth
  useEffect(() => {
    let isMounted = true;

    const init = async (): Promise<void> => {
      const { data, error: authError } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (authError || !data.session) {
        window.location.assign('/');
        return;
      }
      setSupabaseSession(data.session);
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next) {
        window.location.assign('/');
      } else {
        setSupabaseSession(next);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Poll session data every 2s until all sections are non-pending
  useEffect(() => {
    if (!supabaseSession) return;

    if (!sessionId) {
      setError('No session ID found in URL.');
      setIsLoading(false);
      return;
    }

    cancelledRef.current = false;

    const fetchAndSchedule = async (): Promise<void> => {
      if (cancelledRef.current) return;

      try {
        const response = await fetch(
          `${apiBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${supabaseSession.access_token}` } },
        );

        const body = (await response.json()) as ApiResponse;

        if (cancelledRef.current) return;

        if (!response.ok || !body.success) {
          setError((body as ApiErrorResponse).error ?? 'Failed to load session.');
          setIsLoading(false);
          return;
        }

        const { data } = body as ApiSuccessResponse;
        setPayload(data);
        setError(null);
        setIsLoading(false);

        if (!firstSectionSetRef.current && data.sections.length > 0) {
          firstSectionSetRef.current = true;
          const firstSection = data.sections[0];
          if (firstSection) {
            setActiveSectionId(firstSection.id);
          }
        }

        if (!allNonPending(data.sections) && !cancelledRef.current) {
          pollTimerRef.current = setTimeout(() => {
            void fetchAndSchedule();
          }, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelledRef.current) {
          setError('Network error while loading session.');
          setIsLoading(false);
        }
      }
    };

    void fetchAndSchedule();

    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [supabaseSession, sessionId]);

  const activeSection = payload?.sections.find((s) => s.id === activeSectionId) ?? null;

  if (isLoading) {
    return (
      <div className="review-shell review-shell--centered">
        <p className="review-status-message">Loading session…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="review-shell review-shell--centered">
        <p className="review-status-message review-status-message--error" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => window.location.assign('/')}
        >
          ← Back to upload
        </button>
      </div>
    );
  }

  if (!payload) {
    return null;
  }

  const pendingCount = payload.sections.filter((s) => s.status === 'pending').length;
  const isProofreading = pendingCount > 0;

  return (
    <div className="review-shell">
      <header className="review-header">
        <div className="review-header-left">
          <span className="review-eyebrow">Proof-Reading Engine</span>
          <h1 className="review-title">{payload.session.filename}</h1>
        </div>
        <div className="review-header-right">
          {isProofreading ? (
            <span className="review-status-pill review-status-pill--active" aria-live="polite">
              Proofreading&hellip; {pendingCount} section{pendingCount !== 1 ? 's' : ''} remaining
            </span>
          ) : (
            <span className="review-status-pill review-status-pill--done">All sections ready</span>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.assign('/')}
          >
            ← Back
          </button>
        </div>
      </header>

      <div className="review-body">
        <aside className="review-sidebar" aria-label="Document sections">
          <ul className="section-list" role="listbox" aria-label="Section list">
            {payload.sections.map((section) => (
              <li
                key={section.id}
                role="option"
                aria-selected={section.id === activeSectionId}
                className={`section-item${section.id === activeSectionId ? ' section-item--active' : ''}`}
                onClick={() => setActiveSectionId(section.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveSectionId(section.id);
                  }
                }}
                tabIndex={0}
              >
                <span className="section-item-position">#{section.position + 1}</span>
                <span className="section-item-type">{section.section_type}</span>
                <StatusBadge status={section.status} />
              </li>
            ))}
          </ul>
        </aside>

        <main className="review-main">
          {activeSection !== null ? (
            <div className="section-detail">
              <div className="section-detail-meta">
                <span className="section-detail-pos">Section #{activeSection.position + 1}</span>
                <span className="section-detail-type">{activeSection.section_type}</span>
                <StatusBadge status={activeSection.status} />
              </div>

              <div className="section-block">
                <h2 className="section-block-label">Original text</h2>
                <p className="section-block-content section-block-content--original">
                  {activeSection.original_text}
                </p>
              </div>

              {activeSection.corrected_text !== null ? (
                <div className="section-block">
                  <h2 className="section-block-label">Corrected text</h2>
                  <p className="section-block-content">{activeSection.corrected_text}</p>
                </div>
              ) : (
                <div className="section-block section-block--pending">
                  <p className="section-pending-message">Proofreading in progress…</p>
                </div>
              )}

              {activeSection.change_summary !== null && activeSection.change_summary.length > 0 ? (
                <div className="section-block">
                  <h2 className="section-block-label">Summary of changes</h2>
                  <p className="section-block-content section-block-content--summary">
                    {activeSection.change_summary}
                  </p>
                </div>
              ) : null}

              {activeSection.reference_text !== null && activeSection.reference_text.length > 0 ? (
                <details className="section-reference">
                  <summary className="section-reference-toggle">Reference text</summary>
                  <p className="section-block-content section-block-content--reference">
                    {activeSection.reference_text}
                  </p>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="section-empty">
              <p>Select a section from the sidebar to review it.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
