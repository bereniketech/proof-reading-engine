---
task: 002
feature: editorial-intelligence-ui
status: pending
depends_on: [001]
---

# Task 002: Replace CSS Design Tokens with Syntactic Prism Palette

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app
Commands: /verify, /task-handoff

---

## Objective
Replace the current blue-centric CSS variables in `frontend/src/styles.css` with the Syntactic Prism palette (indigo/emerald/slate). Add utility classes for glassmorphism, editorial gradient, and surface hierarchy. Keep all existing layout/component classes intact — only replace design token values and typography.

---

## Codebase Context

### Key Code Snippets

```css
/* frontend/src/styles.css:1-77 — current :root tokens to replace */
:root {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;

  --color-background: #ffffff;
  --color-background-subtle: #f4f8ff;
  --color-background-wash: #fbfdff;
  --color-foreground: #1c2534;
  --color-primary: #235ea8;
  --color-primary-dark: #1a4d8c;
  --color-primary-foreground: #ffffff;
  --color-primary-muted: #3566ad;
  --color-primary-subtle: #e8f0fe;
  --color-link: #214c88;
  --color-muted-foreground: #6b839e;
  --color-border: #c9dbf7;
  --color-border-soft: #dce9f9;
  --color-border-input: #b8cff2;
  --color-border-focus: #2f6ebe;
  --color-card: #ffffff;
  --color-surface-hover: #f0f6ff;
  --color-surface-blue: #edf5ff;
  --color-surface-blue-hover: #e3efff;
  --color-destructive: #9a2130;
  --color-destructive-foreground: #ffe9ea;
  --color-destructive-border: #f4c3c9;
  --color-success: #1f6847;
  --color-success-foreground: #dbf1e6;
  --color-success-border: #a8d9c0;
  /* ... radius, font-size, duration tokens remain unchanged ... */
}
```

```css
/* frontend/src/styles.css:56-73 — radius/font/duration tokens to KEEP unchanged */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.625rem;
  --radius-xl: 0.75rem;
  --radius-card: 1rem;
  --radius-full: 999px;

  --font-size-xs: 0.75rem;
  --font-size-sm: 0.825rem;
  --font-size-base: 0.9rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.05rem;

  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 750ms;

  --touch-target: 2.75rem;
```

```css
/* frontend/src/styles.css:76 — old radial background to replace */
  background: radial-gradient(circle at 20% 20%, #e9f2ff, #f8fbff 45%, #ffffff 100%);
```

### Key Patterns in Use
- **No Tailwind** — all styling is via plain CSS classes. Do not introduce Tailwind.
- **All existing class names** (`.app-shell`, `.hero-card`, `.dropzone`, `.primary-button`, `.badge-*`, etc.) must remain — only the token values change.
- **Dark mode block** (`.dark { ... }`) at line 79 must also be updated to match the new palette.

---

## Handoff from Previous Task
> Empty until task-001 completes.

**Files changed by previous task:** `frontend/index.html`, `frontend/package.json`
**Decisions made:** react-router-dom installed; fonts linked.
**Context for this task:** Fonts now available — use `'Manrope'` and `'Inter'` in CSS.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Open `frontend/src/styles.css`.
2. In `:root`, replace the `font-family` line with:
   ```css
   font-family: 'Inter', system-ui, sans-serif;
   ```
3. Add a separate utility class after `:root`:
   ```css
   .font-display { font-family: 'Manrope', sans-serif; }
   ```
