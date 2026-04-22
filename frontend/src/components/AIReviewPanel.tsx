import { useState } from 'react';
import type { ReviewReport } from '../types/review';

interface AIReviewPanelProps {
  sessionId: string;
  authToken: string;
  apiBaseUrl: string;
}

interface ReviewApiResponse {
  success: boolean;
  data?: ReviewReport;
  error?: string;
}

export function AIReviewPanel({ sessionId, authToken, apiBaseUrl }: AIReviewPanelProps) {
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}/review`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = (await res.json()) as ReviewApiResponse;
      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Review failed');
      }
      setReport(json.data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ai-review-panel">
      <button
        type="button"
        className="ai-review-btn toolbar-btn"
        onClick={() => { void handleRun(); }}
        disabled={loading}
        aria-busy={loading}
        title="Run a full AI-powered review of the document — scores quality, highlights strengths, weaknesses, and gives recommendations"
      >
        {loading ? 'Analyzing…' : 'AI Review'}
      </button>

      {error && (
        <p className="ai-review-error" role="alert">
          {error}
        </p>
      )}

      {report && (
        <div className="ai-review-result">
          <button
            type="button"
            className="ai-review-toggle"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
          >
            AI Review — Score: {report.score}/100 {open ? '▲' : '▼'}
          </button>

          {open && (
            <div className="ai-review-body">
              <section>
                <h4>Strengths</h4>
                <ul>
                  {report.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h4>Weaknesses</h4>
                <ul>
                  {report.weaknesses.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h4>Recommendations</h4>
                <ul>
                  {report.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
