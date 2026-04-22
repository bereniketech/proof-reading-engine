import { useState } from 'react';

interface ClaimFlag {
  section_id: string;
  position: number;
  snippet: string;
  claim_type: string;
  needs_citation: boolean;
}

interface CitationReport {
  flagged_count: number;
  claims: ClaimFlag[];
}

interface CitationPanelProps {
  sessionId: string;
  authToken: string;
  apiBaseUrl: string;
  onScrollToSection?: (sectionId: string) => void;
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  statistical: 'Statistical',
  causal: 'Causal',
  authority: 'Authority',
  general: 'Factual',
};

export function CitationPanel({ sessionId, authToken, apiBaseUrl, onScrollToSection }: CitationPanelProps) {
  const [report, setReport] = useState<CitationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleDetect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/citations`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = (await res.json()) as { success: boolean; data?: CitationReport; error?: string };
      if (!json.success || !json.data) throw new Error(json.error ?? 'Detection failed');
      setReport(json.data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="citation-panel">
      <button
        type="button"
        className="citation-btn toolbar-btn"
        onClick={() => { void handleDetect(); }}
        disabled={loading}
        aria-busy={loading}
        title="Scan for statistical, causal, and factual claims that lack citations — highlights sections that need references added"
      >
        {loading ? 'Scanning…' : 'Unsupported Claims'}
      </button>

      {error && <p className="citation-error" role="alert">{error}</p>}

      {report && (
        <div className="citation-result">
          <button
            className="citation-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {report.flagged_count === 0
              ? 'No unsupported claims found ✓'
              : `${report.flagged_count} claim${report.flagged_count === 1 ? '' : 's'} need citation`} {open ? '▲' : '▼'}
          </button>

          {open && report.flagged_count > 0 && (
            <div className="citation-body">
              {report.claims.map((claim, i) => (
                <div key={`${claim.section_id}-${i}`} className="citation-claim">
                  <div className="citation-claim-header">
                    <span className="citation-type-badge">{CLAIM_TYPE_LABELS[claim.claim_type] ?? claim.claim_type}</span>
                    <span className="citation-section-label">Section {claim.position + 1}</span>
                    {onScrollToSection && (
                      <button
                        className="citation-scroll-btn"
                        onClick={() => onScrollToSection(claim.section_id)}
                      >
                        Jump to section
                      </button>
                    )}
                  </div>
                  <p className="citation-snippet">&ldquo;{claim.snippet}&rdquo;</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
