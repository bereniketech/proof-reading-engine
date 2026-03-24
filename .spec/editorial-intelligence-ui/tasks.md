# Implementation Plan: Editorial Intelligence UI

---

- [ ] 1. Install react-router-dom and update index.html
  - Run `npm install react-router-dom` in `frontend/`.
  - Add Google Fonts link tags to `frontend/index.html` for Manrope (weights 400, 600, 700, 800) and Inter (weights 400, 500, 600).
  - Add Material Symbols Outlined icon font link to `frontend/index.html`.
  - Update `<title>` to "AI Curator — Editorial Intelligence".
  - _Requirements: 1.1, 2.1_
  - _Skills: /build-website-web-app (dependency setup, HTML head)_
  - **AC:** `react-router-dom` appears in `frontend/package.json`. Both fonts load in browser DevTools Network tab. Material Symbols icon renders when `<span class="material-symbols-outlined">auto_stories</span>` is placed in HTML.

---

- [ ] 2. Replace CSS design tokens with Syntactic Prism palette
  - Fully replace `frontend/src/styles.css` `:root` variables with Syntactic Prism tokens:
    - `--color-primary: #3a388b`, `--color-primary-container: #5250a4`
    - `--color-secondary: #515f74`
    - `--color-tertiary: #004e33`, `--color-tertiary-fixed: #6ffbbe`, `--color-tertiary-fixed-dim: #4edea3`
    - `--color-surface: #faf8ff`
    - `--color-surface-container-low: #f2f3ff`
    - `--color-surface-container: #ebebf9`
    - `--color-surface-container-high: #e5e4f3`
    - `--color-surface-container-highest: #dae2fd`
    - `--color-surface-container-lowest: #ffffff`
    - `--color-on-surface: #1a1b2e`
    - `--color-on-surface-variant: #45464f`
    - `--color-outline-variant: #c5c6d0`
    - `--color-error: #ba1a1a`, `--color-error-container: #ffdad6`
  - Retain all existing diff, badge, progress, and radius tokens (update where palette dictates).
  - Add utility classes: `.gradient-editorial`, `.glass`, `.surface-lowest`, `.surface-low`, `.surface-high`, `.surface-highest`.
  - Update `font-family` in `:root` to `'Inter', system-ui, sans-serif` and heading font via `.font-display { font-family: 'Manrope', sans-serif; }`.
  - Update `:root` background to `#faf8ff` (surface token).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - _Skills: /build-website-web-app (design tokens, CSS variables)_
  - **AC:** The existing upload page renders without layout breakage. CSS variables resolve to the new palette in DevTools. `.gradient-editorial` shows an indigo gradient. `.glass` shows blur effect.

---

- [ ] 3. Create AuthContext and update main.tsx
  - Create `frontend/src/context/AuthContext.tsx`:
    - Export `AuthContextValue` interface: `{ session, user, loading, signOut }`.
    - Move Supabase `getSession()` + `onAuthStateChange()` logic from current `App.tsx` into `AuthProvider`.
    - Export `useAuth()` hook.
  - Update `frontend/src/main.tsx` to wrap `<App />` with `<AuthProvider>`.
  - _Requirements: 2.4, 2.5_
  - _Skills: /build-website-web-app (React context), /code-writing-software-development (TypeScript interfaces)_
  - **AC:** `useAuth()` returns `{ session: null, loading: false }` when unauthenticated. Auth state updates correctly after login/logout. TypeScript compiles without errors.

---

