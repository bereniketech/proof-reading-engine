import { useMemo, useState } from 'react';

type SectionType = 'heading' | 'paragraph';
type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';
type InsertPlacement = 'above' | 'below';

export interface SectionCardSection {
  id: string;
  position: number;
  section_type: string;
  original_text: string;
  corrected_text: string | null;
  reference_text: string | null;
  change_summary: string | null;
  status: SectionStatus;
}

interface ReferenceOption {
  position: number;
  text: string;
}

type DiffType = 'same' | 'added' | 'removed';

interface DiffChunk {
  type: DiffType;
  value: string;
}

interface SectionCardProps {
  readonly section: SectionCardSection;
  readonly editedText: string;
  readonly isSaving: boolean;
  readonly actionError: string | null;
  readonly instructionText: string;
  readonly isApplyingInstruction: boolean;
  readonly instructionError: string | null;
  readonly referenceOptions: ReferenceOption[];
  readonly linkedReferencePositions: number[];
  readonly isUpdatingReferenceLinks: boolean;
  readonly canLinkReferences: boolean;
  readonly isReferenceSection: boolean;
  readonly hasReferencesSection: boolean;
  readonly canMergeWithNext: boolean;
  readonly isMerging: boolean;
  readonly addSectionText: string;
  readonly addSectionType: SectionType;
  readonly addSectionHeadingLevel: number;
  readonly isAddingSection: boolean;
  readonly addSectionError: string | null;
  readonly splitSectionText: string;
  readonly splitSectionType: SectionType;
  readonly splitSectionHeadingLevel: number;
  readonly isSplittingSection: boolean;
  readonly splitSectionError: string | null;
  readonly onEditedTextChange: (nextValue: string) => void;
  readonly onInstructionTextChange: (value: string) => void;
  readonly onApplyInstruction: () => Promise<void>;
  readonly onSuggestReferences: () => Promise<number[]>;
  readonly onLinkedReferencePositionsChange: (positions: number[]) => Promise<void>;
  readonly onAccept: () => Promise<void>;
  readonly onReject: () => Promise<void>;
  readonly onMergeWithNext: () => Promise<void>;
  readonly onAddSectionTextChange: (value: string) => void;
  readonly onAddSectionTypeChange: (value: SectionType) => void;
  readonly onAddSectionHeadingLevelChange: (value: number) => void;
  readonly onAddSection: (placement: InsertPlacement) => Promise<void>;
  readonly onSplitSectionTextChange: (value: string) => void;
  readonly onSplitSectionTypeChange: (value: SectionType) => void;
  readonly onSplitSectionHeadingLevelChange: (value: number) => void;
  readonly onSplitSection: () => Promise<void>;
}

