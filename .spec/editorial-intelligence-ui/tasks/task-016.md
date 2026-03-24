---
task: 016
feature: editorial-intelligence-ui
status: pending
depends_on: [015]
---

# Task 016: Full Verification Pass

## Session Bootstrap
> Load these before reading anything else.

Skills: /code-writing-software-development
Commands: /verify, /task-handoff

---

## Objective
Run the complete verification pipeline on both frontend and backend. Fix any type errors, lint warnings, or runtime issues discovered. Smoke-test all user-facing flows end-to-end. Update `bug-log.md` for any bugs found. This is the final gate before the feature is complete.

---

## Codebase Context

### Key Code Snippets

```json
// frontend/package.json — scripts
{
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  }
}
```

```json
// backend/package.json — scripts
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  }
}
```

```markdown
<!-- bug-log.md format (from CLAUDE.md) -->
## [YYYY-MM-DD] Short title
- **What broke:** one line description
- **Root cause:** what caused it
- **Fix applied:** what was changed
- **Affected file(s):** path(s)
```

### Key Patterns in Use
- **Self-Check (from CLAUDE.md):** Before marking done — does output match acceptance criteria? Any hardcoded values that should be env vars? New files not in File Layout? Anything broken upstream/downstream? Is bug-log.md current?
- **Smoke test flows:** Login → Dashboard → Upload → Editor → suggest accept → Insights → Profile → logout.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/styles.css` (responsive fixes)
**Decisions made:** All pages mobile-responsive. No horizontal scroll.
**Context for this task:** Full implementation complete. Run final verification.
**Open questions left:** _(none)_

---

## Implementation Steps

1. **Frontend typecheck:**
   ```
   cd frontend && npm run typecheck
   ```
   Fix all errors before proceeding to next step.

2. **Frontend lint:**
   ```
   cd frontend && npm run lint
   ```
   Fix all warnings and errors.

3. **Backend typecheck:**
   ```
   cd backend && npm run typecheck
   ```
   Fix all errors.

4. **Backend lint:**
   ```
   cd backend && npm run lint
   ```
   Fix all warnings and errors.

5. **Smoke test — start both servers:**
   ```
   # Terminal 1:
   cd backend && npm run dev
   # Terminal 2:
   cd frontend && npm run dev
   ```

6. **Flow 1 — Login:**
   - Visit `http://localhost:5173/`
   - Expect redirect to `/login`
   - Sign in with valid credentials
   - Expect redirect to `/dashboard`

7. **Flow 2 — Dashboard + Upload:**
   - Dashboard shows SMART TIPS and Secure Architecture cards
   - Recent documents load (or empty state shown)
   - Select a file, pick document type, click "Analyze Document"
   - Progress bar shows, then redirect to `/editor/:sessionId`

8. **Flow 3 — Editor:**
   - Session filename shown in toolbar
   - Sections render (or loading state if proofreading)
   - SuggestionPanel visible on desktop
   - Accept a suggestion → card disappears from panel
   - Click "Match References" → no error
   - Click "Export PDF" → modal opens → Download works
   - Click "Insights" button → navigates to Insights page

9. **Flow 4 — Insights:**
   - All 5 metric cards render with data
   - ProgressBars animate on load
   - Sentiment bar chart shows columns
   - "Back to Editor" button works

10. **Flow 5 — Profile:**
    - Avatar and name/email render
    - Edit name field, click Save → "Saved!" appears
    - Language dropdown change, save → persists on page reload
    - Circular progress renders

11. **Flow 6 — Navigation:**
    - Desktop sidebar nav active states update on each page
    - Mobile bottom nav items navigate correctly
    - Logout button signs out and redirects to `/login`
    - Visiting `/review?sessionId=X` redirects to `/editor/X`

12. **Existing features preserved check:**
    - Section accept/reject still works
    - Section edit (inline text change) still works
    - AI instruction still works
    - Section split still works
    - Section merge still works
    - Add section still works

13. **For each bug found** during smoke test:
    - Fix the bug
    - Append entry to `bug-log.md`

14. **Final typecheck after fixes:**
    ```
    cd frontend && npm run typecheck
    cd backend && npm run typecheck
    ```
    Both must exit with code 0.

_Requirements: 11.1–11.6 (preservation check), all other requirements (end-to-end validation)_
_Skills: /code-writing-software-development — verification_

---

## Acceptance Criteria
- [ ] `npm run typecheck` exits 0 in `frontend/`.
- [ ] `npm run typecheck` exits 0 in `backend/`.
- [ ] `npm run lint` exits 0 (or only pre-existing warnings) in both.
- [ ] Login flow: sign in → `/dashboard`.
- [ ] Upload flow: file → progress → `/editor/:sessionId`.
- [ ] Editor: all section operations work (accept, reject, edit, instruct, split, merge, add).
- [ ] SuggestionPanel: accept removes card.
- [ ] Export PDF: download triggers correctly.
- [ ] Insights page: all 5 cards render with real data.
- [ ] Profile: save updates user metadata.
- [ ] Navigation: sidebar (desktop) and bottom nav (mobile) work.
- [ ] Logout: redirects to `/login`.
- [ ] Legacy `/review?sessionId=X` redirects to `/editor/X`.
- [ ] `bug-log.md` updated for any bugs found and fixed.
- [ ] All Self-Check items from CLAUDE.md pass.

---

## Handoff to Next Task
> This is the final task — no further handoff needed.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** Feature complete. All verification passed.
**Context for next task:** N/A — feature complete.
**Open questions:** _(none)_