- [ ] 4. Rewrite App.tsx with React Router routes
  - Replace the current monolithic `App.tsx` with a router-based entry that:
    - Wraps the app in `<BrowserRouter>`.
    - Reads `{ session, loading }` from `useAuth()`.
    - Shows a full-screen loading spinner while `loading === true`.
    - Defines a `<ProtectedRoute>` component that redirects to `/login` when unauthenticated.
    - Defines routes:
      - `/login` → `<LoginPage />`
      - `/` → `<Navigate to="/dashboard" />` (if authed) or `<Navigate to="/login" />` (if not)
      - `/dashboard` → `<ProtectedRoute><AppShell /></ProtectedRoute>` with Dashboard as child
      - `/editor/:sessionId` → `<ProtectedRoute><AppShell /></ProtectedRoute>` with EditorPage as child
      - `/insights/:sessionId` → `<ProtectedRoute><AppShell /></ProtectedRoute>` with InsightsPage as child
      - `/profile` → `<ProtectedRoute><AppShell /></ProtectedRoute>` with ProfilePage as child
      - `/review` → `<LegacyReviewRedirect />` (reads `?sessionId` query param, redirects to `/editor/:sessionId`)
  - _Requirements: 2.4, 2.5, 2.6_
  - _Skills: /build-website-web-app (React Router, route guards)_
  - **AC:** Visiting `/` unauthenticated redirects to `/login`. Visiting `/` authenticated redirects to `/dashboard`. Visiting `/review?sessionId=abc` redirects to `/editor/abc`. TypeScript compiles.

---

- [ ] 5. Build AppShell layout (Sidebar + TopNav + BottomNav)
  - Create `frontend/src/components/layout/Sidebar.tsx`:
    - Brand section: Material Symbol `auto_stories` in 3rem indigo box + "AI Curator" wordmark + "v2.4" version badge.
    - Nav items: Documents (`/dashboard`), Editor (stored last-editor URL or `/dashboard`), Insights (stored last-insights URL or `/dashboard`), Profile (`/profile`).
    - Active detection via `useLocation()`.
    - Active state: `bg-surface-container-highest`, filled icon.
    - Upgrade prompt card at bottom (non-functional, decorative).
    - Width: `w-64`, `bg-surface-container-low`, full height.
  - Create `frontend/src/components/layout/TopNav.tsx`:
    - Left: hamburger (mobile only, toggles sidebar state), brand name.
    - Right: notification icon button, settings icon button, "New Document" gradient button (navigates to `/dashboard`).
    - Sticky top, `bg-surface/80 backdrop-blur-md`.
  - Create `frontend/src/components/layout/BottomNav.tsx`:
    - Four tabs: Documents, Editor, Insights, Profile with icon + label.
    - Active: `text-primary bg-surface-container-highest`.
    - Only visible on mobile (`md:hidden`).
    - Fixed bottom with safe-area padding.
  - Create `frontend/src/components/layout/AppShell.tsx`:
    - Desktop: `<Sidebar />` fixed left + `<main>` flex-1 with `<TopNav />` + `<Outlet />`.
    - Mobile: `<TopNav />` + `<Outlet />` + `<BottomNav />` fixed bottom.
    - Responsive toggle at `md` breakpoint.
  - _Requirements: 2.1, 2.2, 2.3_
  - _Skills: /build-website-web-app (layout, responsive design)_
  - **AC:** On desktop (≥768px): sidebar visible, bottom nav hidden. On mobile (<768px): sidebar hidden, bottom nav visible. Active nav item highlighted on each page. TopNav renders without overlap.

---

- [ ] 6. Build LoginPage
  - Create `frontend/src/pages/LoginPage.tsx`:
    - Centered max-w-[440px] card on `bg-surface` full-screen background.
    - Brand header: `auto_stories` icon in 4rem indigo rounded-xl box.
    - Google button (placeholder `<button>` with Google SVG icon — no OAuth wiring).
    - Divider: "or continue with email".
    - Email field + Password field with focus underline animation (border-bottom transitions to primary color).
    - "Forgot?" link above password field (non-functional stub).
    - "Sign In to Workspace" gradient-editorial primary button.
    - Toggle link: "Don't have an account? Create one" / "Already have one? Sign in".
    - Auth logic: move `handleSubmit` and `handleSignOut` from current `App.tsx` into this page using `useAuth()`.
    - Error and info message display below the form.
    - Decorative floating glassmorphism card bottom-right with `auto_awesome` icon and "AI Insight" text.
    - Redirect to `/dashboard` on successful login (via `useNavigate`).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - _Skills: /build-website-web-app (forms, auth UX)_
  - **AC:** Sign in with valid credentials → redirects to `/dashboard`. Invalid credentials → error message shown. Toggle between login/signup works. Decorative card renders. Gradient button matches design. TypeScript compiles.

