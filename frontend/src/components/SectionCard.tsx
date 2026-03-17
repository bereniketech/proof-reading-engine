import { useMemo } from 'react';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';

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
  readonly onEditedTextChange: (nextValue: string) => void;
  readonly onAccept: () => Promise<void>;
  readonly onReject: () => Promise<void>;
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
    for (let j = 1; j <= editedTokens.length; j += 1) {
      if (originalTokens[i - 1] === editedTokens[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  const reversed: DiffChunk[] = [];
  let originalCursor = originalTokens.length;
  let editedCursor = editedTokens.length;

  while (originalCursor > 0 || editedCursor > 0) {
    if (
      originalCursor > 0 &&
      editedCursor > 0 &&
      originalTokens[originalCursor - 1] === editedTokens[editedCursor - 1]
    ) {
      reversed.push({ type: 'same', value: originalTokens[originalCursor - 1] });
      originalCursor -= 1;
      editedCursor -= 1;
      continue;
    }

    if (
      editedCursor > 0 &&
      (originalCursor === 0 || lcs[originalCursor][editedCursor - 1] >= lcs[originalCursor - 1][editedCursor])
    ) {
      reversed.push({ type: 'added', value: editedTokens[editedCursor - 1] });
      editedCursor -= 1;
      continue;
    }

    if (originalCursor > 0) {
      reversed.push({ type: 'removed', value: originalTokens[originalCursor - 1] });
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
  onEditedTextChange,
  onAccept,
  onReject,
}: SectionCardProps) {
  const textareaId = `corrected-text-${section.id}`;
  const diffChunks = useMemo(
    () => buildDiffChunks(section.original_text, editedText),
    [section.original_text, editedText],
  );

  const hasReference = section.reference_text !== null && section.reference_text.length > 0;
  const hasSummary = section.change_summary !== null && section.change_summary.length > 0;
  const isPending = section.status === 'pending' && section.corrected_text === null;

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
        <label className="section-block-label" htmlFor={textareaId}>
          Corrected text
        </label>
        <textarea
          id={textareaId}
          className="section-editor"
          value={editedText}
          onChange={(event) => onEditedTextChange(event.target.value)}
          placeholder={isPending ? 'Proofreading in progress…' : 'Edit the corrected text before accepting'}
          disabled={isPending || isSaving}
          rows={10}
        />
      </div>

      <div className="section-block section-diff">
        <h2 className="section-block-label">Inline diff</h2>
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

      {hasSummary ? (
        <div className="section-block">
          <h2 className="section-block-label">Summary of changes</h2>
          <p className="section-block-content section-block-content--summary">{section.change_summary}</p>
        </div>
      ) : null}

      {hasReference ? (
        <details className="section-reference">
          <summary className="section-reference-toggle">Reference text</summary>
          <p className="section-block-content section-block-content--reference">{section.reference_text}</p>
        </details>
      ) : null}

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

      {actionError ? (
        <p className="review-status-message review-status-message--error" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
