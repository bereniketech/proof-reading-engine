# Task 002 — AI Detection & Humanization

## Skills
- `.kit/skills/core/karpathy-principles/SKILL.md`
- `.kit/skills/development/code-writing-software-development/SKILL.md`
- `.kit/skills/development/api-design/SKILL.md`
- `.kit/skills/frameworks-frontend/react-best-practices/SKILL.md`
- `.kit/skills/frameworks-frontend/react-ui-patterns/SKILL.md`
- `.kit/skills/frameworks-backend/nodejs-backend-patterns/SKILL.md`
- `.kit/skills/data-backend/postgres-patterns/SKILL.md`
- `.kit/skills/ui-design/ui-ux-pro-max/SKILL.md`
- `.kit/skills/_studio/batch-tasks/SKILL.md`

## Agents
- `@web-backend-expert`
- `@web-frontend-expert`
- `@database-reviewer`

## Commands
- `/tdd`
- `/code-review`
- `/verify`

---

## Goal
Add per-section AI content detection scoring and on-demand humanization to the proofreading pipeline.

## Feature Overview

**Two new nullable columns on `sections`:**
```sql
ALTER TABLE sections ADD COLUMN ai_score integer;
ALTER TABLE sections ADD COLUMN humanized_text text;
```

**Score bands:**
| Range | Label | Badge | Humanize button |
|---|---|---|---|
| null | — | Grey `--` | Hidden |
| 0–30 | Likely Human | Green | Hidden |
| 31–60 | Mixed | Yellow | Hidden |
| 61–100 | Likely AI | Red | Visible |

**Scoring formula:** `ai_score = round(heuristic_score × 0.35 + gpt_score × 0.65)`

Heuristic signals (each normalized 0–100, averaged):
- Sentence length variance — low variance → high AI score
- Burstiness — low word-count variance per sentence → high AI score
- Vocabulary richness (TTR: unique words / total words) — low TTR → high AI score
- Punctuation patterns — low ratio of em-dash/semicolons to total punctuation → high AI score

GPT-4o call receives `text` + `heuristic_score`, returns 0–100.

**Humanize flow:** User clicks Humanize (score ≥ 61) → `POST /api/sections/:id/humanize` → GPT-4o rewrites `corrected_text` varying sentence length, burstiness, vocabulary, preserving meaning/tone/domain terms → stored in `humanized_text`. "Use this version" copies into editable corrected text without auto-accepting.

---

## Acceptance Criteria
- [ ] Migration applied; `ai_score` and `humanized_text` columns exist on `sections`
- [ ] `SectionRecord` type updated in both `backend/src/types/` and `frontend/src/types/`
- [ ] `ai_score` populated for all sections after proofreading completes
- [ ] `POST /api/sections/:id/humanize` returns updated `SectionRecord` with `humanized_text`
- [ ] SectionCard badge renders correct color and label per band (grey while null)
- [ ] Humanize button hidden for score < 61, visible + functional for score ≥ 61
- [ ] Humanized tab appears only when `humanized_text` is non-null
- [ ] "Use this version" copies text without auto-accepting
- [ ] TypeScript strict mode — no `any`
- [ ] `/verify` (typecheck + lint) passes on both workspaces

---

## Steps

### Step 1 — Database migration
File: `backend/src/db/migrations/003_ai_detection.sql`
```sql
ALTER TABLE sections ADD COLUMN ai_score integer;
ALTER TABLE sections ADD COLUMN humanized_text text;
```
Update `SectionRecord` interface in `backend/src/types/` and `frontend/src/types/`.

### Step 2 — `backend/src/services/ai-scorer.ts`
- `computeHeuristicScore(text: string): number` — four signals, each 0–100, averaged
- `scoreSectionWithAI(text: string, heuristicScore: number): Promise<number>` — GPT-4o call returning 0–100
- `scoreSection(text: string): Promise<number>` — `round(heuristic * 0.35 + gpt * 0.65)`

### Step 3 — `backend/src/services/humanizer.ts`
- `humanizeSection(text: string, aiScore: number): Promise<string>`
- GPT-4o prompt: input = `corrected_text` + `aiScore` + top heuristic signals; instructions = vary sentence length, add burstiness, richer vocabulary, preserve meaning/tone/domain terms; output = rewritten text only

### Step 4 — `backend/src/services/proofreader.ts`
After each section saved as `ready`, call `scoreSection(corrected_text)` and update `ai_score`.

### Step 5 — `backend/src/routes/sections.ts`
Add `POST /api/sections/:id/humanize` — auth required, call `humanizeSection()`, save `humanized_text`, return updated `SectionRecord`.

### Step 6 — `frontend/src/ReviewPage.tsx`
- State: `humanizingSectionId: string | null`, `humanizeErrorBySectionId: Record<string, string>`
- `handleHumanize(sectionId)` — POST, update local section state
- `handleUseHumanizedVersion(sectionId)` — copy `humanized_text` into `editedTextBySectionId`
- Pass new props to each SectionCard

### Step 7 — `frontend/src/components/SectionCard.tsx`
New props: `aiScore`, `humanizedText`, `isHumanizing`, `humanizeError`, `onHumanize`, `onUseHumanizedVersion`
- AI score badge next to section type label; `--` while null, colored per band
- Humanize button (score ≥ 61): idle → spinner → hidden once `humanized_text` populated; inline error on failure
- "Humanized" tab: renders only when `humanizedText` non-null
- "Use this version" button inside Humanized tab

---

## Out of Scope
- Document-level aggregate AI score panel
- Per-sentence highlighting
- Scoring history / audit trail
- Third-party AI detection API integration

Status: COMPLETE
Completed: 2026-04-22T00:00:00Z