function tokenizeByWhitespace(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function buildDiffChunks(originalText: string, editedText: string): DiffChunk[] {
  const originalTokens = tokenizeByWhitespace(originalText);
  const editedTokens = tokenizeByWhitespace(editedText);

  if (originalTokens.length === 0 && editedTokens.length === 0) {
    return [];
  }

  const matrixComplexity = originalTokens.length * editedTokens.length;
  if (matrixComplexity > 120_000) {
    return [
      ...(originalText.length > 0 ? [{ type: 'removed' as const, value: originalText }] : []),
      ...(editedText.length > 0 ? [{ type: 'added' as const, value: editedText }] : []),
    ];
  }

  const lcs: number[][] = Array.from({ length: originalTokens.length + 1 }, () =>
    Array<number>(editedTokens.length + 1).fill(0),
  );

  for (let i = 1; i <= originalTokens.length; i += 1) {
    const currentRow = lcs[i]!;
    const previousRow = lcs[i - 1]!;

    for (let j = 1; j <= editedTokens.length; j += 1) {
      if (originalTokens[i - 1] === editedTokens[j - 1]) {
        currentRow[j] = previousRow[j - 1]! + 1;
      } else {
        currentRow[j] = Math.max(previousRow[j]!, currentRow[j - 1]!);
      }
    }
  }

  const reversed: DiffChunk[] = [];
  let originalCursor = originalTokens.length;
  let editedCursor = editedTokens.length;

  while (originalCursor > 0 || editedCursor > 0) {
    const originalToken = originalCursor > 0 ? originalTokens[originalCursor - 1]! : null;
    const editedToken = editedCursor > 0 ? editedTokens[editedCursor - 1]! : null;

    if (
      originalToken !== null &&
      editedToken !== null &&
      originalToken === editedToken
    ) {
      reversed.push({ type: 'same', value: originalToken });
      originalCursor -= 1;
      editedCursor -= 1;
      continue;
    }

    if (
      editedToken !== null &&
      (originalToken === null || (lcs[originalCursor]?.[editedCursor - 1] ?? 0) >= (lcs[originalCursor - 1]?.[editedCursor] ?? 0))
    ) {
      reversed.push({ type: 'added', value: editedToken });
      editedCursor -= 1;
      continue;
    }

    if (originalToken !== null) {
      reversed.push({ type: 'removed', value: originalToken });
      originalCursor -= 1;
    }
  }

  const chunks = reversed.reverse();
  const merged: DiffChunk[] = [];

  for (const chunk of chunks) {
    const lastChunk = merged.at(-1);
    if (!lastChunk || lastChunk.type !== chunk.type) {
      merged.push({ ...chunk });
      continue;
    }

    const nextValue = `${lastChunk.value}${chunk.value}`;
    merged[merged.length - 1] = {
      ...lastChunk,
      value: nextValue,
    };
  }

  return merged;
}

export function SectionCard({
  section,
  editedText,
  isSaving,
  actionError,
  instructionText,
  isApplyingInstruction,
  instructionError,
  referenceOptions,
  linkedReferencePositions,
  isUpdatingReferenceLinks,
  canLinkReferences,
  isReferenceSection,
  hasReferencesSection,
  canMergeWithNext,
  isMerging,
  addSectionText,
  addSectionType,
  addSectionHeadingLevel,
  isAddingSection,
  addSectionError,
  splitSectionText,
  splitSectionType,
  splitSectionHeadingLevel,
  isSplittingSection,
  splitSectionError,
  onEditedTextChange,
  onInstructionTextChange,
  onApplyInstruction,
  onSuggestReferences,
  onLinkedReferencePositionsChange,
  onAccept,
  onReject,
  onMergeWithNext,
  onAddSectionTextChange,
  onAddSectionTypeChange,
  onAddSectionHeadingLevelChange,
  onAddSection,
  onSplitSectionTextChange,
  onSplitSectionTypeChange,
  onSplitSectionHeadingLevelChange,
  onSplitSection,
}: SectionCardProps) {
  const [activeTab, setActiveTab] = useState<'corrected' | 'diff' | 'summary'>('corrected');
  const textareaId = `corrected-text-${section.id}`;
  const instructionId = `instruction-${section.id}`;
  const addSectionTextareaId = `add-section-${section.id}`;
  const splitSectionTextareaId = `split-section-${section.id}`;
  const diffChunks = useMemo(
    () => buildDiffChunks(section.original_text, editedText),
    [section.original_text, editedText],
  );

  const hasSummary = section.change_summary !== null && section.change_summary.length > 0;
  const isPending = section.status === 'pending' && section.corrected_text === null;
  const linkedPositionSet = useMemo(
    () => new Set(linkedReferencePositions),
    [linkedReferencePositions],
  );

  // AI-powered citation suggestions for this section
  const [aiSuggestedPositions, setAiSuggestedPositions] = useState<Set<number>>(new Set());
  const [isSuggestingRefs, setIsSuggestingRefs] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());

  const visibleSuggestions = useMemo(
    () => new Set([...aiSuggestedPositions].filter((p) => !dismissedSuggestions.has(p) && !linkedPositionSet.has(p))),
    [aiSuggestedPositions, dismissedSuggestions, linkedPositionSet],
  );

  return (
    <div className="section-card">
      <div className="section-detail-meta">
        <span className="section-detail-pos">Section #{section.position + 1}</span>
        <span className="section-detail-type">{section.section_type}</span>
      </div>

      <div className="section-block">
        <h2 className="section-block-label">Original text</h2>
        <p className="section-block-content section-block-content--original">{section.original_text}</p>
      </div>

      <div className="section-block">
        <div className="section-tabs" role="tablist" aria-label="Section views">
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'corrected'}
            className={`section-tab${activeTab === 'corrected' ? ' section-tab--active' : ''}`}
            onClick={() => setActiveTab('corrected')}
          >
            Corrected text
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'diff'}
            className={`section-tab${activeTab === 'diff' ? ' section-tab--active' : ''}`}
            onClick={() => setActiveTab('diff')}
          >
            Inline diff
          </button>
          {hasSummary ? (
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === 'summary'}
              className={`section-tab${activeTab === 'summary' ? ' section-tab--active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              Summary
            </button>
          ) : null}
        </div>

        {activeTab === 'corrected' ? (
          <textarea
            id={textareaId}
            className="section-editor"
            value={editedText}
            onChange={(event) => onEditedTextChange(event.target.value)}
            placeholder={isPending ? 'Proofreading in progress…' : 'Edit the corrected text before accepting'}
            disabled={isPending || isSaving}
            rows={10}
          />
        ) : activeTab === 'diff' ? (
          <div className="section-diff" role="tabpanel">
            {diffChunks.length > 0 ? (
              <p className="section-block-content section-diff-content" aria-live="polite">
                {diffChunks.map((chunk, index) => (
                  <span
                    key={`${chunk.type}-${index}`}
                    className={
                      chunk.type === 'added'
                        ? 'diff-token diff-token--added'
                        : chunk.type === 'removed'
                          ? 'diff-token diff-token--removed'
                          : 'diff-token'
                    }
                  >
                    {chunk.value}
                  </span>
                ))}
              </p>
            ) : (
              <p className="section-block-content section-block-content--summary">No text changes yet.</p>
            )}
          </div>
        ) : (
          <div role="tabpanel">
            <p className="section-block-content section-block-content--summary">{section.change_summary}</p>
          </div>
        )}
      </div>

      <div className="section-block">
        <label className="section-block-label" htmlFor={instructionId}>
          Ask AI to modify this section
        </label>
        <div className="instruction-row">
          <input
            id={instructionId}
            type="text"
            className="instruction-input"
            value={instructionText}
            onChange={(event) => onInstructionTextChange(event.target.value)}
            placeholder="e.g. &quot;make this more formal&quot;, &quot;shorten this paragraph&quot;"
            disabled={isPending || isApplyingInstruction}
            maxLength={2000}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={isPending || isApplyingInstruction || instructionText.trim().length === 0}
            onClick={() => {
              void onApplyInstruction();
            }}
          >
            {isApplyingInstruction ? 'Applying…' : 'Apply'}
          </button>
        </div>
        {instructionError ? (
          <p className="review-status-message review-status-message--error" role="alert">
            {instructionError}
          </p>
        ) : null}
      </div>

      {hasReferencesSection && isReferenceSection ? (
        <div className="section-block section-reference-guide">
          <h2 className="section-block-label">Reference linking</h2>
          <p className="section-block-content section-block-content--summary">
            This section is inside the References block. To attach citations, open a body section and select the reference entries it cites there.
          </p>
        </div>
      ) : null}

      {referenceOptions.length > 0 && canLinkReferences ? (
        <div className="section-block">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <h2 className="section-block-label" style={{ margin: 0 }}>Citations used in this section</h2>
            <button
              type="button"
              disabled={isSuggestingRefs || isPending}
              onClick={() => {
                setIsSuggestingRefs(true);
                setSuggestError(null);
                setDismissedSuggestions(new Set());
                onSuggestReferences().then((positions) => {
                  setAiSuggestedPositions(new Set(positions));
                  setIsSuggestingRefs(false);
                }).catch((err: unknown) => {
                  setSuggestError(err instanceof Error ? err.message : 'AI suggestion failed.');
                  setIsSuggestingRefs(false);
                });
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.3rem 0.7rem', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-outline-variant)',
                background: 'transparent', cursor: isSuggestingRefs ? 'wait' : 'pointer',
                fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>auto_awesome</span>
              {isSuggestingRefs ? 'Analysing…' : 'Suggest with AI'}
            </button>
          </div>
          <p className="section-block-content section-block-content--summary">
            Tick each reference entry cited here. The exported PDF will append citation markers for the selected references automatically.
          </p>
          {suggestError ? (
            <p className="review-status-message review-status-message--error" role="alert" style={{ marginBottom: '0.5rem' }}>{suggestError}</p>
          ) : null}
          {visibleSuggestions.size > 0 ? (
            <div style={{
              marginBottom: '0.75rem', padding: '0.6rem 0.75rem',
              borderRadius: 'var(--radius-lg)', background: 'rgba(var(--color-primary-rgb, 58,56,139), 0.06)',
              border: '1px solid var(--color-outline-variant)',
            }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', verticalAlign: 'middle', marginRight: '0.25rem' }}>tips_and_updates</span>
                AI found {visibleSuggestions.size} likely citation{visibleSuggestions.size === 1 ? '' : 's'} — confirm below
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {[...visibleSuggestions].map((pos) => {
                  const ref = referenceOptions.find((r) => r.position === pos);
                  if (!ref) return null;
                  return (
                    <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const nextSet = new Set(linkedPositionSet);
                          nextSet.add(pos);
                          void onLinkedReferencePositionsChange(Array.from(nextSet.values()).sort((a, b) => a - b));
                          setAiSuggestedPositions((prev) => { const s = new Set(prev); s.delete(pos); return s; });
                        }}
                        style={{
                          padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--color-primary)', background: 'var(--color-primary)',
                          color: '#fff', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        ✓ Ref {pos + 1}
                      </button>
                      <button
                        type="button"
                        aria-label="Dismiss suggestion"
                        onClick={() => setDismissedSuggestions((prev) => new Set([...prev, pos]))}
                        style={{
                          padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--color-outline-variant)', background: 'transparent',
                          color: 'var(--color-on-surface-variant)', fontSize: '0.7rem', cursor: 'pointer',
                        }}
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <p className="section-reference-selected-count">
            {linkedReferencePositions.length} reference{linkedReferencePositions.length === 1 ? '' : 's'} selected
          </p>
          <div className="reference-link-list" role="group" aria-label="Reference links">
            {referenceOptions.map((referenceOption) => {
              const checked = linkedPositionSet.has(referenceOption.position);
              const isSuggested = visibleSuggestions.has(referenceOption.position);

              return (
                <label
                  key={referenceOption.position}
                  className="reference-link-item"
                  style={isSuggested ? { background: 'rgba(var(--color-primary-rgb, 58,56,139), 0.06)', borderRadius: 'var(--radius-md)' } : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isPending || isUpdatingReferenceLinks}
                    onChange={(event) => {
                      const nextSet = new Set(linkedPositionSet);
                      if (event.target.checked) {
                        nextSet.add(referenceOption.position);
                        setAiSuggestedPositions((prev) => { const s = new Set(prev); s.delete(referenceOption.position); return s; });
                      } else {
                        nextSet.delete(referenceOption.position);
                      }
                      void onLinkedReferencePositionsChange(Array.from(nextSet.values()).sort((a, b) => a - b));
                    }}
                  />
                  <span className="reference-link-number">Ref {referenceOption.position + 1}</span>
                  {isSuggested ? <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-primary)', marginLeft: '0.25rem', letterSpacing: '0.03rem' }}>AI</span> : null}
                  <span className="reference-link-text">{referenceOption.text}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {!hasReferencesSection ? (
        <div className="section-block section-reference-guide">
          <h2 className="section-block-label">Reference linking</h2>
          <p className="section-block-content section-block-content--summary">
            Citation linking appears after the document contains a heading named References, Bibliography, or Works Cited.
          </p>
        </div>
      ) : null}

      <details className="section-block section-disclosure">
        <summary>Add missing section</summary>
        <div className="section-disclosure-body">
          <div className="section-add-controls">
            <select
              className="field-select section-add-select"
              value={addSectionType}
              disabled={isPending || isAddingSection}
              aria-label="Section type"
              onChange={(event) => onAddSectionTypeChange(event.target.value as SectionType)}
            >
              <option value="paragraph">Paragraph</option>
              <option value="heading">Heading</option>
            </select>
            {addSectionType === 'heading' ? (
              <select
                className="field-select section-add-select"
                value={String(addSectionHeadingLevel)}
                disabled={isPending || isAddingSection}
                aria-label="Heading level"
                onChange={(event) => onAddSectionHeadingLevelChange(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((level) => (
                  <option key={level} value={level}>
                    H{level}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <textarea
            id={addSectionTextareaId}
            className="section-editor section-editor--compact"
            value={addSectionText}
            onChange={(event) => onAddSectionTextChange(event.target.value)}
            placeholder="Paste or type the missing section text."
            aria-label="Missing section text"
            disabled={isPending || isAddingSection}
            rows={5}
          />
          <div className="section-add-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isPending || isAddingSection || addSectionText.trim().length === 0}
              onClick={() => { void onAddSection('above'); }}
            >
              {isAddingSection ? 'Adding…' : 'Add above'}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={isPending || isAddingSection || addSectionText.trim().length === 0}
              onClick={() => { void onAddSection('below'); }}
            >
              {isAddingSection ? 'Adding…' : 'Add below'}
            </button>
          </div>
          {addSectionError ? (
            <p className="review-status-message review-status-message--error" role="alert">
              {addSectionError}
            </p>
          ) : null}
        </div>
      </details>

      <details className="section-block section-disclosure">
        <summary>Split this section</summary>
        <div className="section-disclosure-body">
          <p className="section-split-hint">
            The corrected text editor above becomes the upper section. Paste the new lower section text below.
          </p>
          <div className="section-add-controls">
            <select
              className="field-select section-add-select"
              value={splitSectionType}
              disabled={isPending || isSplittingSection}
              aria-label="Lower section type"
              onChange={(event) => onSplitSectionTypeChange(event.target.value as SectionType)}
            >
              <option value="paragraph">Lower: Paragraph</option>
              <option value="heading">Lower: Heading</option>
            </select>
            {splitSectionType === 'heading' ? (
              <select
                className="field-select section-add-select"
                value={String(splitSectionHeadingLevel)}
                disabled={isPending || isSplittingSection}
                aria-label="Lower section heading level"
                onChange={(event) => onSplitSectionHeadingLevelChange(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((level) => (
                  <option key={level} value={level}>
                    H{level}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <textarea
            id={splitSectionTextareaId}
            className="section-editor section-editor--compact"
            value={splitSectionText}
            onChange={(event) => onSplitSectionTextChange(event.target.value)}
            placeholder="Move the lower part of this section here."
            aria-label="Lower section text"
            disabled={isPending || isSplittingSection}
            rows={5}
          />
          <div className="section-add-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isPending || isSplittingSection || editedText.trim().length === 0 || splitSectionText.trim().length === 0}
              onClick={() => { void onSplitSection(); }}
            >
              {isSplittingSection ? 'Splitting…' : 'Split into two sections'}
            </button>
          </div>
          {splitSectionError ? (
            <p className="review-status-message review-status-message--error" role="alert">
              {splitSectionError}
            </p>
          ) : null}
        </div>
      </details>

      <div className="section-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={isPending || isSaving}
          onClick={() => {
            void onReject();
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={isPending || isSaving}
          onClick={() => {
            void onAccept();
          }}
        >
          {isSaving ? 'Saving…' : 'Accept'}
        </button>
      </div>

      {canMergeWithNext ? (
        <div className="section-merge-row">
          <button
            type="button"
            className="merge-button"
            disabled={isPending || isMerging || isSaving}
            onClick={() => {
              void onMergeWithNext();
            }}
          >
            {isMerging ? 'Merging…' : 'Merge with next section ↓'}
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p className="review-status-message review-status-message--error" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
