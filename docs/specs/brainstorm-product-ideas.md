# Product Ideas — Brainstorm

> Raw ideation document. Not scoped or committed. Use this to pressure-test, prioritize, and eventually shape into task specs.

---

## 1. Independent AI Reviewer

**The idea:**
After proofreading completes, the user can request a holistic review of the entire document — not corrections, but top-level critique. The AI acts as an expert reader who has never seen the document before.

**What it returns:**
- Strengths — what is working well
- Weaknesses — structural, argumentative, or tonal problems
- Recommendations — concrete things to change
- Overall score (0–100) with a label: Needs Work / Good / Strong

**Why it's valuable:**
Proofreading fixes grammar and clarity at the section level. This catches problems that only show up when you read the whole thing — a weak conclusion, a missing setup, an argument that doesn't land, tone that shifts halfway through.

**Key decisions to resolve:**
- Cached per session or re-run on demand?
- Do we show which sections contributed to each weakness?
- Should the score influence anything else in the UI (e.g. block export until score ≥ X)?

---

## 2. Document Q&A Chat

**The idea:**
A collapsible chat drawer on the review page. The user asks the AI questions about their document in natural language. The AI has the full document as context and answers only questions about it.

**Example questions:**
- "Is my introduction too long?"
- "Where should I mention pricing?"
- "Does my tone stay consistent?"
- "What's the weakest section?"
- "Am I repeating myself anywhere?"

**Why it's valuable:**
Users often don't know what's wrong — they just feel something is off. A chat interface lets them probe the document without knowing the right question to ask upfront. It's the difference between a spell checker and having a knowledgeable colleague read it.

**Key decisions to resolve:**
- Do we persist chat history per session? (Adds a `chats` table — allows resuming conversation later)
- Streaming response or full response? (Streaming feels more alive for a chat UI)
- Do we let the AI decline off-topic questions, or let it answer anything?
- Does the chat have awareness of the reviewer's score and the section-level AI scores?

---

## 3. Structured Section Insertion — AI-Guided

**The idea:**
User wants to add a new section but doesn't know what to add or where to put it. They open an "Add Section" flow, optionally describe what they want, and the AI:
1. Suggests the best format (table, questionnaire, bullet list, paragraph, summary box)
2. Suggests where in the document to insert it (with reasoning)
3. Scaffolds a starting template based on the document's topic and context

**Four entry cases — all handled by the same flow:**

| User has content? | Knows format? | AI does |
|---|---|---|
| No | No | Suggests format + scaffolds content from document context |
| No | Yes | Scaffolds content in the chosen format |
| Yes | Yes | Formats the content into the chosen structure |
| Yes | No | Suggests best format for their content |

**The hint field:**
An optional free-text input — "I want to compare our three pricing tiers" or "I need a sign-off section". AI uses this plus document context to produce a more relevant scaffold.

**Preview before insert:**
The scaffold is editable before the user confirms. Nothing is written to the document until the user accepts. Same non-destructive principle as humanization.

**Key decisions to resolve:**
- How many placement suggestions do we show? (1–3 ranked options feels right)
- Does the inserted section go through the normal proofreading pipeline automatically?
- Do we support markdown table rendering in the editor, or plain text only?

---

## 4. Reformat Existing Section

**The idea:**
User has an existing section — prose, a list, whatever — and wants to restructure it into a different format without rewriting the content. "Turn this paragraph into a table."

**Formats:** table, questionnaire, bullet list, summary box, back to paragraph

**The critical constraint:**
AI must preserve every piece of content. Not summarize, not paraphrase, not drop a row. Structural change only. This needs to be explicit in the system prompt and ideally verified.

**Flow:**
1. "Reformat" option on the section card
2. User picks target format
3. AI returns a reformatted version — shown in a new "Reformatted" tab on that card (same UX as the Humanized tab)
4. "Use this version" copies it into the editable corrected text without auto-accepting

**Key decisions to resolve:**
- Do we support markdown table rendering in the section card?
- What happens if the user reformats, then reformats again to a third format — do we chain from the reformatted version or always from the original?
- Should we warn the user if the reformatted output appears to have lost content (character count drops significantly)?

---

## 5. Tone & Audience Consistency Check

**The idea:**
Document-level analysis that detects tone shifts across sections. Each section gets a tone label (formal, casual, technical, conversational) and the document gets flagged if sections are inconsistent with each other or with the declared document type.

**Output:**
- Per-section tone label
- Consistency score (0–100)
- Flagged sections that are outliers
- Suggested rewrites for outlier sections

**Why it's valuable:**
A business report that goes casual in section 4 loses credibility. An academic paper that suddenly gets conversational breaks immersion. Users often don't notice because they wrote each section at a different time.