---

- [ ] 7. Build DocumentCard and add GET /api/sessions backend endpoint
  - **Backend** — Create `backend/src/routes/sessions-list.ts`:
    - `GET /sessions` handler.
    - Read `user.id` from `res.locals.user`.
    - Accept optional `?page` and `?limit` query params (default: page=1, limit=20).
    - Query Supabase: `SELECT id, filename, file_type, document_type, status, created_at, updated_at FROM sessions WHERE user_id = :userId ORDER BY created_at DESC` with `.range()`.
    - Return `{ success: true, data: { sessions, total, page, limit } }`.
    - Return 401 if user missing (handled by middleware).
  - Register `sessionsListRouter` in `backend/src/server.ts`.
  - **Frontend** — Create `frontend/src/components/DocumentCard.tsx`:
    - Props: `session: SessionListItem`, `onClick: () => void`.
    - Shows: filename (truncated), document type badge, status badge (pending/proofreading/complete with existing badge colors), relative date (`created_at`).
    - Hover: `surface-container-highest` bg + `shadow-sm` lift.
    - Click calls `onClick`.
  - _Requirements: 4.6, 4.7, 4.8, 8.1, 8.2, 8.3, 8.4, 8.5_
  - _Skills: /build-website-web-app (component), /code-writing-software-development (Express route, Supabase query)_
  - **AC:** `GET /api/sessions` with valid JWT returns `{ success: true, data: { sessions: [...] } }`. `DocumentCard` renders all fields. Status badge color matches status value. TypeScript compiles on both backend and frontend.

---

- [ ] 8. Build DashboardPage
  - Create `frontend/src/pages/DashboardPage.tsx`:
    - Page heading: "Documents" (Manrope, text-5xl extrabold) + descriptor subtext.
    - **Upload Bento (7/12 on desktop, full-width mobile):**
      - Document type `<select>` with all 6 types (values from `DOCUMENT_TYPES` constant — same as existing `App.tsx`).
      - Drag-and-drop upload area: `cloud_upload` Material Symbol icon, dashed border, hover highlight.
      - File selection via `<input type="file" accept=".docx,.pdf,.txt">`.
      - "Analyze Document" gradient-editorial button with `arrow_forward` icon.
      - Upload progress bar (same XHR logic as existing `App.tsx` `handleUpload`).
      - Validation error display (wrong type / size > 20MB).
      - On success: `useNavigate()` to `/editor/:sessionId`.
    - **Guidance Bento (5/12 on desktop, full-width mobile):**
      - SMART TIPS card: `surface-container-highest` bg, tertiary-fixed badge "SMART TIPS", 3 bullet tips.
      - Secure Architecture card: glassmorphism, `border-l-4 border-primary`, lock icon.
    - **Recent Documents section below bento:**
      - Fetches `GET /api/sessions` on mount.
      - Renders grid of `<DocumentCard>` components.
      - Loading state: skeleton placeholders.
      - Empty state: "Upload your first document to get started" with upload icon.
      - Card click: `useNavigate('/editor/:sessionId')`.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_
  - _Skills: /build-website-web-app (page, bento grid, drag-drop)_
  - **AC:** Upload flow works end-to-end (file selected → progress bar → redirect to editor). Document cards load from API. Empty state shown when no documents. Guidance bento renders. Mobile layout stacks correctly.

---

