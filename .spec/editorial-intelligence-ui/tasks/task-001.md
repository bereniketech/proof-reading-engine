---
task: 001
feature: editorial-intelligence-ui
status: pending
depends_on: []
---

# Task 001: Install react-router-dom and Update index.html

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app
Commands: /verify, /task-handoff

---

## Objective
Install `react-router-dom` as the client-side router and update `frontend/index.html` to load the Syntactic Prism fonts (Manrope + Inter) and Material Symbols icon font from Google. No logic changes — purely dependency and HTML head setup.

---

## Codebase Context

### Key Code Snippets

```html
<!-- frontend/index.html:1-12 — current state, full file -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Proof Reading Engine</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```json
// frontend/package.json — current dependencies (no router present)
{
  "dependencies": {
    "@supabase/supabase-js": "^2.99.1",
    "react": "^19.1.1",
    "react-dom": "^19.1.1"
  }
}
```

### Key Patterns in Use
- **Package manager:** `npm` (not bun). Run `npm install` from inside `frontend/`.
- **Vite build:** `frontend/src/main.tsx` is the entry point — no changes needed there for this task.

---

## Handoff from Previous Task
> Empty — this is task-001.

**Files changed by previous task:** _(none)_
**Decisions made:** _(none)_
**Context for this task:** _(none)_
**Open questions left:** _(none)_

---

## Implementation Steps

1. From `frontend/` directory, run: `npm install react-router-dom`
2. Confirm `react-router-dom` appears in `frontend/package.json` under `dependencies`.
3. Open `frontend/index.html`. Replace the `<title>` with `AI Curator — Editorial Intelligence`.
4. Add the following `<link>` tags inside `<head>`, before the closing `</head>`:

```html
<!-- Google Fonts: Manrope + Inter -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
<!-- Material Symbols Outlined -->
<link
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
  rel="stylesheet"
/>
```

5. Run `/verify` (or `npm run typecheck && npm run lint` from `frontend/`) — must pass with 0 errors.

_Requirements: 1.1, 2.1_
_Skills: /build-website-web-app — dependency setup, HTML head_

---

## Acceptance Criteria
- [ ] `react-router-dom` is listed in `frontend/package.json` dependencies.
- [ ] `frontend/index.html` title reads "AI Curator — Editorial Intelligence".
- [ ] Manrope and Inter font links are present in `<head>`.
- [ ] Material Symbols Outlined font link is present in `<head>`.
- [ ] `npm run typecheck` exits with code 0 in `frontend/`.
- [ ] All existing tests pass.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
