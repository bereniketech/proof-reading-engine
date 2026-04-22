---
task: 007
feature: structured-section-insertion
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [006]
---

# Task 007: Structured Section Insertion (AI-Guided)

## Skills
- .kit/skills/data-science-ml/ai-engineer/SKILL.md
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

Add an AI-guided section insertion flow: user triggers "Add Section" (from completeness missing-section button or manually), GPT suggests format + placement + scaffolded content, user previews and confirms, then the new section is inserted into the DB at the correct position.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/section-inserter.ts` | `suggestSection(sessionId, sectionTitle, sections): Promise<SectionSuggestion>` |
| `frontend/src/components/AddSectionModal.tsx` | Modal: title input → GPT suggestion preview → confirm |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sections.ts` | Add `POST /api/sessions/:id/sections/insert` route |
| `frontend/src/ReviewPage.tsx` | Wire `onAddSection` in CompletenessPanel to open AddSectionModal; handle confirmed insert |

---

## Dependencies
```
# No new packages needed
# Env vars: none new
```

---

## API Contracts
```
POST /api/sessions/:id/sections/insert
Headers: Authorization: Bearer <jwt>
Request: {
  title: string,          // section title to insert
  position: number,       // 0-based insert position (all sections at >= position shift +1)
  content: string         // AI-scaffolded content (from suggestion)
}
Response 200: {
  success: true,
  data: {
    session_id: string,
    sections: SectionRecord[]   // all sections reloaded in order
  }
}
Response 400: { success: false, error: 'title is required' }
Response 403: { success: false, error: 'Forbidden' }
Response 404: { success: false, error: 'Session not found' }
Response 500: { success: false, error: string }

POST /api/sessions/:id/sections/suggest
Headers: Authorization: Bearer <jwt>
Request: { title: string }
Response 200: {
  success: true,
  data: {
    suggested_position: number,
    content: string,
    rationale: string
  }
}
Response 400: { success: false, error: 'title is required' }
Response 403: { success: false, error: 'Forbidden' }
Response 404: { success: false, error: 'Session not found' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/services/section-inserter.ts` (create this file exactly)
```typescript
import { openai } from './openai';
import { supabase } from '../db/supabase';

export interface SectionSuggestion {
  suggested_position: number;
  content: string;
  rationale: string;
}

interface SectionContext {
  position: number;
  section_type: string;
  original_text: string;
  corrected_text: string | null;
}

/**
 * Ask GPT-4o to suggest placement and content for a new section.
 */
export async function suggestSection(
  sessionId: string,
  sectionTitle: string,
  sections: SectionContext[]
): Promise<SectionSuggestion> {
  const sectionList = sections
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      position: s.position,
      type: s.section_type,
      text: (s.corrected_text ?? s.original_text).slice(0, 200),
    }));

  const totalSections = sections.length;

  const prompt = `You are a professional document editor.

The user wants to add a new section titled: "${sectionTitle}"

Current document structure (${totalSections} sections):
${JSON.stringify(sectionList, null, 2)}

Suggest the best position to insert this section, write scaffolded content for it, and explain why.
Return JSON only — no markdown outside the JSON.

{
  "suggested_position": <integer 0 to ${totalSections}, where 0 = before all sections, ${totalSections} = after all>,
  "content": "<2-4 paragraphs of scaffolded placeholder content appropriate for this section type and document context>",
  "rationale": "<1-2 sentences explaining the placement choice>"
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw) as SectionSuggestion;
}

/**
 * Insert a new section at `position`, shifting all existing sections at >= position by +1.
 * Returns all sections in order after insert.
 */
