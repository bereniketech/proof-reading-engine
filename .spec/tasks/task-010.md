---
task: 010
feature: version-diffing
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [009]
---

# Task 010: Version Diffing & Quality Delta

## Skills
- .kit/skills/frameworks-backend/nodejs-backend-patterns/SKILL.md
- .kit/skills/frameworks-frontend/react-ui-patterns/SKILL.md
- .kit/skills/data-backend/postgres-patterns/SKILL.md
- .kit/skills/core/karpathy-principles/SKILL.md

## Agents
- @web-backend-expert
- @web-frontend-expert

## Commands
- /verify
- /task-handoff

> Load the skills, agents, and commands listed above before reading anything else. Do not load context not listed here.

---

## Objective

Add a version diff panel on the dashboard: users select two sessions of the same document and see a quality delta comparing AI detection score, readability score, tone consistency, word count, and correction acceptance rate.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/diff-calculator.ts` | `calculateDiff(sessionA, sectionsA, sessionB, sectionsB): DiffReport` |
| `frontend/src/components/DiffPanel.tsx` | Displays the diff comparison table |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sessions.ts` | Add `GET /api/sessions/:id/diff/:compareId` route |
| `frontend/src/pages/DashboardPage.tsx` | Add "Compare" button on DocumentCard + DiffPanel drawer |

---

## Dependencies
_(none — all metrics are computed from existing DB columns)_

---

## API Contracts
```
GET /api/sessions/:id/diff/:compareId
Headers: Authorization: Bearer <jwt>
Response 200: {
  success: true,
  data: {
    session_a: { id: string, filename: string, created_at: string },
    session_b: { id: string, filename: string, created_at: string },
    metrics: {
      ai_score_avg:      { a: number | null, b: number | null, delta: number | null },
      readability_avg:   { a: number | null, b: number | null, delta: number | null },
      tone_consistency:  { a: number | null, b: number | null, delta: number | null },
      word_count:        { a: number,        b: number,        delta: number },
      acceptance_rate:   { a: number,        b: number,        delta: number }
    }
  }
}
Response 403: { success: false, error: 'Forbidden' }
Response 404: { success: false, error: 'Session not found' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/services/diff-calculator.ts` (create this file exactly)
```typescript
export interface MetricComparison {
  a: number | null;
  b: number | null;
  delta: number | null;
}

export interface DiffReport {
  session_a: { id: string; filename: string; created_at: string };
  session_b: { id: string; filename: string; created_at: string };
  metrics: {
    ai_score_avg: MetricComparison;
    readability_avg: MetricComparison;
    tone_consistency: MetricComparison;
    word_count: { a: number; b: number; delta: number };
    acceptance_rate: { a: number; b: number; delta: number };
  };
}

interface SessionRow {
  id: string;
  filename: string;
  created_at: string;
  tone_consistency_score: number | null;
}

interface SectionRow {
  ai_score: number | null;
  corrected_text: string | null;
  original_text: string;
  status: string;
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
}

function wordCount(sections: SectionRow[]): number {
  return sections.reduce((total, s) => {
    const text = s.corrected_text ?? s.original_text;
    return total + text.split(/\s+/).filter((w) => w.length > 0).length;
  }, 0);
}

function acceptanceRate(sections: SectionRow[]): number {
  const relevant = sections.filter((s) => s.corrected_text !== null);
  if (relevant.length === 0) return 0;
  const accepted = relevant.filter((s) => s.status === 'accepted').length;
  return Math.round((accepted / relevant.length) * 100);
}

function delta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((b - a) * 10) / 10;
}

export function calculateDiff(
  sessionA: SessionRow,
  sectionsA: SectionRow[],
  sessionB: SessionRow,
  sectionsB: SectionRow[]
): DiffReport {
  const aiA = avg(sectionsA.map((s) => s.ai_score));
  const aiB = avg(sectionsB.map((s) => s.ai_score));

  const wcA = wordCount(sectionsA);
  const wcB = wordCount(sectionsB);

  const arA = acceptanceRate(sectionsA);
  const arB = acceptanceRate(sectionsB);

  const tcA = sessionA.tone_consistency_score;
  const tcB = sessionB.tone_consistency_score;

  return {
    session_a: { id: sessionA.id, filename: sessionA.filename, created_at: sessionA.created_at },
    session_b: { id: sessionB.id, filename: sessionB.filename, created_at: sessionB.created_at },
    metrics: {
      ai_score_avg: { a: aiA, b: aiB, delta: delta(aiA, aiB) },
      readability_avg: { a: null, b: null, delta: null }, // FK grade computed client-side; not stored in DB
      tone_consistency: { a: tcA, b: tcB, delta: delta(tcA, tcB) },
      word_count: { a: wcA, b: wcB, delta: wcB - wcA },
      acceptance_rate: { a: arA, b: arB, delta: arB - arA },
    },
  };
}
```

### `backend/src/routes/sessions.ts` — add diff route

Add import:
```typescript
import { calculateDiff } from '../services/diff-calculator';
```

