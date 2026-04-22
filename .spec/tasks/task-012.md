---
task: 012
feature: citation-claim-detector
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [011]
---

# Task 012: Citation & Claim Detector

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

Add a citation/claim detector: scan all sections for unsupported factual claims ("Studies show…", "Research indicates…"), flag them with their section id + snippet, and surface them in a ReviewPage panel with links to each flagged section.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/citation-detector.ts` | `detectClaims(sessionId, sections): Promise<CitationReport>` — regex pre-filter + GPT-4o validation |
| `frontend/src/components/CitationPanel.tsx` | Lists flagged claims with section links |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sessions.ts` | Add `GET /api/sessions/:id/citations` route |
| `backend/src/db/migrations/009_citations.sql` | Add `citations_report` jsonb column to sessions |
| `frontend/src/ReviewPage.tsx` | Add "Detect Claims" button + render `CitationPanel` |

---

## Dependencies
_(none — OpenAI SDK already installed)_

---

## API Contracts
```
GET /api/sessions/:id/citations
Headers: Authorization: Bearer <jwt>
Response 200: {
  success: true,
  data: {
    flagged_count: number,
    claims: Array<{
      section_id: string,
      position: number,
      snippet: string,         // the specific claim text (≤ 150 chars)
      claim_type: string,      // e.g. "statistical" | "causal" | "authority" | "general"
      needs_citation: boolean
    }>
  }
}
Response 403: { success: false, error: 'Forbidden' }
Response 404: { success: false, error: 'Session not found' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/db/migrations/009_citations.sql` (create this file exactly)
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS citations_report jsonb;
```

### `backend/src/services/citation-detector.ts` (create this file exactly)
```typescript
import { openai } from './openai';
import { supabase } from '../db/supabase';

export interface ClaimFlag {
  section_id: string;
  position: number;
  snippet: string;
  claim_type: 'statistical' | 'causal' | 'authority' | 'general';
  needs_citation: boolean;
}

export interface CitationReport {
  flagged_count: number;
  claims: ClaimFlag[];
}

interface SectionInput {
  id: string;
  position: number;
  original_text: string;
  corrected_text: string | null;
}

/**
 * Common claim signal patterns — used as a pre-filter before GPT call.
 * Only sections matching at least one pattern are sent to GPT.
 */
const CLAIM_PATTERNS = [
  /\bstud(?:ies|y)\s+show/i,
  /\bresearch\s+(?:indicates?|shows?|suggests?|finds?|demonstrates?)/i,
  /\baccording\s+to\s+(?:experts?|scientists?|researchers?|studies?)/i,
  /\bscientists?\s+(?:have\s+)?(?:found|discovered|shown|proven)/i,
  /\bevidence\s+(?:suggests?|shows?|indicates?|demonstrates?)/i,
  /\bdata\s+(?:shows?|suggests?|indicates?)/i,
  /\bstatistics?\s+show/i,
  /\bit\s+(?:has\s+been\s+)?(?:proven|demonstrated|shown)\s+that/i,
  /\bexperts?\s+(?:agree|say|believe|claim)/i,
  /\bmajority\s+of\s+(?:people|users?|consumers?|patients?)/i,
];

function extractMatchingSnippet(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 20);
  const end = Math.min(text.length, match.index + match[0].length + 100);
  return text.slice(start, end).trim();
}

/**
 * Detect unsupported claims in document sections.
 * Returns cached result if citations_report already set on session.
 */
