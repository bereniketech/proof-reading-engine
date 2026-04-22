import { useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface SectionSuggestion {
  suggested_position: number;
  content: string;
  rationale: string;
}

interface SuggestSuccessResponse {
  success: true;
  data: SectionSuggestion;
}

interface SuggestErrorResponse {
  success: false;
  error: string;
}

type SuggestResponse = SuggestSuccessResponse | SuggestErrorResponse;

interface AddSectionModalProps {
  sessionId: string;
  authToken: string;
  initialTitle?: string;
  totalSections: number;
  onConfirm: (title: string, position: number, content: string) => Promise<void>;
  onClose: () => void;
}

export function AddSectionModal({
  sessionId,
  authToken,
  initialTitle = '',
  totalSections,
  onConfirm,
  onClose,
}: AddSectionModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [suggestion, setSuggestion] = useState<SectionSuggestion | null>(null);
  const [position, setPosition] = useState<number>(0);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async (): Promise<void> => {
    if (!title.trim()) {
      setError('Section title is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/sections/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json = (await res.json()) as SuggestResponse;
      if (!json.success || !('data' in json) || !json.data) {
        throw new Error((json as SuggestErrorResponse).error ?? 'Suggestion failed');
      }
      setSuggestion(json.data);
      setPosition(json.data.suggested_position);
      setContent(json.data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suggestion failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (): Promise<void> => {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm(title.trim(), position, content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Insert failed');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add Section">
      <div className="modal-box">
        <button className="modal-close" onClick={onClose} aria-label="Close" type="button">
          ✕
        </button>
        <h3 className="modal-title">Add Section</h3>

        <label className="modal-label" htmlFor="section-title">
          Section Title
        </label>
        <input
          id="section-title"
          className="modal-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Conclusion"
        />

        <button
          className="modal-suggest-btn"
          onClick={() => { void handleSuggest(); }}
          disabled={loading}
          type="button"
        >
          {loading ? 'Generating suggestion…' : 'Get AI Suggestion'}
        </button>

        {error !== null ? (
          <p className="modal-error" role="alert">
            {error}
          </p>
        ) : null}

        {suggestion !== null ? (
          <div className="modal-preview">
            <p className="modal-rationale">
              <em>{suggestion.rationale}</em>
            </p>

            <label className="modal-label" htmlFor="section-position">
              Insert at position
            </label>
            <input
              id="section-position"
              className="modal-input"
              type="number"
              min={0}
              max={totalSections}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
            />

            <label className="modal-label" htmlFor="section-content">
              Content (editable)
            </label>
            <textarea
              id="section-content"
              className="modal-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
            />

            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="modal-confirm-btn"
                onClick={() => { void handleConfirm(); }}
                disabled={confirming}
                type="button"
              >
                {confirming ? 'Inserting…' : 'Insert Section'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
