---
task: 008
feature: reformat-section
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [007]
---

# Task 008: Reformat Existing Section

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

Add a "Reformat" action per section: user selects a format (table / bullet list / questionnaire / summary box), GPT rewrites the section in that format preserving all content, shown in a "Reformatted" tab — non-destructive, original and corrected text unchanged.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/reformatter.ts` | `reformatSection(text, format): Promise<string>` |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sections.ts` | Add `POST /api/sections/:id/reformat` route |
| `backend/src/db/migrations/008_reformat.sql` | Add `reformatted_text` + `reformat_type` columns to `sections` |
| `frontend/src/components/SectionCard.tsx` | Add Reformat dropdown + "Reformatted" tab |

---

## Dependencies
_(none — OpenAI SDK already installed)_

---

## API Contracts
```
POST /api/sections/:id/reformat
Headers: Authorization: Bearer <jwt>
Request: { format: 'table' | 'bullet_list' | 'questionnaire' | 'summary_box' }
Response 200: {
  success: true,
  data: SectionRecord   // includes reformatted_text and reformat_type
}
Response 400: { success: false, error: 'format is required' }
Response 403: { success: false, error: 'Forbidden' }
Response 404: { success: false, error: 'Section not found' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/db/migrations/008_reformat.sql` (create this file exactly)
```sql
ALTER TABLE sections ADD COLUMN IF NOT EXISTS reformatted_text text;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS reformat_type text;
```

### `backend/src/services/reformatter.ts` (create this file exactly)
```typescript
import { openai } from './openai';

export type ReformatType = 'table' | 'bullet_list' | 'questionnaire' | 'summary_box';

const FORMAT_INSTRUCTIONS: Record<ReformatType, string> = {
  table:
    'Convert this text into a Markdown table. Extract key data points as rows and columns. Preserve all information.',
  bullet_list:
    'Convert this text into a clear Markdown bullet list. Each bullet = one distinct point. Preserve all information.',
  questionnaire:
    'Convert this text into a Q&A questionnaire format. Generate questions from the content and provide the answers from the text.',
  summary_box:
    'Rewrite this text as a concise summary box: a bold title line followed by 3–5 key takeaways as bullet points.',
};

/**
 * Reformat a section's text into the requested format using GPT-4o.
 * Returns the reformatted text only (no markdown wrapper).
 */
export async function reformatSection(text: string, format: ReformatType): Promise<string> {
  const instruction = FORMAT_INSTRUCTIONS[format];

  const prompt = `${instruction}

Text to reformat:
"""
${text.slice(0, 6000)}
"""

