# AI Detection & Humanization 

---

## 1. Overview

Add per-section AI content detection and humanization to the proof-reading engine. Every section is automatically scored for AI-generated content during the existing proofreading pipeline. Sections scoring above a threshold expose a "Humanize" button that rewrites the text to sound more human, surfaced as a new tab in SectionCard.

---

## 2. Data Model

Two new nullable columns on the `sections` Supabase table:

```sql
ALTER TABLE sections ADD COLUMN ai_score integer;
ALTER TABLE sections ADD COLUMN humanized_text text;
```

Updated `SectionRecord` TypeScript interface (frontend + backend):

```typescript
interface SectionRecord {
  // ... existing fields unchanged ...
  ai_score: number | null;        // 0–100, null = not yet scored
  humanized_text: string | null;  // null = humanize not yet run
}
```

**Score bands:**

| Range | Label | Badge color | Humanize button |
|---|---|---|---|
| 0–30 | Likely Human | Green | Hidden |
| 31–60 | Mixed | Yellow | Hidden |
| 61–100 | Likely AI | Red | Visible |

---

## 3. Scoring Algorithm

Runs per section during the proofreading pipeline, immediately after proofreading completes.

### Stage 1 — Local Heuristics (free, synchronous)

Four signals, each normalized 0–100, averaged into `heuristic_score`:

| Signal | Measurement | AI tell |
|---|---|---|
| Sentence length variance | Std deviation of sentence character lengths | AI writes uniform-length sentences (low variance = high AI score) |
| Burstiness | Variance of word-count per sentence vs. mean | AI has low burstiness (low variance = high AI score) |
| Vocabulary richness | Type-token ratio (unique words / total words) | AI overuses common words (low TTR = high AI score) |
| Punctuation patterns | Ratio of complex punctuation (em-dash, semicolons) to total punctuation | AI underuses them (low ratio = high AI score) |

### Stage 2 — GPT-4o Scoring

Single GPT-4o call with the section text and `heuristic_score` as context. GPT returns a 0–100 score.

### Final Formula

```
ai_score = round(heuristic_score * 0.35 + gpt_score * 0.65)
```

---

## 4. Humanization

### Trigger
User clicks "Humanize" button on a section with `ai_score >= 61`.

### Endpoint
```
POST /api/sections/:id/humanize
Authorization: Bearer <token>
Body: none
Response: { success: true, data: SectionRecord }  // humanized_text populated
```

### GPT-4o Prompt Strategy
- Input: current `corrected_text` (not original), `ai_score`, highest heuristic signals
- Instructions: vary sentence length, add burstiness, use richer vocabulary, inject natural connective phrases, preserve meaning/tone/domain terminology exactly
- Output: rewritten text only (no JSON wrapper)

### "Use this version" button
- Copies `humanized_text` into the section's editable corrected text (`editedText` state)
- Does not auto-accept — user still clicks Accept/Reject as normal
- Humanized tab remains visible for comparison

---

## 5. UI Changes

### SectionCard header badge
- Displays next to section type label
- Shows `--` while `ai_score` is null
- Color follows score band table above
- Example: `[Section 3 · Paragraph]  [73% AI ●]`

### Tab strip
Before humanize: `[ Corrected text ]  [ Inline diff ]  [ Summary ]`  
After humanize:  `[ Corrected text ]  [ Inline diff ]  [ Summary ]  [ Humanized ]`

- "Humanized" tab only renders when `humanized_text` is non-null

### Humanize button
- Renders below tab strip only when `ai_score >= 61`
- States: idle → loading spinner → hidden (once humanized_text is populated)
- Error state shown inline if API call fails

### New `SectionCardProps`

```typescript
aiScore: number | null
humanizedText: string | null
isHumanizing: boolean
humanizeError: string | null
onHumanize: () => void
onUseHumanizedVersion: () => void
```

---

## 6. Backend Changes

### New files

**`backend/src/services/ai-scorer.ts`**
- `computeHeuristicScore(text: string): number`
- `scoreSectionWithAI(text: string, heuristicScore: number): Promise<number>`
- `scoreSection(text: string): Promise<number>` — orchestrator, returns final `ai_score`

**`backend/src/services/humanizer.ts`**
- `humanizeSection(text: string, aiScore: number): Promise<string>`

### Modified files

**`backend/src/services/proofreader.ts`**
- After each section is proofread and saved as `ready`, call `scoreSection(corrected_text)` and save result to `ai_score`

**`backend/src/routes/sections.ts`**
- Add `POST /api/sections/:id/humanize` route
- Calls `humanizeSection()`, saves result to `humanized_text`, returns updated `SectionRecord`

### No new environment variables needed
Reuses existing `OPENAI_API_KEY`.

---

## 7. Frontend Changes

### Modified files

**`frontend/src/ReviewPage.tsx`**
- Add `humanizingSectionId: string | null` state
- Add `humanizeErrorBySectionId: Record<string, string>` state
- Add `handleHumanize(sectionId)` — POST `/api/sections/:id/humanize`, update local section state
- Add `handleUseHumanizedVersion(sectionId)` — copy `humanized_text` into `editedTextBySectionId`
- Pass new props to each SectionCard

**`frontend/src/components/SectionCard.tsx`**
- Add AI score badge to section header
- Add "Humanized" tab (conditional on `humanizedText` non-null)
- Add Humanize button (conditional on `aiScore >= 61`)
- Add "Use this version" button inside Humanized tab
- Accept new props from `SectionCardProps`

---

## 8. Out of Scope

- Document-level aggregate AI score panel
- Per-sentence highlighting of AI-detected phrases
- Storing scoring history or audit trail
- Any third-party AI detection API integration
