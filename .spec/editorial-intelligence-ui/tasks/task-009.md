---
task: 009
feature: editorial-intelligence-ui
status: pending
depends_on: [008]
---

# Task 009: Build SuggestionPanel Component

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app, /code-writing-software-development
Commands: /verify, /task-handoff

---

## Objective
Build the `SuggestionPanel` component that derives AI suggestions from sections with a corrected_text, groups them by category (Clarity / Conciseness / Tone) using change_summary keyword matching, and allows accepting suggestions via PATCH /api/sections/:id. This component is consumed by EditorPage in task-010.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/components/SectionCard.tsx:7-16 — SectionCardSection interface (existing)
export interface SectionCardSection {
  id: string;
  position: number;
  section_type: string;
  original_text: string;
  corrected_text: string | null;
  reference_text: string | null;
  change_summary: string | null;
  status: SectionStatus; // 'pending' | 'ready' | 'accepted' | 'rejected'
}
```

```typescript
// frontend/src/ReviewPage.tsx:34-48 — SectionRecord (superset of SectionCardSection)
interface SectionRecord {
  id: string;
  session_id: string;
  position: number;
  section_type: string;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
  reference_text: string | null;
  final_text: string | null;
  change_summary: string | null;
  status: SectionStatus;
  created_at: string;
  updated_at: string;
}
```

```typescript
// frontend/src/lib/constants.ts — apiBaseUrl
export const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';
```

```
// backend/src/routes/sections.ts — PATCH /sections/:id response shape
// PATCH body: { status: 'accepted' }
// Response: { success: true, data: SectionRecord }
```

### Key Patterns in Use
- **Suggestion derivation:** `sections.filter(s => s.corrected_text && s.corrected_text !== s.original_text && s.status !== 'accepted' && s.status !== 'rejected')`.
- **Category assignment:** Keyword match on `change_summary?.toLowerCase()`:
  - "clarity" | "passive" | "unclear" | "verbose" → Clarity
  - "concise" | "filler" | "redundant" | "wordy" → Conciseness
  - "tone" | "formal" | "voice" | "register" → Tone
  - null or no match → default to Clarity
- **Accept action:** `PATCH ${apiBaseUrl}/api/sections/${id}` with `{ status: 'accepted' }` and Bearer token.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/pages/DashboardPage.tsx`, `frontend/src/styles.css` (responsive), `frontend/src/lib/constants.ts` (helpers)
**Decisions made:** DashboardPage complete. Upload works. Sessions list renders.
**Context for this task:** Now build the suggestion panel used in the editor.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Create `frontend/src/components/SuggestionPanel.tsx`:

