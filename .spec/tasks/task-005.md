---
task: 005
feature: tone-consistency-check
status: complete
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [004]
---

# Task 005: Tone & Audience Consistency Check

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

Add per-section tone labels and a session-level consistency score: GPT-4o classifies each section's tone, then a consistency score (0–100) is computed and cached, with flagged outlier sections surfaced in a ReviewPage panel.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/tone-checker.ts` | `runToneCheck(sessionId, sections): Promise<ToneCheckResult>` |
| `backend/src/db/migrations/006_tone_check.sql` | Add tone columns to `sections` + `sessions` |
| `frontend/src/components/TonePanel.tsx` | Displays consistency score + outlier sections |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sessions.ts` | Add `GET /api/sessions/:id/tone` route |
| `frontend/src/ReviewPage.tsx` | Add "Check Tone" button and render `TonePanel` |

---

## Dependencies
_(none — OpenAI SDK already installed)_

---

## API Contracts
```
GET /api/sessions/:id/tone
Headers: Authorization: Bearer <jwt>
Response 200: {
  success: true,
  data: {
    consistency_score: number,   // 0–100
    dominant_tone: string,       // e.g. "formal"
    sections: Array<{
      section_id: string,
      position: number,
      tone_label: string,        // e.g. "formal" | "informal" | "neutral" | "persuasive" | "academic"
      tone_score: number,        // 0–100 alignment to dominant tone
      is_outlier: boolean
    }>
  }
}
Response 404: { success: false, error: 'Session not found' }
Response 403: { success: false, error: 'Forbidden' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/db/migrations/006_tone_check.sql` (create this file exactly)
```sql
ALTER TABLE sections ADD COLUMN IF NOT EXISTS tone_label text;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS tone_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tone_consistency_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tone_report jsonb;
```

### `backend/src/services/tone-checker.ts` (create this file exactly)
```typescript
import { openai } from './openai';
import { supabase } from '../db/supabase';

export interface SectionToneResult {
  section_id: string;
  position: number;
  tone_label: string;
  tone_score: number;
  is_outlier: boolean;
}

export interface ToneCheckResult {
  consistency_score: number;
  dominant_tone: string;
  sections: SectionToneResult[];
}

interface SectionInput {
  id: string;
  position: number;
  corrected_text: string | null;
  original_text: string;
}

/**
 * Run tone consistency check for all sections in a session.
 * Returns cached result if tone_report already set on session.
 */
export async function runToneCheck(
  sessionId: string,
  sections: SectionInput[]
): Promise<ToneCheckResult> {
  // Check cache
  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('tone_consistency_score, tone_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);

  if (session.tone_report !== null && session.tone_consistency_score !== null) {
    return session.tone_report as ToneCheckResult;
  }

  // Build per-section text snippets (cap at 500 chars each)
  const sectionTexts = sections
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      position: s.position,
      text: (s.corrected_text ?? s.original_text).slice(0, 500),
    }));

  const prompt = `You are a professional document editor analyzing writing tone consistency.

Analyze the tone of each section below and return a JSON object only — no markdown.

Sections:
${JSON.stringify(sectionTexts, null, 2)}

Return exactly this JSON structure:
{
  "dominant_tone": "<the most common tone across all sections>",
  "consistency_score": <integer 0-100, where 100 = perfectly consistent tone throughout>,
  "sections": [
    {
      "section_id": "<id from input>",
      "position": <position from input>,
      "tone_label": "<one of: formal | informal | neutral | persuasive | academic | conversational | technical>",
      "tone_score": <integer 0-100, alignment to dominant_tone>,
      "is_outlier": <boolean — true if tone_score < 50>
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const result = JSON.parse(raw) as ToneCheckResult;

  // Persist per-section labels
  for (const s of result.sections) {
    await supabase
      .from('sections')
      .update({ tone_label: s.tone_label, tone_score: s.tone_score })
      .eq('id', s.section_id);
  }

  // Cache session-level result
  await supabase
    .from('sessions')
    .update({
      tone_consistency_score: result.consistency_score,
      tone_report: result,
    })
    .eq('id', sessionId);

  return result;
}
```