- [ ] 9. Build SuggestionPanel component
  - Create `frontend/src/components/SuggestionPanel.tsx`:
    - Props: `sections: SectionRecord[]`, `accessToken: string`, `onSectionAccepted: (id: string) => void`.
    - Derive suggestions: filter sections where `corrected_text && corrected_text !== original_text && status !== 'accepted' && status !== 'rejected'`.
    - Categorize by `change_summary` keyword:
      - "clarity" / "passive" / "unclear" / "verbose" → Clarity (border-primary)
      - "concise" / "filler" / "redundant" / "wordy" → Conciseness (border-error)
      - "tone" / "formal" / "voice" / "register" → Tone (border-secondary)
      - Default (null or no match) → Clarity
    - Panel header: "AI Suggestions" title + `tertiary-container` chip showing count of NEW suggestions.
    - Each suggestion card:
      - Category label (text-[10px] uppercase bold tracking-widest).
      - Truncated original excerpt (max 80 chars, text-muted).
      - Arrow icon + suggestion text from `corrected_text` (max 120 chars).
      - "Accept Suggestion" button (tertiary-fixed bg, `#6ffbbe`).
    - Accept action: `PATCH /api/sections/:id` with `{ status: 'accepted' }` using `accessToken`, then calls `onSectionAccepted(id)`.
    - Empty state: "All suggestions reviewed" with `check_circle` icon.
    - Scrollable panel, `overflow-y-auto`.
    - Bottom metrics strip: readability score + word count (derived from sections text, passed as props or computed internally).
  - _Requirements: 5.3, 5.4, 5.5_
  - _Skills: /build-website-web-app (component), /code-writing-software-development (derivation logic)_
  - **AC:** Sections with `corrected_text !== original_text` and non-terminal status appear as cards. Accept button PATCHes the correct endpoint and removes the card. Categorization is deterministic. Empty state shows when all reviewed. TypeScript compiles.

---

- [ ] 10. Build EditorPage (wrapping ReviewPage)
  - Create `frontend/src/pages/EditorPage.tsx`:
    - Reads `:sessionId` from `useParams()`.
    - Reads `session` (Supabase) from `useAuth()`.
    - Fetches `GET /api/sessions/:id` to load `sessionRecord` and `sections[]` (same logic as current `ReviewPage.tsx`).
    - Renders the full existing `<ReviewPage>` component by lifting its state and section operations up into `EditorPage`, then passes them down. **Alternatively**, render `<ReviewPage sessionId={sessionId} accessToken={accessToken} />` if ReviewPage already accepts these as props — check and adapt without breaking existing logic.
    - Layout: `flex h-full`:
      - Left: `flex-1 overflow-y-auto` — editor canvas with sections.
      - Right: `<SuggestionPanel>` (w-80, hidden on mobile via `hidden md:flex`).
    - Page title: session `filename` displayed in TopNav or as `<h1>` above editor.
    - Toolbar below TopNav:
      - "Match References" button → `POST /api/sessions/:sessionId/match-references`.
      - "Export PDF" button → opens inline modal with reference style `<select>` + confirm button → `POST /api/export/:sessionId`.
      - "Toggle Suggestions" button (mobile only) → shows/hides `SuggestionPanel` in a drawer.
    - Polling: if `sessionRecord.status === 'proofreading'`, poll `GET /api/sessions/:id` every 5s until status changes; clear interval on unmount.
    - Pass `onSectionAccepted` to `SuggestionPanel` to remove accepted sections from its list.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 11.1–11.6_
  - _Skills: /build-website-web-app (page composition), /code-writing-software-development (polling, state management)_
  - **AC:** All existing section operations (accept, reject, edit, instruct, split, merge, add) work identically to current ReviewPage. SuggestionPanel appears on desktop. Match References button triggers correct endpoint. Export modal opens and triggers download. Polling starts when status is "proofreading" and stops when done. TypeScript compiles.

---

