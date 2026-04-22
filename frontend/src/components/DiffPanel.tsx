import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface MetricComparison {
  a: number | null;
  b: number | null;
  delta: number | null;
}

interface NumericMetric {
  a: number;
  b: number;
  delta: number;
}

interface DiffReport {
  session_a: { id: string; filename: string; created_at: string };
  session_b: { id: string; filename: string; created_at: string };
  metrics: {
    ai_score_avg: MetricComparison;
    readability_avg: MetricComparison;
    tone_consistency: MetricComparison;
    word_count: NumericMetric;
    acceptance_rate: NumericMetric;
  };
}

interface ApiDiffResponse {
  success: boolean;
  data?: DiffReport;
  error?: string;
}

interface DiffPanelProps {
  baseSessionId: string;
  compareSessionId: string;
  authToken: string;
  onClose: () => void;
}

interface MetricRow {
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="diff-delta diff-delta--neutral">—</span>;
  if (delta > 0) return <span className="diff-delta diff-delta--up">+{delta}</span>;
  if (delta < 0) return <span className="diff-delta diff-delta--down">{delta}</span>;
  return <span className="diff-delta diff-delta--neutral">0</span>;
}

function buildRows(metrics: DiffReport['metrics']): MetricRow[] {
  return [
    {
      label: 'AI Score (avg)',
      a: metrics.ai_score_avg.a,
      b: metrics.ai_score_avg.b,
      delta: metrics.ai_score_avg.delta,
    },
    {
      label: 'Tone Consistency',
      a: metrics.tone_consistency.a,
      b: metrics.tone_consistency.b,
      delta: metrics.tone_consistency.delta,
    },
    {
      label: 'Word Count',
      a: metrics.word_count.a,
      b: metrics.word_count.b,
      delta: metrics.word_count.delta,
    },
    {
      label: 'Acceptance Rate (%)',
      a: metrics.acceptance_rate.a,
      b: metrics.acceptance_rate.b,
      delta: metrics.acceptance_rate.delta,
    },
  ];
}

export function DiffPanel({ baseSessionId, compareSessionId, authToken, onClose }: DiffPanelProps) {
  const [report, setReport] = useState<DiffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setReport(null);

    fetch(`${apiBaseUrl}/api/sessions/${baseSessionId}/diff/${compareSessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json() as Promise<ApiDiffResponse>)
      .then((json) => {
        if (!json.success || !json.data) throw new Error(json.error ?? 'Diff failed');
        setReport(json.data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Diff failed');
      })
      .finally(() => setLoading(false));
  }, [baseSessionId, compareSessionId, authToken]);

  const rows = report ? buildRows(report.metrics) : [];

  return (
    <div className="diff-panel">
      <div className="diff-panel-header">
        <h3>Version Comparison</h3>
        <button className="diff-close" onClick={onClose} aria-label="Close">
          &#x2715;
        </button>
      </div>

      {loading && <p className="diff-loading">Loading comparison...</p>}
      {error && (
        <p className="diff-error" role="alert">
          {error}
        </p>
      )}

      {report && (
        <table className="diff-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>{new Date(report.session_a.created_at).toLocaleDateString()}</th>
              <th>{new Date(report.session_b.created_at).toLocaleDateString()}</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.a ?? '—'}</td>
                <td>{row.b ?? '—'}</td>
                <td>
                  <DeltaBadge delta={row.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
