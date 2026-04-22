---
task: 003
feature: readability-score
status: pending
model: haiku
supervisor: software-cto
agent: web-frontend-expert
depends_on: [002]
---

# Task 003: Readability Score per Section (Flesch-Kincaid)

## Skills
- .kit/skills/frameworks-frontend/react-ui-patterns/SKILL.md
- .kit/skills/frameworks-frontend/react-best-practices/SKILL.md
- .kit/skills/core/karpathy-principles/SKILL.md

## Agents
- @web-frontend-expert

## Commands
- /verify
- /task-handoff

> Load the skills, agents, and commands listed above before reading anything else. Do not load context not listed here.

---

## Objective

Add a Flesch-Kincaid grade-level badge to each SectionCard in ReviewPage — computed entirely client-side using a JS formula, no API call required.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `frontend/src/lib/readability.ts` | Pure function: `computeFKGradeLevel(text: string): number` |

### Modify
| File | What to change |
|------|---------------|
| `frontend/src/components/SectionCard.tsx` | Accept `fkGradeLevel: number \| null` prop; render badge next to section type label |
| `frontend/src/ReviewPage.tsx` | Compute FK grade for each section using `corrected_text ?? original_text`; pass to SectionCard |

---

## Dependencies
_(none — pure client-side math, no new packages)_

---

## API Contracts
_(none — fully client-side)_

---

## Code Templates

### `frontend/src/lib/readability.ts` (create this file exactly)
```typescript
/**
 * Compute Flesch-Kincaid Grade Level for a block of text.
 * Returns null when text is too short to be meaningful (< 10 words).
 *
 * Formula: 0.39 × (words/sentences) + 11.8 × (syllables/words) − 15.59
 */
export function computeFKGradeLevel(text: string): number | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  // Count sentences: split on ., !, ? followed by whitespace or end
  const sentences = cleaned.split(/[.!?]+\s*/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);

  // Count words: split on whitespace
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  if (wordCount < 10) return null;

  // Count syllables using English heuristic
  const syllableCount = words.reduce((total, word) => total + countSyllables(word), 0);

  const grade =
    0.39 * (wordCount / sentenceCount) +
    11.8 * (syllableCount / wordCount) -
    15.59;

  return Math.round(grade * 10) / 10;
}

/**
 * Count syllables in a single English word using the standard heuristic:
 * - Count vowel groups (consecutive vowels = 1 syllable)
 * - Subtract silent 'e' at end
 * - Minimum 1 syllable per word
 */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;

  // Special case: short words
  if (w.length <= 3) return 1;

  // Remove silent trailing 'e'
  const stripped = w.endsWith('e') ? w.slice(0, -1) : w;

  // Count vowel groups
  const vowelGroups = stripped.match(/[aeiouy]+/g);
  const count = vowelGroups ? vowelGroups.length : 1;

  return Math.max(count, 1);
}

/**
 * Convert a FK grade level number to a human-readable label.
 * Grade ≤ 6  → "Easy"
 * Grade 7–9  → "Moderate"
 * Grade 10–12 → "Difficult"
 * Grade > 12  → "Very Difficult"
 */
export function fkGradeLabel(grade: number): string {
  if (grade <= 6) return 'Easy';
  if (grade <= 9) return 'Moderate';
  if (grade <= 12) return 'Difficult';
  return 'Very Difficult';
}
```

### `frontend/src/ReviewPage.tsx` — before → after (add import + pass fkGradeLevel)

**Before (import block at top, around line 4):**
```typescript
import { SectionCard } from './components/SectionCard';
```
**After:**
```typescript
import { SectionCard } from './components/SectionCard';
import { computeFKGradeLevel } from './lib/readability';
```

**Before (inside JSX map that renders SectionCard — search for `<SectionCard`):**
```typescript
<SectionCard
```
**After:** Add `fkGradeLevel` prop to every `<SectionCard` render call. The value is computed inline:
```typescript
<SectionCard
  fkGradeLevel={computeFKGradeLevel(section.corrected_text ?? section.original_text)}
```

### `frontend/src/components/SectionCard.tsx` — before → after

**Read the existing SectionCard props interface and add:**

Find the props interface (search for `interface SectionCard` or the props destructuring). Add:
```typescript
fkGradeLevel: number | null;
```

Find the section type label render (the element that shows "heading" or "paragraph" near the top of each card). After that label element, insert:
```tsx
{fkGradeLevel !== null && (
  <span
    className="fk-badge"
    title={`Flesch-Kincaid Grade ${fkGradeLevel}`}
    aria-label={`Reading level grade ${fkGradeLevel}`}
  >
    Grade {fkGradeLevel}
  </span>
)}
```

Add CSS to `frontend/src/styles.css`:
```css
/* Flesch-Kincaid grade badge */
.fk-badge {
  display: inline-block;
  padding: 0.125rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  background: #e2e8f0;
  color: #475569;
  margin-left: 0.375rem;
  vertical-align: middle;
}
```