export async function insertSection(
  sessionId: string,
  title: string,
  position: number,
  content: string
): Promise<void> {
  // Shift existing positions
  const { data: existing, error: fetchError } = await supabase
    .from('sections')
    .select('id, position')
    .eq('session_id', sessionId)
    .gte('position', position);

  if (fetchError) throw new Error(`Failed to fetch sections: ${fetchError.message}`);

  for (const section of existing ?? []) {
    const { error } = await supabase
      .from('sections')
      .update({ position: section.position + 1 })
      .eq('id', section.id);
    if (error) throw new Error(`Failed to shift section: ${error.message}`);
  }

  // Insert new section
  const { error: insertError } = await supabase.from('sections').insert({
    session_id: sessionId,
    position,
    section_type: 'heading',
    heading_level: 2,
    original_text: title,
    corrected_text: content,
    status: 'ready',
  });

  if (insertError) throw new Error(`Failed to insert section: ${insertError.message}`);
}
```

### `backend/src/routes/sections.ts` — add two new routes

Add imports at top:
```typescript
import { suggestSection, insertSection } from '../services/section-inserter';
```

Add routes (after existing routes):
```typescript
// POST /api/sessions/:id/sections/suggest
router.post('/:id/sections/suggest', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;
  const { title } = req.body as { title?: string };

  if (!title || title.trim() === '') {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.user_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('position, section_type, original_text, corrected_text')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) return res.status(500).json({ success: false, error: sectionsError.message });

  try {
    const suggestion = await suggestSection(sessionId, title.trim(), sections ?? []);
    return res.json({ success: true, data: suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Suggestion failed';
    return res.status(500).json({ success: false, error: message });
  }
});

// POST /api/sessions/:id/sections/insert
router.post('/:id/sections/insert', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;
  const { title, position, content } = req.body as { title?: string; position?: number; content?: string };

  if (!title || title.trim() === '') {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.user_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

  try {
    await insertSection(sessionId, title.trim(), position ?? 0, content ?? '');

    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .eq('session_id', sessionId)
      .order('position', { ascending: true });

    if (sectionsError) return res.status(500).json({ success: false, error: sectionsError.message });

    return res.json({ success: true, data: { session_id: sessionId, sections: sections ?? [] } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Insert failed';
    return res.status(500).json({ success: false, error: message });
  }
});
```

### `frontend/src/components/AddSectionModal.tsx` (create this file exactly)
```tsx
import { useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface SectionSuggestion {
  suggested_position: number;
  content: string;
  rationale: string;
}

interface AddSectionModalProps {
  sessionId: string;
  authToken: string;
  initialTitle?: string;
  totalSections: number;
  onConfirm: (title: string, position: number, content: string) => Promise<void>;
  onClose: () => void;
}

export function AddSectionModal({
  sessionId,
  authToken,
  initialTitle = '',
  totalSections,
  onConfirm,
  onClose,
}: AddSectionModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [suggestion, setSuggestion] = useState<SectionSuggestion | null>(null);
  const [position, setPosition] = useState<number>(0);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest() {
    if (!title.trim()) {
      setError('Section title is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/sections/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json = (await res.json()) as { success: boolean; data?: SectionSuggestion; error?: string };
      if (!json.success || !json.data) throw new Error(json.error ?? 'Suggestion failed');
      setSuggestion(json.data);
      setPosition(json.data.suggested_position);
      setContent(json.data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suggestion failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm(title.trim(), position, content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Insert failed');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add Section">
      <div className="modal-box">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="modal-title">Add Section</h3>

        <label className="modal-label" htmlFor="section-title">Section Title</label>
        <input
          id="section-title"
          className="modal-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Conclusion"
        />

        <button className="modal-suggest-btn" onClick={handleSuggest} disabled={loading}>
          {loading ? 'Generating suggestion…' : 'Get AI Suggestion'}
        </button>

        {error && <p className="modal-error" role="alert">{error}</p>}

        {suggestion && (
          <div className="modal-preview">
            <p className="modal-rationale"><em>{suggestion.rationale}</em></p>

            <label className="modal-label" htmlFor="section-position">Insert at position</label>
            <input
              id="section-position"
              className="modal-input"
              type="number"
              min={0}
              max={totalSections}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
            />

            <label className="modal-label" htmlFor="section-content">Content (editable)</label>
            <textarea
              id="section-content"
              className="modal-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
            />

            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
              <button className="modal-confirm-btn" onClick={handleConfirm} disabled={confirming}>
                {confirming ? 'Inserting…' : 'Insert Section'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Add CSS to `frontend/src/styles.css`:
```css
/* Add Section Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-box {
  background: white; border-radius: 0.5rem; padding: 1.5rem;
  width: 90%; max-width: 560px; max-height: 90vh; overflow-y: auto;
  position: relative;
}
.modal-close {
  position: absolute; top: 0.75rem; right: 0.75rem;
  background: none; border: none; font-size: 1rem; cursor: pointer; color: #64748b;
}
.modal-title { font-size: 1.125rem; font-weight: 700; margin: 0 0 1rem; }
.modal-label { display: block; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.25rem; margin-top: 0.75rem; }
.modal-input { width: 100%; padding: 0.5rem; border: 1px solid #e2e8f0; border-radius: 0.375rem; font-size: 0.9rem; box-sizing: border-box; }
.modal-suggest-btn {
  margin-top: 0.75rem; padding: 0.5rem 1rem;
  background: #6366f1; color: white; border: none; border-radius: 0.375rem; cursor: pointer; font-weight: 600;
}
.modal-suggest-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.modal-error { color: #dc2626; font-size: 0.875rem; margin-top: 0.5rem; }
.modal-preview { margin-top: 1rem; }
.modal-rationale { font-size: 0.875rem; color: #64748b; font-style: italic; margin-bottom: 0.75rem; }
.modal-textarea { width: 100%; padding: 0.5rem; border: 1px solid #e2e8f0; border-radius: 0.375rem; font-size: 0.875rem; resize: vertical; box-sizing: border-box; }
.modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1rem; }
.modal-cancel-btn { padding: 0.5rem 1rem; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 0.375rem; cursor: pointer; }
.modal-confirm-btn {
  padding: 0.5rem 1rem; background: #16a34a; color: white;
  border: none; border-radius: 0.375rem; cursor: pointer; font-weight: 600;
}
.modal-confirm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
```

### `frontend/src/ReviewPage.tsx` — wire AddSectionModal

Add import:
```typescript
import { AddSectionModal } from './components/AddSectionModal';
```

Add state:
```typescript
const [addSectionTitle, setAddSectionTitle] = useState<string | null>(null);
```

Replace the `onAddSection` console.log stub from task-006 with:
```tsx
onAddSection={(title) => setAddSectionTitle(title)}
```

Add `<AddSectionModal>` at end of JSX (before closing root div):
```tsx
{addSectionTitle !== null && (
  <AddSectionModal
    sessionId={session.id}
    authToken={supabaseSession.access_token}
    initialTitle={addSectionTitle}
    totalSections={sections.length}
    onConfirm={async (title, position, content) => {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${session.id}/sections/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseSession.access_token}` },
        body: JSON.stringify({ title, position, content }),
      });
      const json = (await res.json()) as { success: boolean; data?: { sections: SectionRecord[] }; error?: string };
      if (!json.success || !json.data) throw new Error(json.error ?? 'Insert failed');
      setSections(json.data.sections);
    }}
    onClose={() => setAddSectionTitle(null)}
  />
)}
```

Also add: `const [sections, setSections] = useState<SectionRecord[]>(initialSections);` if not already using stateful sections array. (ReviewPage already uses `sections` state — verify the state setter name matches.)

---

## Codebase Context

### Key Code Snippets
```typescript
// ReviewPage.tsx — SectionRecord interface
interface SectionRecord {
  id: string; session_id: string; position: number; section_type: string;
  heading_level: number | null; original_text: string; corrected_text: string | null;
  reference_text: string | null; final_text: string | null; change_summary: string | null;
  ai_score: number | null; humanized_text: string | null;
  status: 'pending' | 'ready' | 'accepted' | 'rejected';
  created_at: string; updated_at: string;
}
```

### Key Patterns in Use
- **Position shifting:** Before inserting at position N, increment all existing sections with `position >= N` by 1 in the DB.
- **Insert status:** New sections are inserted with `status: 'ready'` — they skip the proofreading pipeline.
- **Section type for new sections:** Always `section_type: 'heading'`, `heading_level: 2` — content goes in `corrected_text`.
- **After insert:** Reload full sections array from DB (SELECT * WHERE session_id = ...) and return to frontend.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/services/section-inserter.ts` with exact code above.
2. Open `backend/src/routes/sections.ts` — add imports + two new routes (`suggest` + `insert`).
3. Create `frontend/src/components/AddSectionModal.tsx` with exact code above.
4. Append CSS to `frontend/src/styles.css`.
5. Open `frontend/src/ReviewPage.tsx` — add import, `addSectionTitle` state, wire `onAddSection`, add `<AddSectionModal>` JSX.
6. Run: `cd backend && npx tsc --noEmit`
7. Run: `cd frontend && npx tsc --noEmit`
8. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/section-inserter.test.ts`
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock('../db/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { suggestSection } from './section-inserter';
import { openai } from './openai';
import { supabase } from '../db/supabase';

const mockSections = [
  { position: 0, section_type: 'heading', original_text: 'Introduction', corrected_text: null },
  { position: 1, section_type: 'paragraph', original_text: 'Body paragraph.', corrected_text: null },
];

const mockSuggestion = {
  suggested_position: 2,
  content: 'This section concludes the document by summarizing the key findings.',
  rationale: 'Conclusion belongs at the end of the document.',
};

beforeEach(() => { vi.clearAllMocks(); });

describe('suggestSection', () => {
  it('calls GPT and returns suggestion with position and content', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockSuggestion) } }],
    });

    const result = await suggestSection('session-1', 'Conclusion', mockSections);
    expect(result.suggested_position).toBe(2);
    expect(result.content).toContain('concludes');
    expect(result.rationale).toBeTruthy();
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `title` missing or empty in request body | Return `res.status(400).json({ success: false, error: 'title is required' })` |
| Session not found | `res.status(404).json({ success: false, error: 'Session not found' })` |
| `session.user_id !== userId` | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| Position shift DB error | Throw `Error('Failed to shift section: ' + error.message)` → route returns 500 |
| GPT fails for suggest | Catch in route → `res.status(500).json({ success: false, error: message })` |
| Frontend onConfirm throws | `setError(err.message)` in modal — modal stays open |
| User clicks Cancel | `onClose()` — modal unmounts, no DB change |

---

## Acceptance Criteria
- [ ] WHEN "Get AI Suggestion" is clicked THEN position + content + rationale appear in modal
- [ ] WHEN user edits content and clicks "Insert Section" THEN section appears in ReviewPage sections list
- [ ] WHEN insert occurs THEN all sections at >= position are shifted +1 in DB
- [ ] WHEN title is empty and suggest is clicked THEN "Section title is required" error shows
- [ ] TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