Return the reformatted text only — no preamble, no explanation, no code fences.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  return completion.choices[0]?.message?.content?.trim() ?? '';
}
```

### `backend/src/routes/sections.ts` — add reformat route

Add import:
```typescript
import { reformatSection, type ReformatType } from '../services/reformatter';
```

Add route (after humanize route from task-002):
```typescript
// POST /api/sections/:id/reformat
router.post('/:id/reformat', requireAuth, async (req, res) => {
  const sectionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;
  const { format } = req.body as { format?: ReformatType };

  const VALID_FORMATS: ReformatType[] = ['table', 'bullet_list', 'questionnaire', 'summary_box'];
  if (!format || !VALID_FORMATS.includes(format)) {
    return res.status(400).json({ success: false, error: 'format is required' });
  }

  // Fetch section + ownership
  const { data: section, error: sectionError } = await supabase
    .from('sections')
    .select('*, sessions!inner(user_id)')
    .eq('id', sectionId)
    .single();

  if (sectionError || !section) {
    return res.status(404).json({ success: false, error: 'Section not found' });
  }

  const sessionUserId = (section as { sessions: { user_id: string } }).sessions.user_id;
  if (sessionUserId !== userId) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const sourceText = (section as { corrected_text: string | null; original_text: string }).corrected_text
    ?? (section as { original_text: string }).original_text;

  try {
    const reformatted = await reformatSection(sourceText, format);

    const { data: updated, error: updateError } = await supabase
      .from('sections')
      .update({ reformatted_text: reformatted, reformat_type: format })
      .eq('id', sectionId)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    return res.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reformat failed';
    return res.status(500).json({ success: false, error: message });
  }
});
```

### `frontend/src/components/SectionCard.tsx` — add Reformat dropdown + Reformatted tab

Add these new props to the SectionCard props interface:
```typescript
reformattedText: string | null;
reformatType: string | null;
isReformatting: boolean;
reformatError: string | null;
onReformat: (format: 'table' | 'bullet_list' | 'questionnaire' | 'summary_box') => void;
```

Inside SectionCard, after the existing tab buttons (Original / Corrected / Humanized), add a "Reformatted" tab button — only when `reformattedText` is non-null:
```tsx
{reformattedText !== null && (
  <button
    className={`tab-btn ${activeTab === 'reformatted' ? 'tab-btn--active' : ''}`}
    onClick={() => setActiveTab('reformatted')}
  >
    Reformatted
  </button>
)}
```

Add Reformatted tab content panel — rendered when `activeTab === 'reformatted'`:
```tsx
{activeTab === 'reformatted' && reformattedText !== null && (
  <div className="tab-content reformatted-content">
    <pre className="reformatted-pre">{reformattedText}</pre>
  </div>
)}
```

Add Reformat dropdown (near the section actions area):
```tsx
<div className="reformat-controls">
  <select
    className="reformat-select"
    onChange={(e) => {
      if (e.target.value) {
        onReformat(e.target.value as 'table' | 'bullet_list' | 'questionnaire' | 'summary_box');
        e.target.value = '';
      }
    }}
    disabled={isReformatting}
    defaultValue=""
    aria-label="Reformat section as"
  >
    <option value="" disabled>Reformat as…</option>
    <option value="table">Table</option>
    <option value="bullet_list">Bullet List</option>
    <option value="questionnaire">Questionnaire</option>
    <option value="summary_box">Summary Box</option>
  </select>
  {isReformatting && <span className="reformat-spinner">Reformatting…</span>}
  {reformatError && <span className="reformat-error" role="alert">{reformatError}</span>}
</div>
```

Add CSS to `frontend/src/styles.css`:
```css
/* Reformat controls */
.reformat-controls { display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; }
.reformat-select {
  padding: 0.25rem 0.5rem; border: 1px solid #e2e8f0;
  border-radius: 0.25rem; font-size: 0.8rem; cursor: pointer;
}
.reformat-spinner { font-size: 0.8rem; color: #64748b; }
.reformat-error { font-size: 0.8rem; color: #dc2626; }
.reformatted-pre {
  white-space: pre-wrap; word-break: break-word;
  font-family: inherit; font-size: 0.9rem; margin: 0;
  padding: 0.75rem; background: #f8fafc; border-radius: 0.25rem;
}
```

### `frontend/src/ReviewPage.tsx` — add reformat state and handler

Add state:
```typescript
const [reformattingById, setReformattingById] = useState<Record<string, boolean>>({});
const [reformatErrorById, setReformatErrorById] = useState<Record<string, string>>({});
```

Add handler:
```typescript
async function handleReformat(sectionId: string, format: 'table' | 'bullet_list' | 'questionnaire' | 'summary_box') {
  setReformattingById((prev) => ({ ...prev, [sectionId]: true }));
  setReformatErrorById((prev) => ({ ...prev, [sectionId]: '' }));
  try {
    const res = await fetch(`${apiBaseUrl}/api/sections/${sectionId}/reformat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseSession.access_token}` },
      body: JSON.stringify({ format }),
    });
    const json = (await res.json()) as { success: boolean; data?: SectionRecord; error?: string };
    if (!json.success || !json.data) throw new Error(json.error ?? 'Reformat failed');
    setSections((prev) => prev.map((s) => (s.id === sectionId ? json.data! : s)));
  } catch (err) {
    setReformatErrorById((prev) => ({ ...prev, [sectionId]: err instanceof Error ? err.message : 'Reformat failed' }));
  } finally {
    setReformattingById((prev) => ({ ...prev, [sectionId]: false }));
  }
}
```

Pass new props to each `<SectionCard>`:
```tsx
reformattedText={section.reformatted_text ?? null}
reformatType={section.reformat_type ?? null}
isReformatting={reformattingById[section.id] ?? false}
reformatError={reformatErrorById[section.id] ?? null}
onReformat={(format) => handleReformat(section.id, format)}
```

Also add `reformatted_text` and `reformat_type` to the `SectionRecord` interface in ReviewPage.tsx:
```typescript
reformatted_text: string | null;
reformat_type: string | null;
```

---

## Codebase Context

### Key Code Snippets
```typescript
// SectionCard.tsx — existing tab pattern (from task-002 humanize tab)
// The component has: activeTab state, tab-btn buttons, tab-content divs
// Pattern: activeTab = 'original' | 'corrected' | 'humanized'
// Add 'reformatted' to this union when reformatted_text is non-null

