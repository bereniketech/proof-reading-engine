---
task: 004
feature: independent-ai-reviewer
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [003]
---

# Task 004: Independent AI Reviewer

## Skills
- .kit/skills/data-science-ml/ai-engineer/SKILL.md
- .kit/skills/frameworks-backend/nodejs-backend-patterns/SKILL.md
- .kit/skills/frameworks-frontend/react-ui-patterns/SKILL.md
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

Add an on-demand "AI Review" panel to the session review page: a single GPT-4o call that produces a holistic document review (strengths, weaknesses, recommendations, 0–100 score), cached in the `sessions` table.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/reviewer.ts` | `reviewDocument(sessionId, sections): Promise<ReviewReport>` — GPT-4o call + DB save |
| `backend/src/db/migrations/005_review_score.sql` | Add `review_score` + `review_report` columns to `sessions` |
| `frontend/src/components/AIReviewPanel.tsx` | Collapsible panel component — shows score + report |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sessions.ts` | Add `GET /api/sessions/:id/review` route |
| `frontend/src/ReviewPage.tsx` | Add "AI Review" button; fetch and render `AIReviewPanel` |

---

## Dependencies
_(none — OpenAI SDK already installed: `openai` in `backend/package.json`)_

No new env vars. Existing `OPENAI_API_KEY` is used.

---

## API Contracts
```
GET /api/sessions/:id/review
Headers: Authorization: Bearer <jwt>
Response 200: {
  success: true,
  data: {
    score: number,          // 0–100
    strengths: string[],    // 3–5 items
    weaknesses: string[],   // 3–5 items
    recommendations: string[] // 3–5 items
  }
}
Response 404: { success: false, error: 'Session not found' }
Response 403: { success: false, error: 'Forbidden' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/db/migrations/005_review_score.sql` (create this file exactly)
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_report jsonb;
```

### `backend/src/services/reviewer.ts` (create this file exactly)
```typescript
import { openai } from './openai';
import { supabase } from '../db/supabase';