export async function detectClaims(
  sessionId: string,
  sections: SectionInput[]
): Promise<CitationReport> {
  // Check cache
  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('citations_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);

  if (session.citations_report !== null) {
    return session.citations_report as CitationReport;
  }

  // Pre-filter sections with claim patterns
  const candidates: Array<{ id: string; position: number; text: string; snippets: string[] }> = [];

  for (const s of sections) {
    const text = s.corrected_text ?? s.original_text;
    const snippets: string[] = [];
    for (const pattern of CLAIM_PATTERNS) {
      const snippet = extractMatchingSnippet(text, pattern);
      if (snippet) snippets.push(snippet.slice(0, 150));
    }
    if (snippets.length > 0) {
      candidates.push({ id: s.id, position: s.position, text: text.slice(0, 800), snippets });
    }
  }

  if (candidates.length === 0) {
    const emptyReport: CitationReport = { flagged_count: 0, claims: [] };
    await supabase.from('sessions').update({ citations_report: emptyReport }).eq('id', sessionId);
    return emptyReport;
  }

  // GPT validation pass
  const prompt = `You are a fact-checking assistant. Review these text snippets that may contain unsupported factual claims.

For each snippet, determine if it makes a claim that requires a citation (statistical, causal, authority, or general factual claim).

Input:
${JSON.stringify(candidates.map((c) => ({ id: c.id, position: c.position, snippets: c.snippets })), null, 2)}

Return JSON only — no markdown outside JSON:
{
  "claims": [
    {
      "section_id": "<id from input>",
      "position": <position from input>,
      "snippet": "<the specific claim snippet, max 150 chars>",
      "claim_type": "<statistical|causal|authority|general>",
      "needs_citation": <true|false>
    }
  ]
}

Only include items where needs_citation is true.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const raw = completion.choices[0]?.message?.content ?? '{"claims":[]}';
  const parsed = JSON.parse(raw) as { claims: ClaimFlag[] };
  const report: CitationReport = {
    flagged_count: parsed.claims.filter((c) => c.needs_citation).length,
    claims: parsed.claims.filter((c) => c.needs_citation),
  };

  // Cache
  await supabase.from('sessions').update({ citations_report: report }).eq('id', sessionId);

  return report;
}
```

### `backend/src/routes/sessions.ts` — add citations route

Add import:
```typescript
import { detectClaims } from '../services/citation-detector';
```

Add route (after chat routes from task-011):
```typescript
// GET /api/sessions/:id/citations
router.get('/:id/citations', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;

  const { data: session, error: sessionError } = await supabase
    .from('sessions').select('id, user_id').eq('id', sessionId).single();
  if (sessionError || !session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.user_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('id, position, original_text, corrected_text')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) return res.status(500).json({ success: false, error: sectionsError.message });

  try {
    const report = await detectClaims(sessionId, sections ?? []);
    return res.json({ success: true, data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Citation detection failed';
    return res.status(500).json({ success: false, error: message });
  }
});
```

### `frontend/src/components/CitationPanel.tsx` (create this file exactly)
```tsx
import { useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

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
  onScrollToSection?: (sectionId: string) => void;
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  statistical: 'Statistical',
  causal: 'Causal',
  authority: 'Authority',
  general: 'Factual',
};

export function CitationPanel({ sessionId, authToken, onScrollToSection }: CitationPanelProps) {
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
      <button className="citation-btn" onClick={handleDetect} disabled={loading} aria-busy={loading}>
        {loading ? 'Scanning…' : 'Detect Unsupported Claims'}
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
                  <p className="citation-snippet">"{claim.snippet}"</p>
                </div>
              ))}
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
/* Citation Panel */
.citation-panel { margin: 1rem 0; }
.citation-btn {
  padding: 0.5rem 1rem; background: #f59e0b; color: white;
  border: none; border-radius: 0.375rem; cursor: pointer; font-weight: 600;
}
.citation-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.citation-error { color: #dc2626; font-size: 0.875rem; margin-top: 0.5rem; }
.citation-toggle {
  width: 100%; text-align: left; padding: 0.5rem 0.75rem;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 0.375rem;
  cursor: pointer; font-weight: 600; margin-top: 0.75rem;
}
.citation-body { padding: 0.75rem; border: 1px solid #fde68a; border-top: none; border-radius: 0 0 0.375rem 0.375rem; }
.citation-claim { padding: 0.75rem 0; border-bottom: 1px solid #f1f5f9; }
.citation-claim:last-child { border-bottom: none; }
.citation-claim-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.375rem; }
.citation-type-badge {
  font-size: 0.7rem; font-weight: 700; padding: 0.125rem 0.375rem;
  background: #f59e0b; color: white; border-radius: 0.25rem;
}
.citation-section-label { font-size: 0.75rem; color: #64748b; }
.citation-scroll-btn {
  font-size: 0.75rem; padding: 0.125rem 0.375rem; background: none;
  border: 1px solid #e2e8f0; border-radius: 0.25rem; cursor: pointer; color: #6366f1;
}
.citation-snippet { margin: 0; font-size: 0.875rem; color: #374151; font-style: italic; }
```

### `frontend/src/ReviewPage.tsx` — add CitationPanel

Add import:
```typescript
import { CitationPanel } from './components/CitationPanel';
```

In JSX (alongside other panels), add:
```tsx
<CitationPanel
  sessionId={session.id}
  authToken={supabaseSession.access_token}
  onScrollToSection={(sectionId) => {
    const el = document.getElementById(`section-${sectionId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }}
/>
```

Also add `id` attribute to each SectionCard wrapper so scroll works:
```tsx
<div id={`section-${section.id}`} key={section.id}>
  <SectionCard ... />
</div>
```

---

## Codebase Context

### Key Code Snippets
```typescript
// Existing pattern for caching in sessions: (from task-004, task-005, task-006)
// Check column IS NOT NULL → return cached; else call GPT → update DB → return

// CLAIM_PATTERNS: 10 regex patterns for common unsubstantiated claim phrases
// These are a pre-filter — only matching sections go to GPT (reduces cost)
// GPT validates which are genuine citation-needed claims vs. false positives
```

### Key Patterns in Use
- **Two-pass approach:** Regex pre-filter → GPT validation. Never send all sections to GPT — only candidates that match patterns.
- **`needs_citation: true` filter:** Only claims where GPT says `needs_citation: true` appear in the report. Discard `false` entries before caching.
- **Cache key:** `sessions.citations_report IS NOT NULL` — single column check, same pattern as other features.
- **`onScrollToSection` callback:** Frontend uses `document.getElementById(\`section-${sectionId}\`)` — requires SectionCard wrapper to have `id="section-{section.id}"`.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/db/migrations/009_citations.sql`. Apply in Supabase dashboard.
2. Create `backend/src/services/citation-detector.ts` with exact code above.
3. Open `backend/src/routes/sessions.ts` — add import + `GET /:id/citations` route.
4. Create `frontend/src/components/CitationPanel.tsx` with exact code above.
5. Append CSS to `frontend/src/styles.css`.
6. Open `frontend/src/ReviewPage.tsx` — add import + `<CitationPanel>` JSX + `id` attribute on SectionCard wrappers.
7. Run: `cd backend && npx tsc --noEmit`
8. Run: `cd frontend && npx tsc --noEmit`
9. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/citation-detector.test.ts`
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock('../db/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { detectClaims } from './citation-detector';
import { openai } from './openai';
import { supabase } from '../db/supabase';

const sectionsWithClaims = [
  {
    id: 'sec-1', position: 0,
    original_text: 'Studies show that regular exercise reduces the risk of heart disease.',
    corrected_text: null,
  },
  {
    id: 'sec-2', position: 1,
    original_text: 'The weather is nice today.',
    corrected_text: null,
  },
];

const mockGptClaims = {
  claims: [
    {
      section_id: 'sec-1', position: 0,
      snippet: 'Studies show that regular exercise reduces the risk of heart disease.',
      claim_type: 'statistical', needs_citation: true,
    },
  ],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('detectClaims', () => {
  it('returns cached report when citations_report exists', async () => {
    const cachedReport = { flagged_count: 1, claims: mockGptClaims.claims };
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { citations_report: cachedReport }, error: null }),
        }),
      }),
    });
    const result = await detectClaims('session-1', sectionsWithClaims);
    expect(result).toEqual(cachedReport);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('pre-filters sections and calls GPT only for matching ones', async () => {
    let callCount = 0;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { citations_report: null }, error: null }),
            }),
          }),
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockGptClaims) } }],
    });

    const result = await detectClaims('session-2', sectionsWithClaims);
    expect(result.flagged_count).toBe(1);
    expect(result.claims[0].section_id).toBe('sec-1');
    // Verify only sec-1 was in GPT prompt (sec-2 "The weather is nice today" has no patterns)
    const gptCallArg = (openai.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(JSON.stringify(gptCallArg)).not.toContain('sec-2');
  });

  it('returns empty report when no sections match claim patterns', async () => {
    let callCount = 0;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { citations_report: null }, error: null }),
            }),
          }),
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    const noClaims = [{ id: 'sec-3', position: 0, original_text: 'Plain statement.', corrected_text: null }];
    const result = await detectClaims('session-3', noClaims);
    expect(result.flagged_count).toBe(0);
    expect(result.claims).toHaveLength(0);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `citations_report` already in DB | Return cached — skip GPT and regex passes |
