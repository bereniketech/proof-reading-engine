## [2026-04-22] UI & Functionality Bug Fix Pass (task-001)

### C1 — EditorPage height calc incorrect
- **What broke:** Editor layout overflowed because height was `calc(100vh - 3.5rem)` while TopNav is `minHeight: 3.75rem`.
- **Root cause:** Off-by-one on the TopNav height offset.
- **Fix applied:** Changed to `calc(100vh - 3.75rem)`.
- **Affected file(s):** frontend/src/pages/EditorPage.tsx

### C2 — SuggestionPanel not dismissible on tablet
- **What broke:** `showSuggestions` had no setter, so the panel could not be toggled on 768–1279px screens.
- **Root cause:** State was declared with `const [showSuggestions] = useState(true)` — setter omitted.
- **Fix applied:** Exposed `setShowSuggestions`; added a floating toggle button visible only on tablet via `@media (min-width: 768px) and (max-width: 1279px)` CSS.
- **Affected file(s):** frontend/src/pages/EditorPage.tsx, frontend/src/styles.css

### M1 — TopNav Notifications & Settings buttons had no handlers
- **What broke:** Clicking Notifications and Settings did nothing.
- **Root cause:** onClick props were absent from both buttons.
- **Fix applied:** Notifications opens an inline dropdown panel (no-notifications state); Settings navigates to `/profile`.
- **Affected file(s):** frontend/src/components/layout/TopNav.tsx

### M2 — Forgot Password flow not implemented
- **What broke:** "Forgot?" button in LoginPage was a no-op.
- **Root cause:** No handler and no `forgot` auth mode existed.
- **Fix applied:** Added `forgot` mode; calls `supabase.auth.resetPasswordForEmail`; hides Google SSO and password field; shows confirmation info message.
- **Affected file(s):** frontend/src/pages/LoginPage.tsx

### M3 — ProfilePage loading state was plain text
- **What broke:** Loading state showed bare text "Loading profile…" with no skeleton.
- **Root cause:** No skeleton component used.
- **Fix applied:** Replaced with structured skeleton layout using `.skeleton` shimmer class.
- **Affected file(s):** frontend/src/pages/ProfilePage.tsx, frontend/src/styles.css

### M4 — DocumentCard used window.confirm/alert
- **What broke:** Delete confirmation and error used native browser dialogs (blocked in some contexts, no styling).
- **Root cause:** `window.confirm` / `window.alert` called directly.
- **Fix applied:** Replaced with `DeleteModal` dialog component with Cancel/Delete buttons and inline error display.
- **Affected file(s):** frontend/src/components/DocumentCard.tsx

### M5 — Delete button hover-only (not visible on touch)
- **What broke:** Delete button opacity was 0 and only revealed on `mouseEnter` — invisible on touch devices.
- **Root cause:** CSS hover reveal pattern without touch fallback.
- **Fix applied:** Added `@media (hover: none) { .document-card .delete-btn { opacity: 1 } }` to always show on touch.
- **Affected file(s):** frontend/src/components/DocumentCard.tsx, frontend/src/styles.css

### M6 — AppShell inline paddingBottom: '6rem'
- **What broke:** Bottom padding was hardcoded inline on `<main>`, applying 6rem on all viewports including desktop.
- **Root cause:** Inline style not conditioned on breakpoint.
- **Fix applied:** Removed inline `paddingBottom`, added `.app-main` CSS class with `@media (max-width: 767px)` rule.
- **Affected file(s):** frontend/src/components/layout/AppShell.tsx, frontend/src/styles.css

### m1 — Sidebar app name was "AI Curator"
- **What broke:** Sidebar logo area displayed "AI Curator" instead of the correct product name.
- **Root cause:** Stale copy left from an earlier name.
- **Fix applied:** Changed to "Editorial Intelligence".
- **Affected file(s):** frontend/src/components/layout/Sidebar.tsx

### m5 — BottomNav label font below 12px minimum
- **What broke:** Label font was `0.65rem` (~10.4px), below the 12px accessibility minimum.
- **Root cause:** Low font size set directly on button style.
- **Fix applied:** Raised to `0.75rem` (12px).
- **Affected file(s):** frontend/src/components/layout/BottomNav.tsx

### m9 — No document.title updates or 404 route
- **What broke:** Browser tab always showed default title; unknown URLs had no catch-all.
- **Root cause:** No `useEffect` for title updates; no `*` route defined.
- **Fix applied:** Added `PageTitle` component using `useLocation` + `useEffect`; added 404 catch-all inside the authenticated shell and an unauthenticated `*` redirect to `/login`.
- **Affected file(s):** frontend/src/App.tsx

### Stubbed — Precision Score derived from real data
- **What broke:** Precision Score on ProfilePage was hardcoded to 87.
- **Root cause:** Placeholder value, no API fetch.
- **Fix applied:** Fetches user's latest complete session then calls `/api/insights/:id` to get `quality_score`; falls back to 0 with "No completed sessions yet" label.
- **Affected file(s):** frontend/src/pages/ProfilePage.tsx

### Stubbed — Billing/Support/Documentation buttons visibly disabled
- **What broke:** Manage Billing, Change Plan, Open Ticket, Documentation buttons were clickable stubs.
- **Root cause:** No implementation or disabled state.
- **Fix applied:** Set `disabled` and added "(Coming soon)" label with reduced opacity.
- **Affected file(s):** frontend/src/pages/ProfilePage.tsx