export interface ReviewReport {
  score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

interface SectionSummary {
  position: number;
  section_type: string;
  corrected_text: string | null;
  original_text: string;
}

/**
 * Run a holistic AI review of all sections in a session.
 * Returns cached result if review_report already exists.
 */
export async function reviewDocument(
  sessionId: string,
  sections: SectionSummary[]
): Promise<ReviewReport> {
  // Return cached result if available
  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('review_score, review_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);

  if (session.review_report !== null && session.review_score !== null) {
    return session.review_report as ReviewReport;
  }

  // Build document text from corrected (or original) sections
  const documentText = sections
    .sort((a, b) => a.position - b.position)
    .map((s) => s.corrected_text ?? s.original_text)
    .join('\n\n');

  const prompt = `You are a professional document reviewer. Analyze the following document and provide a JSON response only — no markdown, no explanation outside the JSON.

Document:
"""
${documentText.slice(0, 12000)}
"""

Respond with exactly this JSON structure:
{
  "score": <integer 0-100 representing overall document quality>,
  "strengths": [<3-5 specific strengths as strings>],
  "weaknesses": [<3-5 specific weaknesses as strings>],
  "recommendations": [<3-5 actionable recommendations as strings>]
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const report = JSON.parse(raw) as ReviewReport;

  // Cache in DB
  const { error: updateError } = await supabase
    .from('sessions')
    .update({ review_score: report.score, review_report: report })
    .eq('id', sessionId);

  if (updateError) throw new Error(`Failed to cache review: ${updateError.message}`);

  return report;
}
```

### `backend/src/routes/sessions.ts` — before → after

Find the existing route file. Add this route (after existing GET routes, before the export):

```typescript
// GET /api/sessions/:id/review
router.get('/:id/review', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;

  // Ownership check
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  if (session.user_id !== userId) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  // Load sections
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('position, section_type, corrected_text, original_text')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) {
    return res.status(500).json({ success: false, error: sectionsError.message });
  }

  try {
    const report = await reviewDocument(sessionId, sections ?? []);
    return res.json({ success: true, data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Review failed';
    return res.status(500).json({ success: false, error: message });
  }
});
```

Also add import at top of `backend/src/routes/sessions.ts`:
```typescript
import { reviewDocument } from '../services/reviewer';
```

### `frontend/src/components/AIReviewPanel.tsx` (create this file exactly)
```tsx
import { useState } from 'react';
import type { ReviewReport } from '../types/review';

interface AIReviewPanelProps {
  sessionId: string;
  authToken: string;
  apiBaseUrl: string;
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
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/review`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = (await res.json()) as { success: boolean; data?: ReviewReport; error?: string };
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
        className="ai-review-btn"
        onClick={handleRun}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Analyzing…' : 'Run AI Review'}
      </button>

      {error && (
        <p className="ai-review-error" role="alert">
          {error}
        </p>
      )}

      {report && (
        <div className="ai-review-result">
          <button
            className="ai-review-toggle"
            onClick={() => setOpen((o) => !o)}
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
```

### Create `frontend/src/types/review.ts`
```typescript
export interface ReviewReport {
  score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}
```

Add CSS to `frontend/src/styles.css`:
```css
/* AI Review Panel */
.ai-review-panel { margin: 1rem 0; }
.ai-review-btn {
  padding: 0.5rem 1rem;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
}
.ai-review-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ai-review-error { color: #dc2626; font-size: 0.875rem; margin-top: 0.5rem; }
.ai-review-toggle {
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.75rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
  margin-top: 0.75rem;
}
.ai-review-body { padding: 0.75rem; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 0.375rem 0.375rem; }
.ai-review-body h4 { font-weight: 600; margin: 0.75rem 0 0.25rem; }
.ai-review-body ul { margin: 0; padding-left: 1.25rem; }
.ai-review-body li { margin-bottom: 0.25rem; font-size: 0.9rem; }
```

### `frontend/src/ReviewPage.tsx` — add AIReviewPanel

Add import:
```typescript
import { AIReviewPanel } from './components/AIReviewPanel';
import { apiBaseUrl } from './lib/constants';
```

In the ReviewPage JSX, find the section above the list of SectionCards (e.g., near the session header / export button area). Add:
```tsx
<AIReviewPanel
  sessionId={session.id}
  authToken={supabaseSession.access_token}
  apiBaseUrl={apiBaseUrl}
/>
```

---

## Codebase Context

### Key Code Snippets
```typescript
// backend/src/routes/sessions.ts — pattern for requireAuth + ownership check
// (from existing upload route pattern)
router.post('/upload', requireAuth, async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  // ... ownership enforced by userId check
});

// backend/src/services/openai.ts — existing openai client export
import OpenAI from 'openai';
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// backend/src/db/supabase.ts — existing supabase client
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

### Key Patterns in Use
- **Ownership check pattern:** Always query `sessions.user_id` and compare to `req.userId` before any data access.
- **GPT JSON mode:** Use `response_format: { type: 'json_object' }` + `JSON.parse()` — never trust raw string parsing.
- **Cache before GPT call:** Check `review_report IS NOT NULL` in DB first; return cached if present — never re-call GPT unnecessarily.
- **Auth token forwarding:** Frontend passes `supabaseSession.access_token` as `Authorization: Bearer` header.
- **`apiBaseUrl` import:** Always import from `frontend/src/lib/constants.ts` — never hardcode `localhost:3001`.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/db/migrations/005_review_score.sql` with the exact SQL above.
2. Apply migration in Supabase dashboard (or via `psql`).
3. Create `backend/src/services/reviewer.ts` with the exact code template above.
4. Open `backend/src/routes/sessions.ts` — add the import for `reviewDocument` and add the `GET /:id/review` route.
5. Create `frontend/src/types/review.ts` with the `ReviewReport` interface.
6. Create `frontend/src/components/AIReviewPanel.tsx` with the exact code template above.
7. Add CSS classes to `frontend/src/styles.css`.
8. Open `frontend/src/ReviewPage.tsx` — add imports and `<AIReviewPanel>` in JSX.
9. Run: `cd backend && npx tsc --noEmit`
10. Run: `cd frontend && npx tsc --noEmit`
11. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/reviewer.test.ts`
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

vi.mock('../db/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { reviewDocument } from './reviewer';
import { openai } from './openai';
import { supabase } from '../db/supabase';

const mockSections = [
  { position: 0, section_type: 'heading', corrected_text: 'Introduction', original_text: 'Intro' },
  { position: 1, section_type: 'paragraph', corrected_text: 'This is the body text of the document.', original_text: 'Body text.' },
];

const mockReport = {
  score: 78,
  strengths: ['Clear structure'],
  weaknesses: ['Lacks citations'],
  recommendations: ['Add references section'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reviewDocument', () => {
  it('returns cached report when review_report exists in DB', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { review_score: 78, review_report: mockReport },
            error: null,
          }),
        }),
      }),
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

    const result = await reviewDocument('session-123', mockSections);
    expect(result).toEqual(mockReport);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('calls GPT-4o and caches result when review_report is null', async () => {
    let callCount = 0;
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: fetch session — no cached report
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { review_score: null, review_report: null },
                error: null,
              }),
            }),
          }),
        };
      }
      // Second call: load sections — skipped (sections passed directly)
      // Third call: update cache
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockReport) } }],
    });

    const result = await reviewDocument('session-456', mockSections);
    expect(result.score).toBe(78);
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `review_report` already in DB | Return cached — skip GPT call entirely |
| GPT returns malformed JSON | `JSON.parse` throws → catch in route handler → return `{ success: false, error: 'Review failed' }` with status 500 |
| Session not found in DB | Return `res.status(404).json({ success: false, error: 'Session not found' })` |
| `session.user_id !== userId` | Return `res.status(403).json({ success: false, error: 'Forbidden' })` |
| Supabase update fails | Throw `Error('Failed to cache review: ' + updateError.message)` |
| Frontend fetch fails (network) | `setError('Review failed')` — display in `.ai-review-error` `<p>` with `role="alert"` |

---

## Acceptance Criteria
- [ ] WHEN `GET /api/sessions/:id/review` is called THEN `{ success: true, data: { score, strengths, weaknesses, recommendations } }` is returned
- [ ] WHEN the report is already cached THEN GPT is not called again
- [ ] WHEN "Run AI Review" is clicked THEN the panel shows a score and three lists
- [ ] WHEN the request fails THEN an error message appears in `.ai-review-error` with `role="alert"`
- [ ] TypeScript strict mode — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