```typescript
import { useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';

interface SectionForPanel {
  id: string;
  original_text: string;
  corrected_text: string | null;
  change_summary: string | null;
  status: SectionStatus;
}

type SuggestionCategory = 'Clarity' | 'Conciseness' | 'Tone';

interface Suggestion {
  sectionId: string;
  category: SuggestionCategory;
  original: string;
  corrected: string;
  summary: string | null;
}

function categorize(summary: string | null): SuggestionCategory {
  if (!summary) return 'Clarity';
  const s = summary.toLowerCase();
  if (s.includes('concise') || s.includes('filler') || s.includes('redundant') || s.includes('wordy')) return 'Conciseness';
  if (s.includes('tone') || s.includes('formal') || s.includes('voice') || s.includes('register')) return 'Tone';
  return 'Clarity';
}

const CATEGORY_STYLE: Record<SuggestionCategory, { border: string; label: string; labelColor: string }> = {
  Clarity:     { border: 'var(--color-primary)',   label: 'Clarity',     labelColor: 'var(--color-primary)' },
  Conciseness: { border: 'var(--color-error)',     label: 'Conciseness', labelColor: 'var(--color-error)' },
  Tone:        { border: 'var(--color-secondary)', label: 'Tone',        labelColor: 'var(--color-secondary)' },
};

interface SuggestionPanelProps {
  sections: SectionForPanel[];
  accessToken: string;
  onSectionAccepted: (sectionId: string) => void;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function SuggestionPanel({ sections, accessToken, onSectionAccepted }: SuggestionPanelProps): JSX.Element {
  const [accepting, setAccepting] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const suggestions: Suggestion[] = sections
    .filter((s) => s.corrected_text && s.corrected_text !== s.original_text && s.status !== 'accepted' && s.status !== 'rejected')
    .map((s) => ({
      sectionId: s.id,
      category: categorize(s.change_summary),
      original: s.original_text,
      corrected: s.corrected_text!,
      summary: s.change_summary,
    }));

  const handleAccept = async (suggestion: Suggestion): Promise<void> => {
    setAccepting((prev) => new Set(prev).add(suggestion.sectionId));
    setErrors((prev) => { const next = { ...prev }; delete next[suggestion.sectionId]; return next; });

    try {
      const res = await fetch(`${apiBaseUrl}/api/sections/${suggestion.sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: 'accepted' }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setErrors((prev) => ({ ...prev, [suggestion.sectionId]: json.error ?? 'Failed to accept' }));
      } else {
        onSectionAccepted(suggestion.sectionId);
      }
    } catch {
      setErrors((prev) => ({ ...prev, [suggestion.sectionId]: 'Network error' }));
    } finally {
      setAccepting((prev) => { const next = new Set(prev); next.delete(suggestion.sectionId); return next; });
    }
  };

  // Compute word count and readability from sections
  const allText = sections.map((s) => s.original_text).join(' ');
  const wordCount = allText.split(/\s+/).filter(Boolean).length;

  return (
    <aside style={{
      width: '20rem', minWidth: '20rem', background: 'var(--color-surface-container-low)',
      display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-outline-variant)',
      height: '100%', overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--color-outline-variant)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="font-display" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
            AI Suggestions
          </h2>
          {suggestions.length > 0 && (
            <span style={{
              background: 'var(--color-surface-container-highest)', color: 'var(--color-primary)',
              fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)', letterSpacing: '0.05rem',
            }}>
              {suggestions.length} NEW
            </span>
          )}
        </div>
      </div>

      {/* Suggestions list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {suggestions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem', color: 'var(--color-tertiary-fixed-dim)' }}>check_circle</span>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>All suggestions reviewed</p>
          </div>
        ) : (
          suggestions.map((suggestion) => {
            const style = CATEGORY_STYLE[suggestion.category];
            const isAccepting = accepting.has(suggestion.sectionId);
            return (
              <div
                key={suggestion.sectionId}
                style={{
                  background: 'var(--color-surface-container-lowest)',
                  borderRadius: 'var(--radius-xl)', padding: '1rem',
                  borderLeft: `4px solid ${style.border}`,
                  boxShadow: '0 1px 4px rgba(19,27,46,0.06)',
                }}
              >
                {/* Category label */}
                <div style={{
                  fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.08rem', color: style.labelColor, marginBottom: '0.625rem',
                }}>
                  {style.label}
                </div>

                {/* Original excerpt */}
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
                  "{truncate(suggestion.original, 80)}"
                </p>

                {/* Arrow + suggestion */}
                <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'flex-start', margin: '0.5rem 0 0.875rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-tertiary-fixed-dim)', flexShrink: 0, marginTop: '0.1rem' }}>arrow_downward</span>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface)' }}>
                    {truncate(suggestion.corrected, 120)}
                  </p>
                </div>

                {/* Error */}
                {errors[suggestion.sectionId] && (
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--color-error)' }}>
                    {errors[suggestion.sectionId]}
                  </p>
                )}

                {/* Accept button */}
                <button
                  onClick={() => { void handleAccept(suggestion); }}
                  disabled={isAccepting}
                  style={{
                    width: '100%', border: 'none', borderRadius: 'var(--radius-lg)',
                    padding: '0.5rem 0.75rem', cursor: isAccepting ? 'not-allowed' : 'pointer',
                    background: 'var(--color-tertiary-fixed)', color: 'var(--color-on-tertiary-fixed)',
                    fontWeight: 700, fontSize: '0.8rem', opacity: isAccepting ? 0.6 : 1,
                  }}
                >
                  {isAccepting ? 'Accepting…' : 'Accept Suggestion'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom metrics strip */}
      <div style={{
        padding: '0.875rem 1.25rem', borderTop: '1px solid var(--color-outline-variant)',
        display: 'flex', gap: '1rem', flexShrink: 0,
      }}>
        <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-surface-container)', borderRadius: 'var(--radius-lg)', padding: '0.5rem' }}>
          <div className="font-display" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-primary)' }}>{wordCount.toLocaleString()}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Words</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-surface-container)', borderRadius: 'var(--radius-lg)', padding: '0.5rem' }}>
          <div className="font-display" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-tertiary)' }}>{suggestions.length}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Pending</div>
        </div>
      </div>
    </aside>
  );
}
```

2. Run `npm run typecheck` — must pass.

_Requirements: 5.3, 5.4, 5.5_
_Skills: /build-website-web-app — component; /code-writing-software-development — derivation logic_

---

## Acceptance Criteria
- [ ] Sections with `corrected_text !== original_text` and non-terminal status appear as suggestion cards.
- [ ] Categories correctly assigned: "passive voice" → Clarity, "filler words" → Conciseness, "tone" → Tone.
- [ ] "Accept Suggestion" button PATCHes `/api/sections/:id` with `{ status: 'accepted' }`.
- [ ] After successful accept, `onSectionAccepted` is called and the card disappears.
- [ ] Empty state ("All suggestions reviewed") shown when list is empty.
- [ ] Word count displays correctly in the metrics strip.
- [ ] `npm run typecheck` exits 0.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