- [ ] 11. Build backend Insights endpoint
  - Create `backend/src/routes/insights.ts`:
    - `GET /sessions/:id/insights` handler.
    - Validate `:id` is a valid UUID (reuse `isUuid` pattern from `export.ts`).
    - Fetch session from Supabase; verify `session.user_id === res.locals.user.id` (403 if not).
    - Fetch all sections for the session.
    - Return 422 if sections array is empty.
    - Compute all metrics using pure functions (no async, no AI):
      - `computeQualityScore(sections)` → ratio of accepted+ready to total × 100.
      - `computeGrammarScore(sections)` → ratio of sections with no diff × 100.
      - `computeTone(text)` → authority/confidence/urgency as 0–100 from keyword frequency, normalized to max 100.
      - `computeVocabularyDiversity(words)` → (unique / total) × 20, capped at 10.
      - `computeLexicalDensity(words)` → (contentWords / total) × 100, using 200-word stopword list.
      - `computeSentiment(words)` → positive/neutral/negative as percentages, using ~100-word wordlists each.
      - `computeReadability(text)` → Flesch-Kincaid Reading Ease formula.
    - Return `{ success: true, data: InsightsData }`.
  - Register `insightsRouter` in `backend/src/server.ts`.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  - _Skills: /code-writing-software-development (pure functions, Express route)_
  - **AC:** `GET /api/sessions/:id/insights` returns all 8 fields. Quality score is 0 when all sections are pending, 100 when all accepted. Wrong user gets 403. Empty session gets 422. TypeScript compiles.

---

- [ ] 12. Build InsightsPage
  - Create `frontend/src/pages/InsightsPage.tsx`:
    - Reads `:sessionId` from `useParams()`.
    - Fetches `GET /api/sessions/:id/insights` on mount.
    - Loading state: skeleton placeholders for each card.
    - Error state: "Failed to load insights" banner with retry button.
    - Empty state (422): "Analyze a document first to see insights."
    - Bento grid layout (CSS grid, gap-4):
      - **Performance Card (col-span-8, row-span-2):** "Overall Quality" badge (primary/10), score `text-6xl` bold, `trending_up` tertiary icon, Grammar & Syntax `<ProgressBar>` component.
      - **Tone Analysis Card (col-span-4, row-span-3, glassmorphism):** `psychology` icon, Authority / Confidence / Urgency `<ProgressBar>` components.
      - **Vocabulary Diversity Card (col-span-4):** `menu_book` icon in tertiary circle, score X/10, descriptor text.
      - **Lexical Density Card (col-span-4):** `analytics` icon, percentage, descriptor.
      - **Content Sentiment Card (col-span-8):** bar chart built from `w-2 h-{n}` columns using tertiary/primary/error colors.
    - Page header buttons: "Export PDF" (links to export endpoint) + "Re-analyze" (POST to `/api/upload` with existing session — or navigate to dashboard, acceptable).
    - Create `frontend/src/components/ProgressBar.tsx`: props `{ label, value, color? }`, renders labeled `<div>` with animated fill.
    - Create `frontend/src/components/MetricCard.tsx`: props `{ icon, title, children, className? }`, surface-container-lowest card wrapper.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - _Skills: /build-website-web-app (page, data visualization)_
  - **AC:** All 5 card types render with real data from the API. ProgressBar fills correctly (0–100). Sentiment bar chart shows proportional columns. Loading and error states render. Responsive: cards stack on mobile. TypeScript compiles.

---

- [ ] 13. Build backend Profile endpoint
  - Create `backend/src/routes/profile.ts`:
    - `GET /users/me`:
      - Use `createUserScopedSupabaseClient(res.locals.accessToken)`.
      - Call `supabase.auth.getUser()`.
      - Return `{ success: true, data: { email, name, title, primary_dialect, translation_target, auto_localize } }` from `user.email` + `user.user_metadata`.
    - `PATCH /users/me`:
      - Allowlisted fields: `name`, `title`, `primary_dialect`, `translation_target`, `auto_localize`.
      - Reject unknown fields with 400.
      - Call `supabase.auth.updateUser({ data: { ...allowedFields } })` using user-scoped client.
      - Return updated profile with 200.
  - Register `profileRouter` in `backend/src/server.ts`.
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - _Skills: /code-writing-software-development (Express route, Supabase auth metadata)_
  - **AC:** `GET /api/users/me` returns user email + metadata. `PATCH /api/users/me` with `{ name: "Jane" }` updates and returns the new value. Submitting unknown field returns 400. TypeScript compiles.

