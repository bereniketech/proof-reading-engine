import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ProgressBar } from '../components/ProgressBar';
import { MetricCard } from '../components/MetricCard';
import { apiBaseUrl } from '../lib/constants';

interface InsightsData {
  quality_score: number; grammar_score: number;
  tone: { authority: number; confidence: number; urgency: number };
  vocabulary_diversity: number; lexical_density: number;
  sentiment: { positive: number; neutral: number; negative: number };
  word_count: number; readability_score: number;
}

export function InsightsPage(){
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async (): Promise<void> => {
    if (!session || !sessionId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/insights`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json() as { success: boolean; data?: InsightsData; error?: string };
      if (json.success && json.data) { setInsights(json.data); }
      else { setError(json.error ?? 'Failed to load insights.'); }
    } catch { setError('Failed to load insights.'); }
    finally { setLoading(false); }
  }, [session, sessionId]);

  useEffect(() => { void fetchInsights(); }, [fetchInsights]);

  if (loading) {
    return (
      <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem', height: '2rem', background: 'var(--color-surface-container-highest)', borderRadius: 'var(--radius-lg)', width: '16rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {[1,2,3,4,5].map((i) => (
            <div key={i} style={{ height: '10rem', background: 'var(--color-surface-container-highest)', borderRadius: 'var(--radius-xl)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <p className="feedback error">{error}</p>
        <button onClick={() => void fetchInsights()} style={{ marginTop: '1rem', padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-outline-variant)', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  if (!insights) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>analytics</span>
        <p>Analyze a document first to see insights.</p>
      </div>
    );
  }

  // Sentiment bar chart columns
  const sentimentBars = [
    { label: 'Pos', value: insights.sentiment.positive, color: 'var(--color-tertiary-fixed-dim)' },
    { label: 'Neu', value: insights.sentiment.neutral, color: 'var(--color-outline)' },
    { label: 'Neg', value: insights.sentiment.negative, color: 'var(--color-error)' },
  ];
  const maxSentiment = Math.max(...sentimentBars.map((b) => b.value), 1);

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="font-display" style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Linguistic Insights</h1>
          <p style={{ color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>{insights.word_count.toLocaleString()} words analyzed</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => sessionId && navigate(`/editor/${sessionId}`)} style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-on-surface)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>edit_note</span>
            Back to Editor
          </button>
        </div>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.25rem' }} className="insights-bento">

        {/* Performance Card — col-span-8 */}
        <div style={{ gridColumn: 'span 8' }} className="insights-col-8">
          <MetricCard title="" style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
            {/* Decorative circle */}
            <div aria-hidden style={{ position: 'absolute', right: '-2rem', bottom: '-2rem', width: '10rem', height: '10rem', borderRadius: '50%', background: 'rgba(58,56,139,0.05)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <span style={{ background: 'rgba(58,56,139,0.1)', color: 'var(--color-primary)', fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.75rem', borderRadius: 'var(--radius-full)', textTransform: 'uppercase', letterSpacing: '0.06rem' }}>Overall Quality</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <span className="font-display" style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--color-on-surface)', lineHeight: 1 }}>{insights.quality_score}</span>
              <span style={{ fontSize: '1.5rem', color: 'var(--color-on-surface-variant)', paddingBottom: '0.375rem' }}>/100</span>
              <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-tertiary)', paddingBottom: '0.375rem' }}>trending_up</span>
            </div>
            <ProgressBar label="Grammar & Syntax" value={insights.grammar_score} />
            <ProgressBar label="Readability Score" value={insights.readability_score} color="var(--color-secondary)" />
          </MetricCard>
        </div>

        {/* Tone Analysis Card — col-span-4, glassmorphism */}
        <div style={{ gridColumn: 'span 4' }} className="insights-col-4">
          <MetricCard icon="psychology" title="Tone Analysis" glass style={{ height: '100%' }}>
            <ProgressBar label="Authority" value={insights.tone.authority} color="var(--color-primary)" />
            <ProgressBar label="Confidence" value={insights.tone.confidence} color="var(--color-secondary)" />
            <ProgressBar label="Urgency" value={insights.tone.urgency} color="var(--color-error)" />
            <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--color-surface-container-high)', borderRadius: 'var(--radius-lg)', fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--color-on-surface-variant)' }}>
              "Linguistic Signature: {insights.tone.authority > 60 ? 'Authoritative & Clear' : insights.tone.confidence > 60 ? 'Confident & Direct' : 'Balanced & Measured'}"
            </div>
          </MetricCard>
        </div>

        {/* Vocabulary Diversity — col-span-4 */}
        <div style={{ gridColumn: 'span 4' }} className="insights-col-4">
          <MetricCard icon="menu_book" title="Vocabulary Diversity">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.375rem' }}>
              <span className="font-display" style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-on-surface)', lineHeight: 1 }}>{insights.vocabulary_diversity.toFixed(1)}</span>
              <span style={{ color: 'var(--color-on-surface-variant)', paddingBottom: '0.25rem' }}>/10</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
              {insights.vocabulary_diversity >= 8 ? 'Exceptional word choice variety' : insights.vocabulary_diversity >= 6 ? 'Good vocabulary range' : 'Consider broadening vocabulary'}
            </p>
          </MetricCard>
        </div>

        {/* Lexical Density — col-span-4 */}
        <div style={{ gridColumn: 'span 4' }} className="insights-col-4">
          <MetricCard icon="analytics" title="Lexical Density">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.375rem' }}>
              <span className="font-display" style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-on-surface)', lineHeight: 1 }}>{insights.lexical_density}</span>
              <span style={{ color: 'var(--color-on-surface-variant)', paddingBottom: '0.25rem' }}>%</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
              {insights.lexical_density > 60 ? 'High content-to-filler ratio' : insights.lexical_density > 40 ? 'Balanced content-to-filler ratio' : 'Consider reducing filler words'}
            </p>
          </MetricCard>
        </div>

        {/* Content Sentiment — col-span-8 */}
        <div style={{ gridColumn: 'span 8' }} className="insights-col-8">
          <MetricCard title="Content Sentiment" style={{ background: 'var(--color-surface-container-highest)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: '6rem' }}>
              {sentimentBars.map((bar) => (
                <div key={bar.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.375rem', height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{bar.value}%</span>
                  <div style={{
                    width: '100%', maxWidth: '3rem', borderRadius: 'var(--radius-sm)',
                    background: bar.color,
                    height: `${(bar.value / maxSentiment) * 80}%`,
                    minHeight: '4px',
                    transition: 'height 0.6s ease-out',
                  }} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)' }}>{bar.label}</span>
                </div>
              ))}
            </div>
          </MetricCard>
        </div>

      </div>
    </div>
  );
}