### `frontend/src/components/TonePanel.tsx` (create this file exactly)
```tsx
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
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/tone`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = (await res.json()) as { success: boolean; data?: ToneCheckResult; error?: string };
      if (!json.success || !json.data) throw new Error(json.error ?? 'Tone check failed');
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
      <button className="tone-btn" onClick={handleCheck} disabled={loading} aria-busy={loading}>
        {loading ? 'Checking tone…' : 'Check Tone Consistency'}
      </button>

      {error && <p className="tone-error" role="alert">{error}</p>}

      {result && (
        <div className="tone-result">
          <button
            className="tone-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            Tone: {result.dominant_tone} — Consistency {result.consistency_score}/100 {open ? '▲' : '▼'}
          </button>

          {open && (
            <div className="tone-body">
              {outliers.length > 0 && (
                <div className="tone-outliers">
                  <h4>Outlier Sections</h4>
                  <ul>
                    {outliers.map((s) => (
                      <li key={s.section_id}>
                        Section {s.position + 1}: <strong>{s.tone_label}</strong> (score: {s.tone_score})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {outliers.length === 0 && (
                <p className="tone-ok">All sections match the dominant tone.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Add CSS to `frontend/src/styles.css`:
```css
/* Tone Panel */
.tone-panel { margin: 1rem 0; }
.tone-btn {
  padding: 0.5rem 1rem;
  background: #0ea5e9;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
}
.tone-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.tone-error { color: #dc2626; font-size: 0.875rem; margin-top: 0.5rem; }
.tone-toggle {
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.75rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
  margin-top: 0.75rem;
}
.tone-body { padding: 0.75rem; border: 1px solid #bae6fd; border-top: none; border-radius: 0 0 0.375rem 0.375rem; }
.tone-outliers h4 { font-weight: 600; margin: 0 0 0.5rem; }
.tone-outliers ul { margin: 0; padding-left: 1.25rem; }
.tone-outliers li { margin-bottom: 0.25rem; font-size: 0.9rem; }
.tone-ok { color: #16a34a; font-size: 0.9rem; }
```

### `backend/src/routes/sessions.ts` — add tone route

Add import:
```typescript
import { runToneCheck } from '../services/tone-checker';
```

Add route (after the review route from task-004):
```typescript
// GET /api/sessions/:id/tone
router.get('/:id/tone', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;

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

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('id, position, corrected_text, original_text')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) {
    return res.status(500).json({ success: false, error: sectionsError.message });
  }

  try {
    const result = await runToneCheck(sessionId, sections ?? []);
    return res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tone check failed';
    return res.status(500).json({ success: false, error: message });
  }
});
```

### `frontend/src/ReviewPage.tsx` — add TonePanel

Add import:
```typescript
import { TonePanel } from './components/TonePanel';
```

In JSX (alongside AIReviewPanel from task-004), add:
```tsx
<TonePanel sessionId={session.id} authToken={supabaseSession.access_token} />
```

---

## Codebase Context

### Key Code Snippets
```typescript
// Pattern: ownership check (from task-004 and existing routes)
const { data: session } = await supabase.from('sessions').select('id, user_id').eq('id', sessionId).single();
if (session.user_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

// Pattern: supabase client import in backend
import { supabase } from '../db/supabase';
// export const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

### Key Patterns in Use
- **Cache before GPT:** Check `tone_report IS NOT NULL` first; skip GPT if cached.
- **Response format JSON mode:** Always use `response_format: { type: 'json_object' }` for structured GPT output.
- **Per-section DB update:** Update each section's `tone_label` + `tone_score` individually after GPT response.
- **Outlier definition:** `is_outlier = tone_score < 50` — set by GPT in prompt, verified in frontend filter.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/db/migrations/006_tone_check.sql` with exact SQL above. Apply in Supabase dashboard.
2. Create `backend/src/services/tone-checker.ts` with exact code above.
3. Open `backend/src/routes/sessions.ts` — add import for `runToneCheck` and the `GET /:id/tone` route.
4. Create `frontend/src/components/TonePanel.tsx` with exact code above.
5. Append CSS to `frontend/src/styles.css`.
6. Open `frontend/src/ReviewPage.tsx` — add `TonePanel` import and JSX element.
7. Run: `cd backend && npx tsc --noEmit`
8. Run: `cd frontend && npx tsc --noEmit`
9. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/tone-checker.test.ts`
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock('../db/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { runToneCheck } from './tone-checker';
import { openai } from './openai';
import { supabase } from '../db/supabase';

const mockSections = [
  { id: 'sec-1', position: 0, corrected_text: 'Formal business text here for analysis.', original_text: '' },
  { id: 'sec-2', position: 1, corrected_text: 'Hey! This is super casual stuff.', original_text: '' },
];

const mockResult = {
  dominant_tone: 'formal',
  consistency_score: 55,
  sections: [
    { section_id: 'sec-1', position: 0, tone_label: 'formal', tone_score: 90, is_outlier: false },
    { section_id: 'sec-2', position: 1, tone_label: 'informal', tone_score: 20, is_outlier: true },
  ],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('runToneCheck', () => {
  it('returns cached tone_report when present', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { tone_consistency_score: 55, tone_report: mockResult },
            error: null,
          }),
        }),
      }),
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);
    const result = await runToneCheck('session-abc', mockSections);
    expect(result).toEqual(mockResult);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('calls GPT when no cached tone_report', async () => {
    let callIndex = 0;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { tone_consistency_score: null, tone_report: null },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    });

    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockResult) } }],
    });

    const result = await runToneCheck('session-xyz', mockSections);
    expect(result.dominant_tone).toBe('formal');
    expect(result.sections[1].is_outlier).toBe(true);
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `tone_report` already in DB | Return cached — skip GPT call |
| GPT returns non-JSON | `JSON.parse` throws → route returns `{ success: false, error: 'Tone check failed' }` status 500 |
| Session not found | `res.status(404).json({ success: false, error: 'Session not found' })` |
| `session.user_id !== userId` | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| Frontend fetch fails | `setError('Tone check failed')` — display in `.tone-error` with `role="alert"` |
| No outliers | Display `.tone-ok` paragraph: "All sections match the dominant tone." |

---

## Acceptance Criteria
- [ ] WHEN `GET /api/sessions/:id/tone` is called THEN consistency score and per-section tone labels are returned
- [ ] WHEN result is cached THEN GPT is not called again
- [ ] WHEN outlier sections exist THEN they are listed in the TonePanel
- [ ] WHEN all sections match THEN "All sections match the dominant tone." message shows
- [ ] TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_

---

Status: COMPLETE
Completed: 2026-04-22T00:00:00Z