---

## Codebase Context

### Key Code Snippets
```typescript
// ReviewPage.tsx — SectionRecord interface (lines ~34–50)
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
  ai_score: number | null;
  humanized_text: string | null;
  status: 'pending' | 'ready' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}
```

### Key Patterns in Use
- **No API for client-side computation:** Readability is computed in the browser using `corrected_text ?? original_text` — never call the backend for this.
- **Null guard:** If `computeFKGradeLevel` returns `null` (< 10 words), render nothing — not `0` or `--`.
- **CSS class names:** All project styles live in `frontend/src/styles.css`. Add new classes there, not inline styles.
- **Props pattern:** SectionCard props are typed as an interface; extend it with `fkGradeLevel: number | null`.

---

## Handoff from Previous Task
> Populated by /task-handoff after task-002 completes. Empty until then.

**Files changed by previous task:** _(none yet)_
**Decisions made:** _(none yet)_
**Context for this task:** _(none yet)_
**Open questions left:** _(none yet)_

---

## Implementation Steps
1. Create `frontend/src/lib/readability.ts` with the exact code template above.
2. Open `frontend/src/components/SectionCard.tsx` — find the props interface, add `fkGradeLevel: number | null`.
3. In SectionCard JSX, find the section type label element and insert the `fk-badge` span after it (code template above).
4. Open `frontend/src/styles.css` — append the `.fk-badge` CSS block from the template above.
5. Open `frontend/src/ReviewPage.tsx` — add `import { computeFKGradeLevel } from './lib/readability';`.
6. In ReviewPage, find every `<SectionCard` JSX call and add `fkGradeLevel={computeFKGradeLevel(section.corrected_text ?? section.original_text)}`.
7. Run: `cd frontend && npx tsc --noEmit`
8. Run: `/verify`

---

## Test Cases

### File: `frontend/src/lib/readability.test.ts`
```typescript
import { describe, expect, it } from 'vitest';
import { computeFKGradeLevel, fkGradeLabel } from './readability';

describe('computeFKGradeLevel', () => {
  it('returns null for text with fewer than 10 words', () => {
    expect(computeFKGradeLevel('Short text here.')).toBeNull();
  });

  it('returns a number for a normal paragraph', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. ' +
      'This sentence adds more words to reach the minimum threshold for scoring.';
    const result = computeFKGradeLevel(text);
    expect(typeof result).toBe('number');
    expect(result).not.toBeNull();
  });

  it('returns null for empty string', () => {
    expect(computeFKGradeLevel('')).toBeNull();
  });

  it('returns a higher grade for complex text', () => {
    const simple = 'The cat sat on the mat. Dogs run fast in parks daily. Birds fly high above tall trees now.';
    const complex =
      'The epistemological underpinnings of postmodern philosophical discourse necessitate a comprehensive ' +
      'reevaluation of traditional metaphysical assumptions inherent in contemporary academic scholarship.';
    const simpleGrade = computeFKGradeLevel(simple);
    const complexGrade = computeFKGradeLevel(complex);
    expect(simpleGrade).not.toBeNull();
    expect(complexGrade).not.toBeNull();
    expect(complexGrade!).toBeGreaterThan(simpleGrade!);
  });
});

describe('fkGradeLabel', () => {
  it('returns Easy for grade ≤ 6', () => {
    expect(fkGradeLabel(5)).toBe('Easy');
    expect(fkGradeLabel(6)).toBe('Easy');
  });

  it('returns Moderate for grade 7–9', () => {
    expect(fkGradeLabel(7)).toBe('Moderate');
    expect(fkGradeLabel(9)).toBe('Moderate');
  });

  it('returns Difficult for grade 10–12', () => {
    expect(fkGradeLabel(10)).toBe('Difficult');
    expect(fkGradeLabel(12)).toBe('Difficult');
  });

  it('returns Very Difficult for grade > 12', () => {
    expect(fkGradeLabel(13)).toBe('Very Difficult');
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `computeFKGradeLevel` returns `null` | Render nothing — no badge, no `--` placeholder |
| `corrected_text` is null | Use `original_text` as fallback: `corrected_text ?? original_text` |
| Grade number is fractional | Round to 1 decimal place (already done in `computeFKGradeLevel`) |
| Text is whitespace only | Return `null` — guard with `.trim()` check |

---

## Acceptance Criteria
- [ ] WHEN a section has ≥ 10 words THEN a grade badge (e.g. "Grade 8.2") appears next to the section type label
- [ ] WHEN a section has < 10 words THEN no badge is rendered
- [ ] WHEN `corrected_text` is null THEN `original_text` is used for computation
- [ ] All readability unit tests pass
- [ ] `npx tsc --noEmit` — zero errors in frontend workspace
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
