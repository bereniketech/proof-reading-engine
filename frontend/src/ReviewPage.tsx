import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { SectionCard } from './components/SectionCard';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';
type ReferenceStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'vancouver';

interface ReferenceOption {
  position: number;
  text: string;
}

const REFERENCE_HEADING_TEXTS = new Set(['references', 'bibliography', 'works cited']);
const REFERENCE_STYLES: Array<{ value: ReferenceStyle; label: string }> = [
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'ieee', label: 'IEEE' },
  { value: 'vancouver', label: 'Vancouver' },
];

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

interface SectionPatchSuccessResponse {
  success: true;
  data: SectionRecord;
}

type SectionPatchResponse = SectionPatchSuccessResponse | ApiErrorResponse;
type SectionInstructResponse = SectionPatchSuccessResponse | ApiErrorResponse;

interface ExportErrorResponse {
  success?: false;
  error?: string;
}

const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';
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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getPreferredSectionText(section: SectionRecord): string {
  return (section.final_text ?? section.corrected_text ?? section.original_text).trim();
}

function getReferencesHeadingIndex(sections: SectionRecord[]): number {
  return sections.findIndex((section) => {
    if (section.section_type !== 'heading') {
      return false;
    }

    return REFERENCE_HEADING_TEXTS.has(normalizeText(getPreferredSectionText(section)));
  });
}

function deriveReferenceData(sections: SectionRecord[]): {
  options: ReferenceOption[];
  referenceSectionIdSet: Set<string>;
} {
  const headingIndex = getReferencesHeadingIndex(sections);
  if (headingIndex < 0) {
    return {
      options: [],
      referenceSectionIdSet: new Set<string>(),
    };
  }

  const options: ReferenceOption[] = [];
  const referenceSectionIdSet = new Set<string>();

  const headingSection = sections[headingIndex];
  if (headingSection) {
    referenceSectionIdSet.add(headingSection.id);
  }

  for (let i = headingIndex + 1; i < sections.length; i += 1) {
    const section = sections[i];
    if (!section) {
      continue;
    }

    if (section.section_type === 'heading') {
      break;
    }

    referenceSectionIdSet.add(section.id);
    const text = getPreferredSectionText(section);
    if (!text) {
      continue;
    }

    options.push({
      position: section.position,
      text,
    });
  }

  return {
    options,
    referenceSectionIdSet,
  };
}