---

- [ ] 14. Build ProfilePage
  - Create `frontend/src/components/CircularProgress.tsx`:
    - Props: `{ value: number, size?: number, strokeWidth?: number }`.
    - SVG circle with `stroke-dasharray` / `stroke-dashoffset` for animated fill.
    - Center text shows percentage.
    - Stroke color: `--color-tertiary-fixed`.
  - Create `frontend/src/pages/ProfilePage.tsx`:
    - Fetches `GET /api/users/me` on mount.
    - **Avatar section:** Initials circle (name initials, indigo bg) + name (`text-5xl` Manrope) + title.
    - **Edit button:** "Edit Professional Profile" gradient-editorial button.
    - **Subscription Card (lg:col-span-2):** "Editorial Pro+" (text-4xl, primary color), feature list with `check_circle` tertiary icons.
    - **Precision Score Card:** `<CircularProgress value={qualityScore} />`. Shows last analysis date (from most recent session `updated_at` — fetch from `/api/sessions?limit=1`).
    - **Language Settings Card:** Primary Dialect `<select>` (English UK, English US, etc.), Translation Target `<select>` (French, Spanish, etc.), AI Auto-localize toggle (styled checkbox/switch).
    - **Help & Support Card (glassmorphism, lg:col-span-2):** `support_agent` icon, "Open Ticket" + "Documentation" buttons (stubs).
    - **Save:** On save, `PATCH /api/users/me` with changed fields; show success "Saved!" indicator; on error, show error message.
    - Editable fields: name, title, language settings.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - _Skills: /build-website-web-app (page, SVG component, form)_
  - **AC:** Profile page loads user data. CircularProgress renders with correct fill. Language dropdowns save via PATCH. Save success indicator appears. Error message shown on failure. TypeScript compiles.

---

- [ ] 15. Polish mobile responsiveness
  - Audit all pages at 375px and 768px viewport widths:
    - Dashboard: bento grid → stacked single column on mobile.
    - Editor: `SuggestionPanel` hidden on mobile; "Toggle Suggestions" button visible.
    - Insights: bento cards → full-width stacked.
    - Profile: grid cards → full-width stacked.
  - Ensure `BottomNav` has `padding-bottom: env(safe-area-inset-bottom)` for iOS.
  - Ensure `TopNav` hamburger shows on mobile and is hidden on desktop.
  - Verify no horizontal scroll on any page at 375px.
  - _Requirements: 2.1, 2.2_
  - _Skills: /build-website-web-app (responsive design, mobile layout)_
  - **AC:** No horizontal scroll at 375px on any page. BottomNav visible on mobile, Sidebar visible on desktop. Editor suggestion panel toggleable on mobile. iOS safe area padding applied.

---

- [ ] 16. Run full verification pass
  - Run `npm run typecheck` in both `frontend/` and `backend/`.
  - Run `npm run lint` in both `frontend/` and `backend/`.
  - Start both dev servers and manually verify:
    - Login → Dashboard → Upload → Editor → Suggestions → Export
    - Insights page metrics render
    - Profile save works
    - Logout → redirect to login
  - Fix any type errors, lint warnings, or broken imports discovered.
  - Update `bug-log.md` with any bugs found and fixed.
  - _Requirements: 11.1–11.6 (preservation check)_
  - _Skills: /code-writing-software-development (verification), /build-website-web-app (smoke test)_
  - **AC:** `tsc --noEmit` exits with code 0 on both frontend and backend. ESLint exits with 0 warnings/errors. All navigation flows work. All existing section operations work in the editor.