## [2026-03-19] Likert-scale items incorrectly split as headings in PDF parser
- **What broke:** In the Maternal Fatigue sample PDF, the MFS-ASD section's 5-point Likert scale items (`1 – Strongly Disagree`, `2 – Disagree`, etc.) were each split out as separate heading sections instead of remaining part of their parent paragraph.
- **Root cause:** `isLikelyHeading` in `pdf.ts` used the regex `/^\d+(\.\d+)*\s+[^\s].{0,90}$/` which matches any line beginning with a digit, whitespace, and any non-space character — including em-dash list items.
- **Fix applied:** Changed `[^\s]` to `[A-Z]` so only lines whose text (after the number) starts with an uppercase letter are treated as numbered headings.
- **Affected file(s):** backend/src/parsers/pdf.ts

## [2026-03-19] Reference links drifted when sections were reordered
- **What broke:** Adding or merging sections could leave citation links pointing at the wrong reference entries after section positions changed.
- **Root cause:** `reference_text` stores `linked_reference_positions`, so position-based links became stale whenever section insertion or merge resequenced the session.
- **Fix applied:** Added reference-link remapping after section insertions and merges so old linked positions are translated onto the new section order, with merged references redirected to the surviving section.
- **Affected file(s):** backend/src/routes/sections.ts

## [2026-03-19] AI instruction timed out on large reference sections
- **What broke:** Applying an AI instruction like converting a long References section to APA format could fail with `Request was aborted.`
- **Root cause:** Section-instruction requests used the same 20-second hard timeout as normal proofreading and had no retry path, which was too short for longer bibliography edits.
- **Fix applied:** Increased the instruction timeout, added retry handling for retryable failures, and returned a clearer timeout message that suggests splitting oversized reference sections before retrying.
- **Affected file(s):** backend/src/services/openai.ts, backend/src/services/openai.test.ts

## [2026-03-16] Upload route stability and error-safety fixes
- **What broke:** Upload flow could leak temporary files on backend failures, classify client validation errors as server errors, and expose internal error details; health route was unintentionally auth-protected.
- **Root cause:** Missing cleanup on some early-return/failure paths, generic error handling that did not separate upload validation failures, and middleware order putting `/api/health` behind JWT auth.
- **Fix applied:** Added cleanup for all failure paths, introduced upload validation error classification with 400 responses, validated uploaded content signatures (PDF/DOCX) plus TXT binary guard, switched unexpected errors to generic 500 responses, and moved health route registration before JWT middleware.
- **Affected file(s):** backend/src/routes/upload.ts, backend/src/server.ts, backend/src/lib/supabase.ts

## [2026-03-16] Atomic section persistence for upload parsing
- **What broke:** Parsed sections and session status could become inconsistent because writes happened in separate non-transactional steps.
- **Root cause:** `sections` upsert and `sessions.status` update were executed as independent statements in the upload route.
- **Fix applied:** Added `persist_session_sections` SQL function and migrated upload persistence to a single RPC call so section upsert and session status update are atomic.
- **Affected file(s):** backend/src/routes/upload.ts, backend/src/db/migrations/002_persist_session_sections.sql

## [2026-03-17] Stale file selection after failed replacement
- **What broke:** Replacing a previously valid upload with an invalid file kept the old file selected, so upload could submit unintended content.
- **Root cause:** Client-side validation rejected new files without clearing the existing file state for that upload slot.
- **Fix applied:** Cleared the target file state on validation failure and added assertive live-region error announcements for dynamic upload/auth errors.
- **Affected file(s):** frontend/src/App.tsx

## [2026-03-17] Review editor state and mobile navigation regressions
- **What broke:** Review edits could stay stale after pending sections became ready, and section navigation was unavailable on mobile after hiding the sidebar.
- **Root cause:** React state dependency array incomplete in useEffect, and mobile sidebar controlled without outlet state sync.
- **Fix applied:** Corrected useEffect dependency arrays, added dirty-aware draft synchronization from server values, introduced a mobile section select control, improved accessibility labeling for corrected-text textarea, and replaced listbox-like sidebar markup with semantic buttons.
- **Affected file(s):** frontend/src/ReviewPage.tsx, frontend/src/components/SectionCard.tsx, frontend/src/styles.css

## [2026-03-17] PDF export heading text rendering
- **What broke:** Export endpoint heading text was rendered as heading level numbers instead of actual section text.
- **Root cause:** PDF generation logic was setting heading content to heading_level.toString() instead of using the textToUse variable.
- **Fix applied:** Corrected content array population to use textToUse for all section types and fix text reference in PDF drawing loop.
- **Affected file(s):** backend/src/services/export.ts

## [2026-03-17] Frontend strict TypeScript build regression
- **What broke:** Frontend production builds failed on Vercel because strict array indexing in the inline diff builder was not narrowed for `noUncheckedIndexedAccess`, and the frontend package did not declare Node type definitions required by `tsconfig.node.json`.
- **Root cause:** The SectionCard LCS diff logic relied on bounds that TypeScript could not prove under strict indexed access, and `@types/node` was missing from frontend devDependencies.
- **Fix applied:** Added explicit guarded token reads and row access in the diff builder so matrix and token indexing remains type-safe without changing behavior, and added `@types/node` to the frontend devDependencies.
- **Affected file(s):** frontend/src/components/SectionCard.tsx, frontend/package.json

## [2026-03-24] Router shell file was left incomplete
- **What broke:** The frontend router file was missing the `Outlet` import and ended before the `App` component closed, which would break TypeScript compilation while adding the authenticated shell.
- **Root cause:** The router migration from the earlier monolithic app left `frontend/src/App.tsx` in a partially edited state.
- **Fix applied:** Restored the missing router import and completed the `App` component while wiring the new AppShell layout components.
- **Affected file(s):** frontend/src/App.tsx, frontend/src/components/layout/AppShell.tsx, frontend/src/components/layout/Sidebar.tsx, frontend/src/components/layout/TopNav.tsx, frontend/src/components/layout/BottomNav.tsx
