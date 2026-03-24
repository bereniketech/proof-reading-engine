---
task: 012
feature: editorial-intelligence-ui
status: pending
depends_on: [011]
---

# Task 012: Build InsightsPage

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app
Commands: /verify, /task-handoff

---

## Objective
Replace the `InsightsPage` stub with a full analytics dashboard matching the stitch design. Fetch data from `GET /api/sessions/:id/insights` and render 5 metric card types: Performance (quality + grammar), Tone Analysis, Vocabulary Diversity, Lexical Density, and Content Sentiment. Also create reusable `ProgressBar` and `MetricCard` components.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/lib/constants.ts — apiBaseUrl
export const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';
```

```typescript
// Insights API response shape (from task-011)
interface InsightsData {
  quality_score: number;        // 0–100
  grammar_score: number;        // 0–100
  tone: {
    authority: number;          // 0–100
    confidence: number;         // 0–100
    urgency: number;            // 0–100
  };
  vocabulary_diversity: number; // 0–10
  lexical_density: number;      // 0–100
  sentiment: {
    positive: number;           // 0–100 (%)
    neutral: number;
    negative: number;
  };
  word_count: number;
  readability_score: number;    // 0–100
}
```

```typescript
// frontend/src/context/AuthContext.tsx — session for auth token
export function useAuth(): AuthContextValue // { session, user, loading, signOut }
```

### Key Patterns in Use
- **Read `:sessionId` from `useParams()`** — same pattern as EditorPage.
- **Bento grid** using CSS grid — 12-column on desktop, single column on mobile.
- **No Tailwind** — use inline styles and existing CSS variables.

---

## Handoff from Previous Task
**Files changed by previous task:** `backend/src/routes/insights.ts`, `backend/src/server.ts`
**Decisions made:** Insights endpoint returns all 8 computed metrics.
**Context for this task:** Backend ready. Now build the frontend page.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Create `frontend/src/components/ProgressBar.tsx`:

```typescript
interface ProgressBarProps {
  label: string;
  value: number;         // 0–100
  color?: string;        // CSS color string, defaults to primary
  showValue?: boolean;
}

export function ProgressBar({ label, value, color, showValue = true }: ProgressBarProps): JSX.Element {
  const trackColor = color ?? 'var(--color-primary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>{label}</span>
        {showValue && <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{value}%</span>}
      </div>
      <div style={{ height: '0.5rem', borderRadius: 'var(--radius-full)', background: 'var(--color-surface-container-highest)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 'var(--radius-full)',
          background: trackColor,
          width: `${Math.max(0, Math.min(100, value))}%`,
          transition: 'width 0.6s ease-out',
        }} />
      </div>
    </div>
  );
}
```

2. Create `frontend/src/components/MetricCard.tsx`:

```typescript
import type { ReactNode, CSSProperties } from 'react';

interface MetricCardProps {
  icon?: string;         // Material Symbol name
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  glass?: boolean;
}

export function MetricCard({ icon, title, children, style, glass }: MetricCardProps): JSX.Element {
  return (
    <div
      className={glass ? 'glass' : undefined}
      style={{
        background: glass ? undefined : 'var(--color-surface-container-lowest)',
        borderRadius: 'var(--radius-xl)', padding: '1.5rem',
        boxShadow: '0 2px 8px rgba(19,27,46,0.06)',
        display: 'flex', flexDirection: 'column', gap: '1rem',
        ...style,
      }}
    >
      {(icon || title) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {icon && (
            <div style={{
              width: '2.25rem', height: '2.25rem', borderRadius: '50%',
              background: 'var(--color-surface-container-highest)',
              display: 'grid', placeItems: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-tertiary)' }}>{icon}</span>
            </div>
          )}
          <h3 className="font-display" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}
```

3. Replace `frontend/src/pages/InsightsPage.tsx` stub:

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

export function InsightsPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async (): Promise<void> => {
    if (!session || !sessionId) return;
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
  };

  useEffect(() => { void fetchInsights(); }, [session, sessionId]);

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
```

4. Add responsive CSS to `styles.css`:
   ```css
   .insights-bento { grid-template-columns: 1fr; }
   @media (min-width: 768px) { .insights-bento { grid-template-columns: repeat(12, 1fr); } }
   .insights-col-8 { grid-column: span 1; }
   .insights-col-4 { grid-column: span 1; }
   @media (min-width: 768px) {
     .insights-col-8 { grid-column: span 8; }
     .insights-col-4 { grid-column: span 4; }
   }
   ```

5. Run `npm run typecheck` — must pass.

_Requirements: 6.1–6.9_
_Skills: /build-website-web-app — page, data visualization_

---

## Acceptance Criteria
- [ ] All 5 card types render with real data from `GET /api/sessions/:id/insights`.
- [ ] `ProgressBar` fills correctly for 0 and 100 values.
- [ ] Sentiment bar chart shows proportional column heights.
- [ ] Loading state shows skeleton placeholders.
- [ ] Error state shows retry button.
- [ ] Mobile: cards stack single column.
- [ ] `npm run typecheck` exits 0.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
