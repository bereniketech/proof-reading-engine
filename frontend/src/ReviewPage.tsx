import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { SectionCard } from './components/SectionCard';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';
type EditableSectionType = 'heading' | 'paragraph';
type InsertPlacement = 'above' | 'below';
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

interface MergeSectionsSuccessResponse {
  success: true;
  data: {
    merged_section_id: string;
    sections: SectionRecord[];
  };
}

interface AddSectionSuccessResponse {
  success: true;
  data: {
    inserted_section_id: string;
    sections: SectionRecord[];
  };
}

interface SplitSectionSuccessResponse {
  success: true;
  data: {
    updated_section_id: string;
    inserted_section_id: string;
    sections: SectionRecord[];
  };
}

type MergeSectionsResponse = MergeSectionsSuccessResponse | ApiErrorResponse;
type AddSectionResponse = AddSectionSuccessResponse | ApiErrorResponse;
type SplitSectionResponse = SplitSectionSuccessResponse | ApiErrorResponse;

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
  referencesHeadingSectionId: string | null;
} {
  const headingIndex = getReferencesHeadingIndex(sections);
  if (headingIndex < 0) {
    return {
      options: [],
      referenceSectionIdSet: new Set<string>(),
      referencesHeadingSectionId: null,
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
    referencesHeadingSectionId: headingSection?.id ?? null,
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
  const [mergingSectionId, setMergingSectionId] = useState<string | null>(null);
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [splittingSectionId, setSplittingSectionId] = useState<string | null>(null);
  const [newSectionType, setNewSectionType] = useState<EditableSectionType>('paragraph');
  const [newSectionHeadingLevel, setNewSectionHeadingLevel] = useState(2);
  const [newSectionText, setNewSectionText] = useState('');
  const [addSectionError, setAddSectionError] = useState<string | null>(null);
  const [splitSectionType, setSplitSectionType] = useState<EditableSectionType>('paragraph');
  const [splitSectionHeadingLevel, setSplitSectionHeadingLevel] = useState(2);
  const [splitSectionText, setSplitSectionText] = useState('');
  const [splitSectionError, setSplitSectionError] = useState<string | null>(null);
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

  useEffect(() => {
    setNewSectionType('paragraph');
    setNewSectionHeadingLevel(2);
    setNewSectionText('');
    setAddSectionError(null);
    setSplitSectionType('paragraph');
    setSplitSectionHeadingLevel(2);
    setSplitSectionText('');
    setSplitSectionError(null);
  }, [activeSectionId]);

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

  const handleMergeWithNext = async (): Promise<void> => {
    if (!payload || !activeSection || !supabaseSession || !sessionId) {
      return;
    }

    const sortedSections = [...payload.sections].sort((a, b) => a.position - b.position);
    const currentIndex = sortedSections.findIndex((s) => s.id === activeSection.id);
    if (currentIndex < 0 || currentIndex >= sortedSections.length - 1) {
      return;
    }

    const nextSection = sortedSections[currentIndex + 1];
    if (!nextSection) {
      return;
    }

    setActionError(null);
    setMergingSectionId(activeSection.id);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}/merge-sections`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ section_ids: [activeSection.id, nextSection.id] }),
        },
      );

      const body = (await response.json()) as MergeSectionsResponse;
      if (!response.ok || !body.success) {
        throw new Error((body as ApiErrorResponse).error ?? 'Failed to merge sections.');
      }

      const mergeResult = (body as MergeSectionsSuccessResponse).data;

      setPayload((current) => {
        if (!current) return current;
        return { ...current, sections: mergeResult.sections };
      });

      setActiveSectionId(mergeResult.merged_section_id);

      // Clear dirty/edited state for the consumed section so the sync effect picks up fresh server text
      const deletedId = nextSection.id;
      setDirtySectionIds((current) => {
        const next = { ...current };
        delete next[activeSection.id];
        delete next[deletedId];
        return next;
      });
      setEditedTextBySectionId((current) => {
        const next = { ...current };
        delete next[deletedId];
        return next;
      });
      setInstructionBySectionId((current) => {
        const next = { ...current };
        delete next[deletedId];
        return next;
      });
    } catch (mergeError) {
      setActionError(
        mergeError instanceof Error
          ? mergeError.message
          : 'Failed to merge sections. Please retry.',
      );
    } finally {
      setMergingSectionId(null);
    }
  };

  const handleAddSection = async (placement: InsertPlacement): Promise<void> => {
    if (!payload || !activeSection || !supabaseSession || !sessionId) {
      return;
    }

    const text = newSectionText.trim();
    if (text.length === 0) {
      return;
    }

    setActionError(null);
    setAddSectionError(null);
    setAddingSectionId(activeSection.id);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}/sections`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            anchor_section_id: activeSection.id,
            placement,
            section_type: newSectionType,
            heading_level: newSectionType === 'heading' ? newSectionHeadingLevel : null,
            text,
          }),
        },
      );

      const body = (await response.json()) as AddSectionResponse;
      if (!response.ok || !body.success) {
        throw new Error((body as ApiErrorResponse).error ?? 'Failed to add section.');
      }

      const addResult = (body as AddSectionSuccessResponse).data;
      setPayload((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          sections: addResult.sections,
        };
      });
      setActiveSectionId(addResult.inserted_section_id);
      setNewSectionType('paragraph');
      setNewSectionHeadingLevel(2);
      setNewSectionText('');
    } catch (addError) {
      setAddSectionError(
        addError instanceof Error ? addError.message : 'Failed to add section. Please retry.',
      );
    } finally {
      setAddingSectionId(null);
    }
  };

  const handleSplitSection = async (): Promise<void> => {
    if (!payload || !activeSection || !supabaseSession || !sessionId) {
      return;
    }

    const topText = getEditedText(activeSection).trim();
    const bottomText = splitSectionText.trim();

    if (topText.length === 0 || bottomText.length === 0) {
      return;
    }

    setActionError(null);
    setSplitSectionError(null);
    setSplittingSectionId(activeSection.id);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/sections/${encodeURIComponent(activeSection.id)}/split`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            top_text: topText,
            bottom_text: bottomText,
            bottom_section_type: splitSectionType,
            bottom_heading_level: splitSectionType === 'heading' ? splitSectionHeadingLevel : null,
          }),
        },
      );

      const body = (await response.json()) as SplitSectionResponse;
      if (!response.ok || !body.success) {
        throw new Error((body as ApiErrorResponse).error ?? 'Failed to split section.');
      }

      const splitResult = (body as SplitSectionSuccessResponse).data;
      setPayload((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          sections: splitResult.sections,
        };
      });
      setEditedTextBySectionId((current) => ({
        ...current,
        [activeSection.id]: topText,
        [splitResult.inserted_section_id]: bottomText,
      }));
      setDirtySectionIds((current) => ({
        ...current,
        [activeSection.id]: false,
        [splitResult.inserted_section_id]: false,
      }));
      setInstructionBySectionId((current) => {
        const next = { ...current };
        delete next[splitResult.inserted_section_id];
        return next;
      });
      setActiveSectionId(splitResult.inserted_section_id);
      setSplitSectionType('paragraph');
      setSplitSectionHeadingLevel(2);
      setSplitSectionText('');
    } catch (splitError) {
      setSplitSectionError(
        splitError instanceof Error ? splitError.message : 'Failed to split section. Please retry.',
      );
    } finally {
      setSplittingSectionId(null);
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
        referencesHeadingSectionId: null as string | null,
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
  const reviewedCount = payload.sections.filter((s) => s.status === 'accepted' || s.status === 'rejected').length;
  const totalCount = payload.sections.length;
  const isProofreading = pendingCount > 0;
  const canExportPdf = totalCount > 0 && pendingCount === 0;

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

      <div className="review-progress" aria-label="Review progress">
        <span className="review-progress-label">
          {reviewedCount} / {totalCount} reviewed
        </span>
        <div
          className="review-progress-track"
          role="progressbar"
          aria-valuenow={reviewedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-label={`${reviewedCount} of ${totalCount} sections reviewed`}
        >
          <div
            className="review-progress-fill"
            style={{ width: totalCount > 0 ? `${(reviewedCount / totalCount) * 100}%` : '0%' }}
          />
        </div>
      </div>

      <div className="review-body">
        <aside className="review-sidebar" aria-label="Document sections">
          <div className="review-sidebar-header">
            {totalCount} section{totalCount !== 1 ? 's' : ''}
          </div>
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
                  <span className="section-item-info">
                    <span className="section-item-type">{section.section_type}</span>
                    <span className="section-item-preview">
                      {section.original_text.slice(0, 55)}
                    </span>
                  </span>
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
              isReferenceSection={referenceData.referenceSectionIdSet.has(activeSection.id)}
              hasReferencesSection={referenceData.options.length > 0}
              canMergeWithNext={
                payload.sections.findIndex((s) => s.id === activeSection.id) <
                payload.sections.length - 1
              }
              isMerging={mergingSectionId === activeSection.id}
              addSectionText={newSectionText}
              addSectionType={newSectionType}
              addSectionHeadingLevel={newSectionHeadingLevel}
              isAddingSection={addingSectionId === activeSection.id}
              addSectionError={addSectionError}
              splitSectionText={splitSectionText}
              splitSectionType={splitSectionType}
              splitSectionHeadingLevel={splitSectionHeadingLevel}
              isSplittingSection={splittingSectionId === activeSection.id}
              splitSectionError={splitSectionError}
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
              onMergeWithNext={handleMergeWithNext}
              onAddSectionTextChange={setNewSectionText}
              onAddSectionTypeChange={setNewSectionType}
              onAddSectionHeadingLevelChange={setNewSectionHeadingLevel}
              onAddSection={handleAddSection}
              onSplitSectionTextChange={setSplitSectionText}
              onSplitSectionTypeChange={setSplitSectionType}
              onSplitSectionHeadingLevelChange={setSplitSectionHeadingLevel}
              onSplitSection={handleSplitSection}
            />
          ) : (
            <div className="section-empty">
              <span className="section-empty-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
              </span>
              <p>Select a section from the sidebar to review it.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
