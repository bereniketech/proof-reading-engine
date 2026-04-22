---
task: 006
feature: completeness-score
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [005]
---

# Task 006: Document Completeness Score

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

Add a document completeness score: GPT-4o checks whether the required sections for the document type are present, returns a 0–100 score plus a list of missing sections, which link to the Add Section flow (task-007).

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/completeness-checker.ts` | `checkCompleteness(sessionId, documentType, sections): Promise<CompletenessResult>` |
| `backend/src/db/migrations/007_completeness.sql` | Add `completeness_score` + `completeness_report` to `sessions` |
| `frontend/src/components/CompletenessPanel.tsx` | Shows score + missing section buttons |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sessions.ts` | Add `GET /api/sessions/:id/completeness` route |
| `frontend/src/ReviewPage.tsx` | Add "Check Completeness" button + render `CompletenessPanel` |

---

## Dependencies
_(none — OpenAI SDK already installed)_

---

## API Contracts
```
GET /api/sessions/:id/completeness
Headers: Authorization: Bearer <jwt>
Response 200: {
  success: true,
  data: {
    completeness_score: number,      // 0–100
    document_type: string,
    present_sections: string[],      // section titles/types found
    missing_sections: string[],      // required sections not found
    optional_missing: string[]       // optional sections not found
  }
}
Response 404: { success: false, error: 'Session not found' }
Response 403: { success: false, error: 'Forbidden' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/db/migrations/007_completeness.sql` (create this file exactly)
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completeness_score integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completeness_report jsonb;
```

### `backend/src/services/completeness-checker.ts` (create this file exactly)
```typescript
import { openai } from './openai';
import { supabase } from '../db/supabase';

export interface CompletenessResult {
  completeness_score: number;
  document_type: string;
  present_sections: string[];
  missing_sections: string[];
  optional_missing: string[];
}

interface SectionInput {
  position: number;
  section_type: string;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
}

/**
 * Check completeness of a document against expected sections for its type.
 * Returns cached result if completeness_report already set.
 */
export async function checkCompleteness(
  sessionId: string,
  documentType: string,
  sections: SectionInput[]
): Promise<CompletenessResult> {
  // Check cache
  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('completeness_score, completeness_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);

  if (session.completeness_report !== null && session.completeness_score !== null) {
    return session.completeness_report as CompletenessResult;
  }

  // Extract section headings visible to GPT
  const sectionSummary = sections
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const text = s.corrected_text ?? s.original_text;
      return s.section_type === 'heading' ? text.slice(0, 100) : `[paragraph: ${text.slice(0, 60)}…]`;
    });

  const prompt = `You are a professional document structure analyst.

Document type: "${documentType}"
Section list (in order):
${JSON.stringify(sectionSummary, null, 2)}

Analyze which required sections for a "${documentType}" document are present and which are missing.
Return JSON only — no markdown, no explanation outside the JSON.

{
  "completeness_score": <integer 0-100>,
  "present_sections": [<titles of required sections that are present>],
  "missing_sections": [<titles of required sections that are NOT present>],
  "optional_missing": [<titles of optional sections that are NOT present>]
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as Omit<CompletenessResult, 'document_type'>;
  const result: CompletenessResult = { ...parsed, document_type: documentType };

  // Cache
  const { error: updateError } = await supabase
    .from('sessions')
    .update({ completeness_score: result.completeness_score, completeness_report: result })
    .eq('id', sessionId);

  if (updateError) throw new Error(`Failed to cache completeness: ${updateError.message}`);

  return result;
}
```

### `frontend/src/components/CompletenessPanel.tsx` (create this file exactly)
```tsx
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
      <button className="completeness-btn" onClick={handleCheck} disabled={loading} aria-busy={loading}>
        {loading ? 'Checking…' : 'Check Completeness'}
      </button>

      {error && <p className="completeness-error" role="alert">{error}</p>}

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
```

Add CSS to `frontend/src/styles.css`:
```css
/* Completeness Panel */
.completeness-panel { margin: 1rem 0; }
.completeness-btn {
  padding: 0.5rem 1rem;
  background: #8b5cf6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
}
.completeness-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.completeness-error { color: #dc2626; font-size: 0.875rem; margin-top: 0.5rem; }
.completeness-toggle {
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.75rem;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
  margin-top: 0.75rem;
}
.completeness-body { padding: 0.75rem; border: 1px solid #ddd6fe; border-top: none; border-radius: 0 0 0.375rem 0.375rem; }
.completeness-missing h4, .completeness-optional h4 { font-weight: 600; margin: 0.5rem 0 0.25rem; }
.completeness-missing ul, .completeness-optional ul { margin: 0; padding-left: 1.25rem; }
.completeness-missing li { margin-bottom: 0.375rem; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; }
.add-section-link {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  background: #8b5cf6;
  color: white;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}
.completeness-ok { color: #16a34a; font-size: 0.9rem; }
```

### `backend/src/routes/sessions.ts` — add completeness route

