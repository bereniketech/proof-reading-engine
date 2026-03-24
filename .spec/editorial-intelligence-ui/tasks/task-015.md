---
task: 015
feature: editorial-intelligence-ui
status: pending
depends_on: [014]
---

# Task 015: Mobile Responsiveness Polish

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app
Commands: /verify, /task-handoff

---

## Objective
Audit all pages at 375px and 768px viewport widths. Fix any horizontal scroll, layout overflow, or visibility issues. Ensure bottom nav has iOS safe area padding, BottomNav is hidden on desktop, TopNav hamburger is hidden on desktop, and mobile toggle for SuggestionPanel works. No new features — only responsive fixes.

---

## Codebase Context

### Key Code Snippets

```css
/* frontend/src/styles.css — responsive rules added across tasks (verify these exist) */

/* From task-005: AppShell */
.desktop-sidebar { display: none; }
.mobile-bottom-nav { display: block; }
.topnav-hamburger { display: flex !important; }
@media (min-width: 768px) {
  .desktop-sidebar { display: block; }
  .mobile-bottom-nav { display: none; }
  .topnav-hamburger { display: none !important; }
  .main-content { margin-left: 16rem; }
}
.bottom-nav { display: flex; }
@media (min-width: 768px) { .bottom-nav { display: none; } }

/* From task-008: Dashboard bento */
.dashboard-bento { grid-template-columns: 1fr; }
@media (min-width: 768px) { .dashboard-bento { grid-template-columns: 7fr 5fr; } }

/* From task-010: Editor suggestion panel */
.suggestion-panel-wrapper { display: none; }
@media (min-width: 768px) { .suggestion-panel-wrapper { display: flex; } }
.suggestion-panel-wrapper.show { display: flex; }

/* From task-012: Insights bento */
.insights-bento { grid-template-columns: 1fr; }
@media (min-width: 768px) { .insights-bento { grid-template-columns: repeat(12, 1fr); } }
.insights-col-8 { grid-column: span 1; }
.insights-col-4 { grid-column: span 1; }
@media (min-width: 768px) {
  .insights-col-8 { grid-column: span 8; }
  .insights-col-4 { grid-column: span 4; }
}

/* From task-014: Profile grid */
.profile-grid { grid-template-columns: 1fr; }
@media (min-width: 768px) { .profile-grid { grid-template-columns: repeat(12, 1fr); } }
```

```typescript
// frontend/src/components/layout/BottomNav.tsx — safe area padding (verify)
// paddingBottom: 'env(safe-area-inset-bottom)'
```

### Key Patterns in Use
- **Check for overflow** using browser DevTools → responsive mode → 375px width.
- **Common issues:** Fixed-width elements, `min-width` without `max-width`, overflow-x from wide tables or pre-formatted text.
- **BottomNav safe area:** Must include `padding-bottom: env(safe-area-inset-bottom)` for iOS.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/pages/ProfilePage.tsx`, `frontend/src/components/CircularProgress.tsx`, `frontend/src/styles.css`
**Decisions made:** All pages implemented. Profile save works.
**Context for this task:** Full feature set implemented. Final responsive polish pass.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Open the app in a browser. Use DevTools responsive mode at **375px width**.

2. **Dashboard check:**
   - Upload bento and guidance bento should be stacked (single column). Fix if not.
   - Document cards grid should use `auto-fill` with min `180px` (check `minmax` value).
   - Upload zone should not overflow horizontally.

3. **Editor check:**
   - `SuggestionPanel` must be hidden. "Toggle Suggestions" button (`mobile-only` class) must be visible.
   - Toolbar buttons should wrap cleanly — add `flex-wrap: wrap` if missing.
   - ReviewPage sections should not overflow — confirm `word-break: break-word` or `overflow-wrap: break-word` on section text.

4. **Insights check:**
   - All metric cards should stack to single column.
   - Sentiment bar chart should scale within card width.

5. **Profile check:**
   - All grid cards should stack single column.
   - Name/Title fields and Language dropdowns should be full width.
   - CircularProgress should center correctly.

6. **Login check:**
   - Card should be max-width 440px, padding reduced on very small screens.
   - Decorative accent card should not overlap main card.

7. **All pages:**
   - `body` should have `overflow-x: hidden` to prevent horizontal scroll.
   - Main content area (`.main-content`) on mobile should have no left margin (sidebar is hidden).
   - `BottomNav` height (~3.5rem) should not overlap page content — add `padding-bottom: 4rem` to main content on mobile.

8. Add any missing CSS fixes to `styles.css`. Example fixes:

```css
/* Global mobile fixes (add to styles.css) */
body { overflow-x: hidden; }

/* Bottom nav spacing on mobile */
@media (max-width: 767px) {
  .main-content main { padding-bottom: 4.5rem; }
}

/* Prevent text overflow in sections */
.section-text { overflow-wrap: break-word; word-break: break-word; }

/* Toolbar wrap on narrow screens */
.editor-toolbar { flex-wrap: wrap; gap: 0.5rem; }

/* Login accent card — hide on very small screens */
@media (max-width: 480px) {
  .login-accent-card { display: none; }
}
```

9. Run `npm run typecheck` — must pass.

_Requirements: 2.1, 2.2_
_Skills: /build-website-web-app — responsive design, mobile layout_

---

## Acceptance Criteria
- [ ] No horizontal scroll at 375px on any page.
- [ ] `BottomNav` visible on mobile; `Sidebar` visible on desktop; never both at once.
- [ ] Editor `SuggestionPanel` hidden on mobile; toggle button visible.
- [ ] Dashboard bento stacks to single column on mobile.
- [ ] Insights cards stack to single column on mobile.
- [ ] Profile cards stack to single column on mobile.
- [ ] `BottomNav` has `padding-bottom: env(safe-area-inset-bottom)`.
- [ ] Main content has sufficient bottom padding on mobile so bottom nav doesn't overlap.
- [ ] `npm run typecheck` exits 0.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