**Key decisions to resolve:**
- Do we derive the "target tone" from the document type, or ask the user to declare it?
- Is this triggered automatically after proofreading, or on demand like the reviewer?
- Do the tone labels feed into the independent reviewer's output (task 1)?

---

## 6. Document Completeness Score

**The idea:**
Based on document type (business proposal, academic essay, research report, contract, etc.), the AI checks whether the document has all the sections that type typically requires.

**Example — Business Proposal:**
- Executive Summary ✓
- Problem Statement ✓
- Proposed Solution ✗ (missing)
- Pricing / Budget ✗ (missing)
- Timeline ✓
- Call to Action ✗ (missing)

**Why it's valuable:**
Users often submit incomplete documents without realizing it. This gives them a checklist grounded in document-type conventions rather than generic advice.

**Connection to structured insertion:**
Each missing section in the checklist is a direct entry point into the "Add Section" flow (idea 3). The gap and the tool to fix it live in the same place.

**Key decisions to resolve:**
- Where do we get the document type — from the upload form, or inferred by AI?
- Do we hard-code expected sections per document type, or ask GPT-4o to derive them dynamically?
- Does this run automatically or on demand?

---

## 7. Version Diffing & Quality Delta

**The idea:**
When a user runs proofreading multiple times on the same document (after edits), show what changed and whether quality metrics improved.

**Tracked metrics across versions:**
- AI detection score (per section and overall)
- Readability score
- Tone consistency
- Word count delta
- Number of corrections accepted

**Why it's valuable:**
Users can't see if they're making the document better or worse through their edits. A simple "Version 2 vs Version 1" delta — "AI score dropped from 72 → 31, readability improved in 4 sections" — gives concrete evidence of progress.

**Key decisions to resolve:**
- Is a "version" a new proofreading session on the same document, or do we need explicit version snapshots?
- How many versions do we retain?
- Is this a dedicated page or a panel within the review page?

---

## 8. Readability Score per Section

**The idea:**
A readability grade level (Flesch-Kincaid or similar) computed for each section and shown as a badge alongside the AI detection score.

**Score bands:**
| Grade | Label | Audience |
|---|---|---|
| ≤ 8 | Easy | General public |
| 9–12 | Moderate | High school / general professional |
| 13–16 | Complex | College / specialist |
| 17+ | Dense | Academic / expert only |

**Why it's valuable:**
Readability is a fast, cheap signal — computed client-side or with simple server math, no GPT call needed. Tells the user immediately if a section is too dense for their intended audience.

**Key decisions to resolve:**
- Compute client-side (no cost, instant) or server-side (consistent, easier to test)?
- Does this feed into the tone & audience check (idea 5)?
- Do we show a document-level aggregate or only per-section?

---

## 9. Citation & Claim Detector

**The idea:**
Flags statements that look like factual claims without a source — "Studies show...", "Research indicates...", "It is widely accepted...", "Statistics suggest...". Doesn't verify facts — just surfaces them for the user to review.

**Why it's valuable:**
Particularly useful for academic, research, and business documents. Users often write claim-style sentences without noticing. The detector gives them a checklist of things to back up before submitting.

**Key decisions to resolve:**
- Pattern-matching (cheap, fast, some false positives) vs GPT-4o classification (accurate, costs tokens)?
- Do we show this inline on the section card or in a separate panel?
- Do we suggest how to add a citation, or just flag?

---

## 10. Export with Track Changes

**The idea:**
Export the reviewed document as a `.docx` file with all accepted corrections marked as track changes — additions, deletions, and replacements visible in Word's standard format.

**Why it's valuable:**
Most professional document workflows end in Word. A user who proofreads here and then shares with a colleague needs the corrections to be visible and reviewable in the format their colleague expects. This closes the loop between the app and the real-world workflow.

**Key decisions to resolve:**
- Do we mark all accepted corrections as track changes, or only the ones the user explicitly accepted?
- Do we include the humanized or reformatted text as a track change, or only grammar/clarity corrections?
- Library: `python-docx` (server-side) vs a JS docx library on the backend?

---

## Priority Thinking

**Cheapest to build, highest signal:**
Readability Score (idea 8) — no GPT call, fast, immediately useful badge in the UI.

**Highest user value, clear scope:**
Independent Reviewer (idea 1) + Tone & Audience Check (idea 5) — answers the "is this document actually good?" question that proofreading alone doesn't.

**Best product loop:**
Document Completeness Score (idea 6) + Structured Insertion (idea 3) — gap detection feeds directly into gap fixing. One feature makes the other useful.

**Strongest retention / shareability:**
Export with Track Changes (idea 10) — brings external collaborators into contact with the product.

**Most complex:**
Document Q&A Chat (idea 2) — needs streaming, chat history persistence, and a good UX that doesn't clutter the review page.
