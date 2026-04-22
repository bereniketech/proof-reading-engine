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