// ReviewPage.tsx — existing handler pattern for section updates
// handleHumanize: fetch → setSections(prev => prev.map(s => s.id === id ? updated : s))
// Follow exact same pattern for handleReformat
```

### Key Patterns in Use
- **Non-destructive:** `reformatted_text` is a separate column — `original_text`, `corrected_text`, `humanized_text` are never modified by reformat.
- **Tab visibility:** "Reformatted" tab button only renders when `reformatted_text` is non-null.
- **Ownership via join:** `sections.select('*, sessions!inner(user_id)')` — use Supabase join to check ownership without a second query.
- **Source text:** Always use `corrected_text ?? original_text` as the text to reformat.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/db/migrations/008_reformat.sql`. Apply in Supabase dashboard.
2. Create `backend/src/services/reformatter.ts` with exact code above.
3. Open `backend/src/routes/sections.ts` — add import + `POST /:id/reformat` route.
4. Open `frontend/src/components/SectionCard.tsx` — add new props, Reformat dropdown, Reformatted tab button and content.
5. Add CSS to `frontend/src/styles.css`.
6. Open `frontend/src/ReviewPage.tsx` — add `reformatted_text` + `reformat_type` to `SectionRecord`, add state + handler, pass props to `<SectionCard>`.
7. Run: `cd backend && npx tsc --noEmit`
8. Run: `cd frontend && npx tsc --noEmit`
9. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/reformatter.test.ts`
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

import { reformatSection } from './reformatter';
import { openai } from './openai';

beforeEach(() => { vi.clearAllMocks(); });

describe('reformatSection', () => {
  it('returns GPT response content for table format', async () => {
    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: '| Column 1 | Column 2 |\n|---|---|\n| A | B |' } }],
    });
    const result = await reformatSection('Some text with data.', 'table');
    expect(result).toContain('|');
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });

  it('returns GPT response content for bullet_list format', async () => {
    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: '- Point one\n- Point two' } }],
    });
    const result = await reformatSection('Text with two main points.', 'bullet_list');
    expect(result).toContain('- Point');
  });

  it('returns empty string when GPT returns null content', async () => {
    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: null } }],
    });
    const result = await reformatSection('Any text.', 'summary_box');
    expect(result).toBe('');
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `format` missing or not in valid list | `res.status(400).json({ success: false, error: 'format is required' })` |
| Section not found | `res.status(404).json({ success: false, error: 'Section not found' })` |
| Ownership check fails | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| GPT returns empty/null | Store `''` as `reformatted_text` — frontend shows empty pre block |
| `reformatted_text` is null | Do NOT render "Reformatted" tab button |
| Frontend handler throws | `setReformatErrorById(prev => ({...prev, [sectionId]: err.message}))` — error shown inline in `.reformat-error` span |

---

## Acceptance Criteria
- [ ] WHEN user selects "Bullet List" from dropdown THEN a "Reformatted" tab appears on that section card
- [ ] WHEN "Reformatted" tab is clicked THEN reformatted text is shown in a `<pre>` block
- [ ] WHEN reformat is in progress THEN "Reformatting…" spinner shows and dropdown is disabled
- [ ] WHEN GPT call fails THEN error message appears inline in `.reformat-error`
- [ ] `original_text` and `corrected_text` are unchanged after reformat
- [ ] TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