function parseLinkedReferencePositions(referenceText: string | null): number[] {
  if (!referenceText) {
    return [];
  }

  try {
    const parsed = JSON.parse(referenceText) as { linked_reference_positions?: unknown };
    if (!Array.isArray(parsed.linked_reference_positions)) {
      return [];
    }

    const deduped = new Set<number>();
    for (const rawValue of parsed.linked_reference_positions) {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        continue;
      }

      deduped.add(Math.trunc(rawValue));
    }

    return Array.from(deduped.values()).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function serializeLinkedReferencePositions(positions: number[]): string {
  const uniqueSorted = Array.from(new Set(positions.map((position) => Math.trunc(position)))).sort(
    (a, b) => a - b,
  );

  return JSON.stringify({
    linked_reference_positions: uniqueSorted,
  });
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
  const [editedTextBySectionId, setEditedTextBySectionId] = useState<Record<string, string>>({});
  const [dirtySectionIds, setDirtySectionIds] = useState<Record<string, boolean>>({});
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [instructionBySectionId, setInstructionBySectionId] = useState<Record<string, string>>({});
  const [applyingSectionId, setApplyingSectionId] = useState<string | null>(null);
  const [instructionError, setInstructionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [referenceStyle, setReferenceStyle] = useState<ReferenceStyle>('apa');
  const [linkingSectionId, setLinkingSectionId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!payload) {
      return;
    }

    setEditedTextBySectionId((previous) => {
      let didChange = false;
      const next: Record<string, string> = { ...previous };

      for (const section of payload.sections) {
        const serverText = section.final_text ?? section.corrected_text ?? '';

        if (!Object.hasOwn(next, section.id)) {
          next[section.id] = serverText;
          didChange = true;
          continue;
        }

        if (!dirtySectionIds[section.id] && next[section.id] !== serverText) {
          next[section.id] = serverText;
          didChange = true;
        }
      }

      return didChange ? next : previous;
    });
  }, [dirtySectionIds, payload]);

  const patchSection = async (
    sectionId: string,
    updates: { status?: SectionStatus; final_text?: string; reference_text?: string },
  ): Promise<SectionRecord> => {
    if (!supabaseSession) {
      throw new Error('You are not authenticated.');
    }

    const response = await fetch(`${apiBaseUrl}/api/sections/${encodeURIComponent(sectionId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${supabaseSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    const body = (await response.json()) as SectionPatchResponse;
    if (!response.ok || !body.success) {
      throw new Error((body as ApiErrorResponse).error ?? 'Failed to update section.');
    }

    return (body as SectionPatchSuccessResponse).data;
  };

  const getEditedText = (section: SectionRecord): string => {
    return editedTextBySectionId[section.id] ?? section.final_text ?? section.corrected_text ?? '';
  };

  const updateSectionInPayload = (nextSection: SectionRecord): void => {
    setPayload((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        sections: current.sections.map((section) =>
          section.id === nextSection.id ? nextSection : section,
        ),
      };
    });
  };

  const handleAccept = async (): Promise<void> => {
    if (!payload || !activeSection) {
      return;
    }

    setActionError(null);
    setSavingSectionId(activeSection.id);

    const previousSection = activeSection;
    const editedText = getEditedText(activeSection);
    const optimisticSection: SectionRecord = {
      ...activeSection,
      status: 'accepted',
      final_text: editedText,
    };

    updateSectionInPayload(optimisticSection);

    try {
      const updated = await patchSection(activeSection.id, {
        status: 'accepted',
        final_text: editedText,
      });
      updateSectionInPayload(updated);
    } catch (patchError) {
      updateSectionInPayload(previousSection);
      setActionError(
        patchError instanceof Error ? patchError.message : 'Failed to accept section. Please retry.',
      );
    } finally {
      setSavingSectionId(null);
    }
  };

  const handleReject = async (): Promise<void> => {
    if (!payload || !activeSection) {
      return;
    }

    setActionError(null);
    setSavingSectionId(activeSection.id);

    const previousSection = activeSection;
    const optimisticSection: SectionRecord = {
      ...activeSection,
      status: 'rejected',
    };

    updateSectionInPayload(optimisticSection);

    try {
      const updated = await patchSection(activeSection.id, {
        status: 'rejected',
      });
      updateSectionInPayload(updated);
    } catch (patchError) {
      updateSectionInPayload(previousSection);
      setActionError(
        patchError instanceof Error ? patchError.message : 'Failed to reject section. Please retry.',
      );
    } finally {
      setSavingSectionId(null);
    }
  };

  const handleApplyInstruction = async (): Promise<void> => {
    if (!supabaseSession || !activeSection) {
      return;
    }

    const instruction = (instructionBySectionId[activeSection.id] ?? '').trim();
    if (instruction.length === 0) {
      return;
    }

    setInstructionError(null);
    setApplyingSectionId(activeSection.id);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/sections/${encodeURIComponent(activeSection.id)}/instruct`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ instruction }),
        },
      );

      const body = (await response.json()) as SectionInstructResponse;
      if (!response.ok || !body.success) {
        throw new Error((body as ApiErrorResponse).error ?? 'Failed to apply instruction.');
      }

      const updated = (body as SectionPatchSuccessResponse).data;
      updateSectionInPayload(updated);

      setEditedTextBySectionId((current) => ({
        ...current,
        [updated.id]: updated.final_text ?? updated.corrected_text ?? '',
      }));
      setDirtySectionIds((current) => ({
        ...current,
        [updated.id]: false,
      }));
      setInstructionBySectionId((current) => ({
        ...current,
        [activeSection.id]: '',
      }));
    } catch (err) {
      setInstructionError(
        err instanceof Error ? err.message : 'Failed to apply instruction. Please try again.',
      );
    } finally {
      setApplyingSectionId(null);
    }
  };

  const handleExportPdf = async (): Promise<void> => {
    if (!supabaseSession) {
      setExportError('You are not authenticated.');
      return;
    }

    if (!sessionId) {
      setExportError('No session ID found in URL.');
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/export/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference_style: referenceStyle }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to export PDF.';
        const contentType = response.headers.get('content-type') ?? '';

        if (contentType.includes('application/json')) {
          const body = (await response.json()) as ExportErrorResponse;
          if (typeof body.error === 'string' && body.error.length > 0) {
            errorMessage = body.error;
          }
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      const disposition = response.headers.get('content-disposition') ?? '';
      const fileNameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? `proofread-${sessionId}.pdf`;

      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportErr) {
      setExportError(
        exportErr instanceof Error ? exportErr.message : 'Failed to export PDF. Please try again.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const activeSection = payload?.sections.find((s) => s.id === activeSectionId) ?? null;
  const referenceData = useMemo(() => {
    if (!payload) {
      return {
        options: [] as ReferenceOption[],
        referenceSectionIdSet: new Set<string>(),
      };
    }

    return deriveReferenceData(payload.sections);
  }, [payload]);

  const activeSectionLinkedPositions = useMemo(() => {
    if (!activeSection) {
      return [] as number[];
    }

    return parseLinkedReferencePositions(activeSection.reference_text);
  }, [activeSection]);

  const handleLinkedReferencesChange = async (nextPositions: number[]): Promise<void> => {
    if (!activeSection) {
      return;
    }

    setActionError(null);
    setLinkingSectionId(activeSection.id);

    const previousSection = activeSection;
    const optimisticSection: SectionRecord = {
      ...activeSection,
      reference_text: serializeLinkedReferencePositions(nextPositions),
    };

    updateSectionInPayload(optimisticSection);

    try {
      const updated = await patchSection(activeSection.id, {
        reference_text: optimisticSection.reference_text ?? '',
      });
      updateSectionInPayload(updated);
    } catch (patchError) {
      updateSectionInPayload(previousSection);
      setActionError(
        patchError instanceof Error
          ? patchError.message
          : 'Failed to link references for this section. Please retry.',
      );
    } finally {
      setLinkingSectionId(null);
    }
  };

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
  const canExportPdf = payload.sections.length > 0 && pendingCount === 0;

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
          {referenceData.options.length > 0 ? (
            <label className="reference-style-picker" htmlFor="reference-style-select">
              <span>Reference style</span>
              <select
                id="reference-style-select"
                className="field-select"
                value={referenceStyle}
                onChange={(event) => setReferenceStyle(event.target.value as ReferenceStyle)}
              >
                {REFERENCE_STYLES.map((styleOption) => (
                  <option key={styleOption.value} value={styleOption.value}>
                    {styleOption.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="primary-button review-export-button"
            disabled={!canExportPdf || isExporting}
            onClick={() => {
              void handleExportPdf();
            }}
          >
            {isExporting ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                Exporting PDF...
              </>
            ) : (
              'Download PDF'
            )}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.assign('/')}
          >
            ← Back
          </button>
        </div>
      </header>

      {exportError ? (
        <p className="review-export-error" role="alert">
          {exportError}
        </p>
      ) : null}

      <div className="review-body">
        <aside className="review-sidebar" aria-label="Document sections">
          <ul className="section-list" aria-label="Section list">
            {payload.sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={`section-item${section.id === activeSectionId ? ' section-item--active' : ''}`}
                  aria-current={section.id === activeSectionId ? 'true' : undefined}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span className="section-item-position">#{section.position + 1}</span>
                  <span className="section-item-type">{section.section_type}</span>
                  <StatusBadge status={section.status} />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="review-main">
          <div className="mobile-section-picker">
            <label htmlFor="mobile-section-select" className="section-block-label">
              Section
            </label>
            <select
              id="mobile-section-select"
              className="mobile-section-select"
              value={activeSectionId ?? ''}
              onChange={(event) => setActiveSectionId(event.target.value)}
            >
              {payload.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  #{section.position + 1} {section.section_type} ({STATUS_LABELS[section.status]})
                </option>
              ))}
            </select>
          </div>

          {activeSection !== null ? (
            <SectionCard
              section={activeSection}
              editedText={getEditedText(activeSection)}
              isSaving={savingSectionId === activeSection.id}
              actionError={actionError}
              instructionText={instructionBySectionId[activeSection.id] ?? ''}
              isApplyingInstruction={applyingSectionId === activeSection.id}
              instructionError={instructionError}
              referenceOptions={referenceData.options}
              linkedReferencePositions={activeSectionLinkedPositions}
              isUpdatingReferenceLinks={linkingSectionId === activeSection.id}
              canLinkReferences={
                referenceData.options.length > 0 &&
                !referenceData.referenceSectionIdSet.has(activeSection.id)
              }
              onEditedTextChange={(nextValue) => {
                setEditedTextBySectionId((current) => ({
                  ...current,
                  [activeSection.id]: nextValue,
                }));
                setDirtySectionIds((current) => ({
                  ...current,
                  [activeSection.id]: true,
                }));
                setActionError(null);
              }}
              onInstructionTextChange={(value) => {
                setInstructionBySectionId((current) => ({
                  ...current,
                  [activeSection.id]: value,
                }));
                setInstructionError(null);
              }}
              onApplyInstruction={handleApplyInstruction}
              onLinkedReferencePositionsChange={handleLinkedReferencesChange}
              onAccept={handleAccept}
              onReject={handleReject}
            />
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