Add route (after tone route):
```typescript
// GET /api/sessions/:id/diff/:compareId
router.get('/:id/diff/:compareId', requireAuth, async (req, res) => {
  const sessionAId = req.params.id;
  const sessionBId = req.params.compareId;
  const userId = (req as AuthenticatedRequest).userId;

  // Fetch both sessions
  const [resA, resB] = await Promise.all([
    supabase.from('sessions').select('id, user_id, filename, created_at, tone_consistency_score').eq('id', sessionAId).single(),
    supabase.from('sessions').select('id, user_id, filename, created_at, tone_consistency_score').eq('id', sessionBId).single(),
  ]);

  if (resA.error || !resA.data) return res.status(404).json({ success: false, error: 'Session not found' });
  if (resB.error || !resB.data) return res.status(404).json({ success: false, error: 'Session not found' });
  if (resA.data.user_id !== userId || resB.data.user_id !== userId) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const [secA, secB] = await Promise.all([
    supabase.from('sections').select('ai_score, corrected_text, original_text, status').eq('session_id', sessionAId),
    supabase.from('sections').select('ai_score, corrected_text, original_text, status').eq('session_id', sessionBId),
  ]);

  if (secA.error || secB.error) {
    return res.status(500).json({ success: false, error: 'Failed to load sections' });
  }

  const report = calculateDiff(resA.data, secA.data ?? [], resB.data, secB.data ?? []);
  return res.json({ success: true, data: report });
});
```