4. Replace the `:root` color tokens with the Syntactic Prism palette:
   ```css
   /* Syntactic Prism — Primary (Indigo) */
   --color-primary: #3a388b;
   --color-primary-container: #5250a4;
   --color-primary-foreground: #ffffff;
   --color-on-primary: #ffffff;

   /* Secondary (Slate) */
   --color-secondary: #515f74;
   --color-secondary-container: #d5e4f7;
   --color-on-secondary: #ffffff;

   /* Tertiary (Emerald) */
   --color-tertiary: #004e33;
   --color-tertiary-fixed: #6ffbbe;
   --color-tertiary-fixed-dim: #4edea3;
   --color-on-tertiary-fixed: #002114;

   /* Surface hierarchy */
   --color-surface: #faf8ff;
   --color-surface-container-lowest: #ffffff;
   --color-surface-container-low: #f2f3ff;
   --color-surface-container: #ebebf9;
   --color-surface-container-high: #e5e4f3;
   --color-surface-container-highest: #dae2fd;

   /* On-surface */
   --color-on-surface: #1a1b2e;
   --color-on-surface-variant: #45464f;
   --color-outline: #767680;
   --color-outline-variant: #c5c6d0;

   /* Error */
   --color-error: #ba1a1a;
   --color-error-container: #ffdad6;
   --color-on-error: #ffffff;

   /* Legacy aliases (keep for existing components) */
   --color-background: var(--color-surface);
   --color-background-subtle: var(--color-surface-container-low);
   --color-background-wash: var(--color-surface-container-lowest);
   --color-foreground: var(--color-on-surface);
   --color-primary-dark: #2f2d72;
   --color-primary-muted: #5250a4;
   --color-primary-subtle: var(--color-surface-container-highest);
   --color-link: #3a388b;
   --color-muted-foreground: var(--color-on-surface-variant);
   --color-border: var(--color-outline-variant);
   --color-border-soft: var(--color-surface-container-high);
   --color-border-input: var(--color-outline);
   --color-border-focus: var(--color-primary);
   --color-card: var(--color-surface-container-lowest);
   --color-surface-hover: var(--color-surface-container);
   --color-surface-blue: var(--color-surface-container-low);
   --color-surface-blue-hover: var(--color-surface-container);
   --color-destructive: var(--color-error);
   --color-destructive-foreground: var(--color-error-container);
   --color-destructive-border: #ffb4ab;
   --color-success: #1f6847;
   --color-success-foreground: #d9f5e5;
   --color-success-border: #a8d9c0;
   --color-info-background: var(--color-surface-container-low);
   --color-info-text: var(--color-primary);
   --color-info-border: var(--color-outline-variant);
   --color-progress-track: var(--color-surface-container-highest);
   --color-progress-fill-start: var(--color-primary);
   --color-progress-fill-end: var(--color-primary-container);
   --color-diff-added: rgba(0, 78, 51, 0.15);
   --color-diff-removed: rgba(186, 26, 26, 0.12);
   --color-badge-pending-bg: var(--color-surface-container-highest);
   --color-badge-pending-fg: var(--color-on-surface-variant);
   --color-badge-ready-bg: var(--color-surface-container-high);
   --color-badge-ready-fg: var(--color-primary);
   --color-badge-accepted-bg: rgba(111, 251, 190, 0.25);
   --color-badge-accepted-fg: var(--color-tertiary);
   --color-badge-rejected-bg: var(--color-error-container);
   --color-badge-rejected-fg: var(--color-error);
   --color-warning: #f59e0b;
   --color-file-meta-bg: rgba(82, 80, 164, 0.1);
   --color-file-meta-border: rgba(82, 80, 164, 0.25);
   --color-merge-border: var(--color-outline-variant);
   --color-merge-text: var(--color-primary);
   --color-merge-bg-hover: var(--color-surface-container);
   --color-dropzone-border: var(--color-outline-variant);
   --color-dropzone-bg-start: var(--color-surface-container-low);
   --color-dropzone-bg-end: var(--color-surface-container);
   --color-spinner-border: rgba(255, 255, 255, 0.4);
   ```
5. Replace the `background:` line in `:root` with:
   ```css
   background: var(--color-surface);
   color: var(--color-on-surface);
   ```
6. Update the `.dark` block color tokens to use dark-appropriate values (keep the block, update primary to `#9d9bff`, surface to `#131320`, etc.).
7. Add new utility classes at the end of the file (before or after existing utilities):
   ```css
   /* Syntactic Prism utilities */
   .gradient-editorial {
     background: linear-gradient(135deg, var(--color-primary), var(--color-primary-container));
   }
   .glass {
     background: rgba(250, 248, 255, 0.8);
     backdrop-filter: blur(12px);
     -webkit-backdrop-filter: blur(12px);
   }
   .surface-lowest { background: var(--color-surface-container-lowest); }
   .surface-low    { background: var(--color-surface-container-low); }
   .surface-high   { background: var(--color-surface-container-high); }
   .surface-highest { background: var(--color-surface-container-highest); }
   ```
8. Update `.hero-card` and `.app-shell` background references if they hardcode colors — point them to token vars instead.
9. Run `npm run typecheck && npm run lint` from `frontend/` — must pass.
10. Visually verify the existing upload page still renders without layout breakage (open in browser).

_Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
_Skills: /build-website-web-app — design tokens, CSS variables_

---

## Acceptance Criteria
- [ ] `--color-primary` resolves to `#3a388b` in browser DevTools.
- [ ] `--color-tertiary-fixed` resolves to `#6ffbbe`.
- [ ] `--color-surface` resolves to `#faf8ff`.
- [ ] `.gradient-editorial` class produces an indigo gradient when applied.
- [ ] `.glass` class produces a blur effect when applied over content.
- [ ] All existing component classes (`.hero-card`, `.dropzone`, `.badge-*`, `.primary-button`) still render without visual breakage.
- [ ] `npm run typecheck` exits 0 in `frontend/`.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
