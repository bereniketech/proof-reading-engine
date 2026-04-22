# Task 001: UI & Functionality Bug Fix Pass

## Skills
- .kit/skills/core/karpathy-principles/SKILL.md
- .kit/skills/frameworks-frontend/react-best-practices/SKILL.md
- .kit/skills/frameworks-frontend/react-ui-patterns/SKILL.md
- .kit/skills/ui-design/ui-ux-pro-max/SKILL.md
- .kit/skills/ui-design/design-system/SKILL.md

## Agents
- @ui-design-expert (layout/design decisions)
- @web-frontend-expert (React component fixes)
- @security-reviewer (auth/input boundaries — Forgot Password flow)

## Commands
- /verify (after each fix group)
- /code-review (before marking done)

## Acceptance Criteria
All Critical and Major issues from the 2026-04-22 audit resolved:

**Critical:**
- [ ] C1: EditorPage.tsx:73 — fix height calc to `calc(100vh - 3.75rem)`
- [ ] C2: EditorPage.tsx:25 — expose showSuggestions setter; SuggestionPanel dismissible on 768–1279px

**Major:**
- [ ] M1: TopNav.tsx:70–84 — wire Notifications + Settings onClick handlers
- [ ] M2: LoginPage.tsx:213 — implement Forgot Password flow (or route to reset page)
- [ ] M3: ProfilePage.tsx:68 — replace plain text loading with skeleton component
- [ ] M4: DocumentCard.tsx:55 — replace window.confirm/alert with modal dialog
- [ ] M5: DocumentCard.tsx — make Delete button visible on touch (not hover-only)
- [ ] M6: AppShell.tsx:71 — remove inline paddingBottom: '6rem', fix via CSS only

**Minor:**
- [ ] m1: Sidebar.tsx:101 — correct app name to "Editorial Intelligence"
- [ ] m5: BottomNav.tsx:82 — raise label font to minimum 12px (0.75rem)
- [ ] m9: App.tsx:49 — add document.title updates per route + 404 catch-all route

**Stubbed functionality:**
- [ ] ProfilePage.tsx:72 — derive Precision Score from real user data (not hardcoded 87)
- [ ] EditorPage.tsx — wire PDF Export button to backend export.ts:83 endpoint
- [ ] Billing/Support/Documentation buttons — implement or visibly disable with "Coming soon"

## Steps
1. Fix C1 and C2 first (critical path — editor is unusable otherwise)
2. Fix M1–M6 as a group (dead UI elements)
3. Fix minor issues m1, m5, m9
4. Wire PDF Export button
5. Fix hardcoded Precision Score
6. Handle billing/support stubs
7. Run /verify after each group
8. Run /code-review before marking done
9. Log each bug fix in bug-log.md

---

## Handoff — What Was Done

- Fixed all Critical + Major + Minor issues from the 2026-04-22 audit: height calc, SuggestionPanel toggle, TopNav handlers, Forgot Password flow (with `/reset-password` route + `ResetPasswordPage`), ProfilePage skeleton loader, DocumentCard modal dialog replacing `window.confirm/alert`, touch-visible delete button, AppShell CSS padding, Sidebar name, BottomNav font, `document.title` per route, 404 catch-all.
- Precision Score now fetched live from `/api/sessions` → `/api/insights/:id` with AbortController unmount guard; falls back to a neutral "—" placeholder (not hardcoded 87); Billing/Support/Documentation stubs visibly disabled with "(Coming soon)" label.
- Code review HIGH issues resolved post-review: `redirectTo` points to `/reset-password`, tablet panel toggle CSS conflict fixed (`hidden` class), TopNav notification dropdown uses outside-click dismiss + correct ARIA role, AbortController added to async precision score fetch.

## Handoff — Patterns Learned

- **CSS vs inline style ownership**: never set `display: none` inline when a CSS media query is supposed to override it — let CSS own visibility entirely; use className modifier classes (`.show`, `.hidden`) as the single source of truth.
- **Supabase password reset**: `resetPasswordForEmail` `redirectTo` must point to a page that reads the `#access_token=...&type=recovery` hash and calls `supabase.auth.updateUser({ password })` — landing on `/login` silently discards the token.
- **AbortController pattern for sequential fetches**: whenever a `useEffect` makes chained fetch calls, wrap in an AbortController and return `() => controller.abort()` from the effect cleanup to avoid state updates on unmounted components.
- **Touch device hover**: `@media (hover: none)` targets touch devices accurately for making hover-only UI elements always visible.

## Handoff — Files Changed

- `frontend/src/pages/EditorPage.tsx` — C1 height, C2 toggle
- `frontend/src/components/layout/TopNav.tsx` — M1 Notifications/Settings handlers
- `frontend/src/pages/LoginPage.tsx` — M2 Forgot Password
- `frontend/src/pages/ResetPasswordPage.tsx` — NEW: password reset handler page
- `frontend/src/pages/ProfilePage.tsx` — M3 skeleton, Precision Score live fetch, stubs disabled
- `frontend/src/components/DocumentCard.tsx` — M4 modal, M5 touch delete
- `frontend/src/components/layout/AppShell.tsx` — M6 inline padding removed
- `frontend/src/components/layout/Sidebar.tsx` — m1 app name
- `frontend/src/components/layout/BottomNav.tsx` — m5 font size
- `frontend/src/App.tsx` — m9 document.title, 404 catch-all, /reset-password route
- `frontend/src/styles.css` — skeleton shimmer, touch delete, tablet toggle, app-main padding
- `frontend/src/ReviewPage.tsx` — pre-existing lint fix (no-useless-escape)
- `backend/src/parsers/pdf.ts` — pre-existing lint fix
- `backend/src/services/export.ts` — pre-existing lint fix
- `bug-log.md` — full audit log entry for 2026-04-22

## Status
COMPLETE
