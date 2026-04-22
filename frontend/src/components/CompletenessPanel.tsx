import { useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface CompletenessResult {
  completeness_score: number;
  document_type: string;
  present_sections: string[];
  missing_sections: string[];
  optional_missing: string[];
}

interface CompletenessPanelProps {
  sessionId: string;
  authToken: string;
  onAddSection?: (sectionTitle: string) => void;
}

export function CompletenessPanel({ sessionId, authToken, onAddSection }: CompletenessPanelProps) {
  const [result, setResult] = useState<CompletenessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/completeness`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = (await res.json()) as { success: boolean; data?: CompletenessResult; error?: string };
      if (!json.success || !json.data) throw new Error(json.error ?? 'Completeness check failed');
      setResult(json.data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Completeness check failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="completeness-panel">
      <button
        className="completeness-btn"
        onClick={() => { void handleCheck(); }}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Checking…' : 'Check Completeness'}
      </button>

      {error && (
        <p className="completeness-error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="completeness-result">
          <button
            className="completeness-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            Completeness: {result.completeness_score}/100 — {result.document_type} {open ? '▲' : '▼'}
          </button>

          {open && (
            <div className="completeness-body">
              {result.missing_sections.length > 0 && (
                <div className="completeness-missing">
                  <h4>Missing Required Sections</h4>
                  <ul>
                    {result.missing_sections.map((section) => (
                      <li key={section}>
                        {section}
                        {onAddSection && (
                          <button
                            className="add-section-link"
                            onClick={() => onAddSection(section)}
                          >
                            + Add
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.optional_missing.length > 0 && (
                <div className="completeness-optional">
                  <h4>Optional Sections Not Present</h4>
                  <ul>
                    {result.optional_missing.map((section) => (
                      <li key={section}>{section}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.missing_sections.length === 0 && (
                <p className="completeness-ok">All required sections are present.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
