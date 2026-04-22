import { useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface SectionToneResult {
  section_id: string;
  position: number;
  tone_label: string;
  tone_score: number;
  is_outlier: boolean;
}

interface ToneCheckResult {
  consistency_score: number;
  dominant_tone: string;
  sections: SectionToneResult[];
}

interface ToneApiResponse {
  success: boolean;
  data?: ToneCheckResult;
  error?: string;
}

interface TonePanelProps {
  sessionId: string;
  authToken: string;
}

export function TonePanel({ sessionId, authToken }: TonePanelProps) {
  const [result, setResult] = useState<ToneCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}/tone`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        },
      );
      const json = (await res.json()) as ToneApiResponse;
      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Tone check failed');
      }
      setResult(json.data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tone check failed');
    } finally {
      setLoading(false);
    }
  }

  const outliers = result?.sections.filter((s) => s.is_outlier) ?? [];

  return (
    <div className="tone-panel">
      <button
        type="button"
        className="tone-btn toolbar-btn"
        onClick={() => { void handleCheck(); }}
        disabled={loading}
        aria-busy={loading}
        title="Check whether all sections share a consistent tone and writing style — flags outlier sections that shift voice"
      >
        {loading ? 'Checking tone…' : 'Tone Consistency'}
      </button>

      {error ? <p className="tone-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="tone-result">
          <button
            className="tone-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            Tone: {result.dominant_tone} &mdash; Consistency {result.consistency_score}/100{' '}
            {open ? '▲' : '▼'}
          </button>

          {open ? (
            <div className="tone-body">
              {outliers.length > 0 ? (
                <div className="tone-outliers">
                  <h4>Outlier Sections</h4>
                  <ul>
                    {outliers.map((s) => (
                      <li key={s.section_id}>
                        Section {s.position + 1}: <strong>{s.tone_label}</strong> (score:{' '}
                        {s.tone_score})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="tone-ok">All sections match the dominant tone.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