| No sections match any claim pattern | Return `{ flagged_count: 0, claims: [] }` — skip GPT call entirely |
| GPT returns `needs_citation: false` for a claim | Exclude from report — only `true` entries are stored and shown |
| Session not found | `res.status(404).json({ success: false, error: 'Session not found' })` |
| `session.user_id !== userId` | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| Frontend fetch fails | `setError('Detection failed')` — display in `.citation-error` with `role="alert"` |
| `onScrollToSection` not provided | Render claim without "Jump to section" button |

---

## Acceptance Criteria
- [ ] WHEN "Detect Unsupported Claims" is clicked THEN claims are scanned and results appear
- [ ] WHEN a claim is found THEN it shows snippet + type badge + "Jump to section" button
- [ ] WHEN "Jump to section" is clicked THEN the page scrolls to the flagged section
- [ ] WHEN no claims found THEN "No unsupported claims found ✓" message displays
- [ ] WHEN result is cached THEN GPT is not called again
- [ ] Sections with no claim patterns are NOT sent to GPT
- [ ] TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> This is the final feature task. Fill via `/task-handoff` after completing this task.

**Files changed:**
- `backend/src/db/migrations/009_citations.sql` (created)
- `backend/src/services/citation-detector.ts` (created)
- `backend/src/routes/sessions-citations.ts` (created)
- `backend/src/server.ts` (modified — registered sessionsCitationsRouter)
- `frontend/src/components/CitationPanel.tsx` (created)
- `frontend/src/ReviewPage.tsx` (modified — CitationPanel import + JSX + section id wrapper)
- `frontend/src/styles.css` (modified — Citation Panel CSS)

**Decisions made:**
- Used `createAdminSupabaseClient` in service (consistent with all other services)
- Used `getAuthenticatedUser`/`getVerifiedAccessToken`/`createUserScopedSupabaseClient` in route (consistent with all other routes)
- Added `apiBaseUrl` prop to CitationPanel (consistent with AIReviewPanel pattern)
- SectionCard wrapped in `<div id="section-{id}">` only in the active section render (single SectionCard is rendered at a time)
- Added AbortController timeout (60s) consistent with tone-checker and reviewer patterns

**Context for next task:** _(none — this is the last task)_
**Open questions:** _(none)_

Status: COMPLETE
Completed: 2026-04-22T00:00:00Z