### `frontend/src/components/DiffPanel.tsx` (create this file exactly)
```tsx
import { useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface MetricComparison {
  a: number | null;
  b: number | null;
  delta: number | null;
}

interface DiffReport {
  session_a: { id: string; filename: string; created_at: string };
  session_b: { id: string; filename: string; created_at: string };
  metrics: {
    ai_score_avg: MetricComparison;
    readability_avg: MetricComparison;
    tone_consistency: MetricComparison;
    word_count: { a: number; b: number; delta: number };
    acceptance_rate: { a: number; b: number; delta: number };
  };
}

interface DiffPanelProps {
  baseSessionId: string;
  compareSessionId: string;
  authToken: string;
  onClose: () => void;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="diff-delta diff-delta--neutral">—</span>;
  if (delta > 0) return <span className="diff-delta diff-delta--up">+{delta}</span>;
  if (delta < 0) return <span className="diff-delta diff-delta--down">{delta}</span>;
  return <span className="diff-delta diff-delta--neutral">0</span>;
}

export function DiffPanel({ baseSessionId, compareSessionId, authToken, onClose }: DiffPanelProps) {
  const [report, setReport] = useState<DiffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    setLoading(true);
    fetch(`${apiBaseUrl}/api/sessions/${baseSessionId}/diff/${compareSessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((json: { success: boolean; data?: DiffReport; error?: string }) => {
        if (!json.success || !json.data) throw new Error(json.error ?? 'Diff failed');
        setReport(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Diff failed'))
      .finally(() => setLoading(false));
  });

  const rows: Array<{ label: string; key: keyof DiffReport['metrics'] }> = [
    { label: 'AI Score (avg)', key: 'ai_score_avg' },
    { label: 'Tone Consistency', key: 'tone_consistency' },
    { label: 'Word Count', key: 'word_count' },
    { label: 'Acceptance Rate (%)', key: 'acceptance_rate' },
  ];

  return (
    <div className="diff-panel">
      <div className="diff-panel-header">
        <h3>Version Comparison</h3>
        <button className="diff-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {loading && <p className="diff-loading">Loading comparison…</p>}
      {error && <p className="diff-error" role="alert">{error}</p>}

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
            {rows.map(({ label, key }) => {
              const m = report.metrics[key] as { a: number | null; b: number | null; delta: number | null };
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{m.a ?? '—'}</td>
                  <td>{m.b ?? '—'}</td>
                  <td><DeltaBadge delta={m.delta} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Add CSS to `frontend/src/styles.css`:
```css
/* Diff Panel */
.diff-panel { padding: 1rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; background: white; }
.diff-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.diff-panel-header h3 { margin: 0; font-size: 1rem; font-weight: 700; }
.diff-close { background: none; border: none; cursor: pointer; color: #64748b; font-size: 1rem; }
.diff-loading, .diff-error { font-size: 0.875rem; color: #64748b; }
.diff-error { color: #dc2626; }
.diff-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.diff-table th, .diff-table td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
.diff-table th { font-weight: 600; color: #64748b; font-size: 0.75rem; text-transform: uppercase; }
.diff-delta { font-weight: 700; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.8rem; }
.diff-delta--up { color: #16a34a; background: #dcfce7; }
.diff-delta--down { color: #dc2626; background: #fee2e2; }
.diff-delta--neutral { color: #64748b; background: #f1f5f9; }
```

---

## Codebase Context

### Key Code Snippets
```typescript
// SessionRecord in DashboardPage / ReviewPage
interface SessionRecord {
  id: string; filename: string; file_type: string; status: string;
  created_at: string; updated_at: string;
}

// DashboardPage.tsx — existing sessions list fetch + DocumentCard render pattern
// Each session has an id and filename
// Add a "Compare" button to DocumentCard that triggers DiffPanel
```

### Key Patterns in Use
- **`calculateDiff` is pure:** No DB calls inside — all data fetched in the route handler, passed in. Easy to unit test.
- **Readability avg is always null:** FK grade level is computed client-side and never stored in DB. The metric row shows `—` for both columns.
- **Delta direction convention:** Positive delta = improvement for `acceptance_rate`, negative delta = improvement for `ai_score_avg` (less AI content is better). UI shows raw numeric delta — interpretation is left to the user.
- **Parallel fetches:** Use `Promise.all` for both sessions and both section sets — never await sequentially.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/services/diff-calculator.ts` with exact code above.
2. Open `backend/src/routes/sessions.ts` — add import + `GET /:id/diff/:compareId` route.
3. Create `frontend/src/components/DiffPanel.tsx` with exact code above.
4. Append CSS to `frontend/src/styles.css`.
5. Open `frontend/src/pages/DashboardPage.tsx` — add a "Compare" button to each DocumentCard (or session row). On click: set `compareTarget = session.id`, show `DiffPanel` with `baseSessionId` = another selected session and `compareSessionId = compareTarget`. (Simplest UX: add a "Compare with previous" button that compares the current session with the immediately preceding session by `created_at`.)
6. Run: `cd backend && npx tsc --noEmit`
7. Run: `cd frontend && npx tsc --noEmit`
8. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/diff-calculator.test.ts`
```typescript
import { describe, expect, it } from 'vitest';
import { calculateDiff } from './diff-calculator';

const sessionA = { id: 'a', filename: 'doc-v1.docx', created_at: '2026-01-01T00:00:00Z', tone_consistency_score: 70 };
const sessionB = { id: 'b', filename: 'doc-v2.docx', created_at: '2026-02-01T00:00:00Z', tone_consistency_score: 85 };

const sectionsA = [
  { ai_score: 80, corrected_text: 'Fixed text', original_text: 'Original', status: 'accepted' },
  { ai_score: 60, corrected_text: 'Also fixed', original_text: 'Also original', status: 'accepted' },
];

const sectionsB = [
  { ai_score: 40, corrected_text: 'Better text now', original_text: 'Original', status: 'accepted' },
  { ai_score: 30, corrected_text: 'Improved', original_text: 'Also original', status: 'rejected' },
];

describe('calculateDiff', () => {
  it('computes ai_score_avg correctly', () => {
    const report = calculateDiff(sessionA, sectionsA, sessionB, sectionsB);
    expect(report.metrics.ai_score_avg.a).toBe(70);
    expect(report.metrics.ai_score_avg.b).toBe(35);
    expect(report.metrics.ai_score_avg.delta).toBe(-35);
  });

  it('computes tone_consistency delta', () => {
    const report = calculateDiff(sessionA, sectionsA, sessionB, sectionsB);
    expect(report.metrics.tone_consistency.a).toBe(70);
    expect(report.metrics.tone_consistency.b).toBe(85);
    expect(report.metrics.tone_consistency.delta).toBe(15);
  });

  it('computes word_count delta', () => {
    const report = calculateDiff(sessionA, sectionsA, sessionB, sectionsB);
    expect(report.metrics.word_count.a).toBe(4); // "Fixed text" + "Also fixed" = 2+2
    expect(report.metrics.word_count.delta).toBeTypeOf('number');
  });

  it('computes acceptance_rate for B as 50 when 1 of 2 accepted', () => {
    const report = calculateDiff(sessionA, sectionsA, sessionB, sectionsB);
    expect(report.metrics.acceptance_rate.a).toBe(100);
    expect(report.metrics.acceptance_rate.b).toBe(50);
    expect(report.metrics.acceptance_rate.delta).toBe(-50);
  });

  it('returns null delta when tone_consistency is null for one session', () => {
    const sessionANoTone = { ...sessionA, tone_consistency_score: null };
    const report = calculateDiff(sessionANoTone, sectionsA, sessionB, sectionsB);
    expect(report.metrics.tone_consistency.delta).toBeNull();
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| Either session not found | `res.status(404).json({ success: false, error: 'Session not found' })` |
| Either session belongs to different user | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| `tone_consistency_score` is null on one session | `delta` field is `null` in response — frontend renders `—` |
| No sections in one session | All metrics for that side are `0` or `null` |
| Frontend fetch fails | `setError(err.message)` — display in `.diff-error` with `role="alert"` |

---

## Acceptance Criteria
- [ ] WHEN `GET /api/sessions/:id/diff/:compareId` is called THEN a DiffReport with all 5 metrics is returned
- [ ] WHEN a metric has no data THEN its delta is `null` and renders as `—`
- [ ] WHEN `acceptance_rate` improves THEN delta shows green `+N`
- [ ] WHEN `ai_score_avg` decreases THEN delta shows red `-N`
- [ ] Both sessions must belong to the authenticated user — 403 if not
- [ ] TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