Add import:
```typescript
import { checkCompleteness } from '../services/completeness-checker';
```

Add route (after tone route from task-005):
```typescript
// GET /api/sessions/:id/completeness
router.get('/:id/completeness', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id, document_type')
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
    .select('position, section_type, heading_level, original_text, corrected_text')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) {
    return res.status(500).json({ success: false, error: sectionsError.message });
  }

  try {
    const result = await checkCompleteness(sessionId, session.document_type, sections ?? []);
    return res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Completeness check failed';
    return res.status(500).json({ success: false, error: message });
  }
});
```

### `frontend/src/ReviewPage.tsx` — add CompletenessPanel

Add import:
```typescript
import { CompletenessPanel } from './components/CompletenessPanel';
```

In JSX (alongside other panels), add:
```tsx
<CompletenessPanel
  sessionId={session.id}
  authToken={supabaseSession.access_token}
  onAddSection={(title) => {
    // task-007 will wire this up — leave as console.log for now
    console.log('Add section:', title);
  }}
/>
```

---

## Codebase Context

### Key Code Snippets
```typescript
// frontend/src/lib/constants.ts — document types (from existing constants)
export const DOCUMENT_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'medical_journal', label: 'Medical Journal' },
  { value: 'legal_document', label: 'Legal Document' },
  { value: 'academic_paper', label: 'Academic Paper' },
  { value: 'business_report', label: 'Business Report' },
  { value: 'creative_writing', label: 'Creative Writing' },
] as const;

// backend/src/db/migrations/003_add_document_type.sql
// sessions.document_type is already a non-null column with CHECK constraint
```

### Key Patterns in Use
- **Cache pattern:** Check `completeness_report IS NOT NULL` + `completeness_score IS NOT NULL` before calling GPT.
- **`document_type` source:** Always read from `sessions.document_type` — never accept it from the frontend request.
- **`onAddSection` callback:** In task-006, wire to `console.log`. Task-007 replaces this with the Add Section modal open.
- **JSON mode:** Use `response_format: { type: 'json_object' }` on all GPT calls.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/db/migrations/007_completeness.sql`. Apply in Supabase dashboard.
2. Create `backend/src/services/completeness-checker.ts` with exact code above.
3. Open `backend/src/routes/sessions.ts` — add import + `GET /:id/completeness` route.
4. Create `frontend/src/components/CompletenessPanel.tsx` with exact code above.
5. Append CSS to `frontend/src/styles.css`.
6. Open `frontend/src/ReviewPage.tsx` — add import + `<CompletenessPanel>` JSX.
7. Run: `cd backend && npx tsc --noEmit`
8. Run: `cd frontend && npx tsc --noEmit`
9. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/completeness-checker.test.ts`
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock('../db/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { checkCompleteness } from './completeness-checker';
import { openai } from './openai';
import { supabase } from '../db/supabase';

const mockSections = [
  { position: 0, section_type: 'heading', heading_level: 1, original_text: 'Abstract', corrected_text: 'Abstract' },
  { position: 1, section_type: 'paragraph', heading_level: null, original_text: 'This study examines…', corrected_text: null },
];

const mockResult = {
  completeness_score: 60,
  document_type: 'academic_paper',
  present_sections: ['Abstract'],
  missing_sections: ['Introduction', 'Methodology', 'Results', 'Conclusion'],
  optional_missing: ['Acknowledgements'],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('checkCompleteness', () => {
  it('returns cached result when completeness_report exists', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { completeness_score: 60, completeness_report: mockResult },
            error: null,
          }),
        }),
      }),
    });
    const result = await checkCompleteness('session-abc', 'academic_paper', mockSections);
    expect(result).toEqual(mockResult);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('calls GPT and returns completeness result when no cache', async () => {
    let callIndex = 0;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { completeness_score: null, completeness_report: null },
                error: null,
              }),
            }),
          }),
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ ...mockResult, document_type: undefined }) } }],
    });

    const result = await checkCompleteness('session-xyz', 'academic_paper', mockSections);
    expect(result.document_type).toBe('academic_paper');
    expect(result.missing_sections).toContain('Introduction');
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `completeness_report` already in DB | Return cached — skip GPT call |
| GPT returns non-JSON | `JSON.parse` throws → route returns `{ success: false, error: 'Completeness check failed' }` status 500 |
| Session not found | `res.status(404).json({ success: false, error: 'Session not found' })` |
| `session.user_id !== userId` | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| No missing required sections | Display `.completeness-ok`: "All required sections are present." |
| `onAddSection` not provided | Render missing section name as plain text only — no "+ Add" button |

---

## Acceptance Criteria
- [ ] WHEN `GET /api/sessions/:id/completeness` is called THEN score + missing sections list returned
- [ ] WHEN result is cached THEN GPT is not called again
- [ ] WHEN missing sections exist THEN each has a "+ Add" button (if `onAddSection` provided)
- [ ] WHEN no sections are missing THEN "All required sections are present." displays
- [ ] TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
