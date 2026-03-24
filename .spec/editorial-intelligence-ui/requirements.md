# Requirements: Editorial Intelligence UI

## Introduction

The proof-reading engine currently has a working backend (auth, upload, proofreading, sections, references, PDF export) but a minimal single-page frontend. This feature implements the full **Editorial Intelligence** multi-page experience — matching the Syntactic Prism design system shown in the `stitch/` mockups — while preserving every existing feature. The primary users are writers, academics, and editorial professionals who need AI-assisted document review with a polished, trustworthy interface.

---

## Requirements

### Requirement 1: Design System (Syntactic Prism)

**User Story:** As a user, I want the application to feel polished and editorial so that I trust the AI insights being presented.

#### Acceptance Criteria

1. WHEN the application loads THEN the system SHALL use the Manrope typeface for headings and Inter for body text, loaded via Google Fonts.
2. WHEN any UI surface is rendered THEN the system SHALL apply the Syntactic Prism color palette: primary `#3a388b` (indigo), secondary `#515f74` (slate), tertiary-fixed `#6ffbbe` (emerald), surface `#faf8ff`, and surface container hierarchy (low `#f2f3ff` → high → highest `#dae2fd`).
3. WHEN a primary action button is rendered THEN the system SHALL display a gradient from primary to primary-container (`#5250a4`).
4. WHEN an "Accept" action is rendered THEN the system SHALL use the emerald tertiary-fixed color (`#6ffbbe`) to differentiate it from primary actions.
5. WHEN glassmorphism is applied to a floating card THEN the system SHALL use `backdrop-filter: blur(12px)` with 80% background opacity.
6. The system SHALL NOT use visible border lines for card boundaries — separation SHALL be achieved via background color shifts.

---

### Requirement 2: Multi-Page Navigation

**User Story:** As a user, I want to navigate between Documents, Editor, Insights, and Profile pages without losing my session context so that I can efficiently manage my workflow.

#### Acceptance Criteria

1. WHEN a user is authenticated THEN the system SHALL display a persistent left sidebar on desktop (≥768px) with navigation links: Documents, Editor, Insights, Profile.
2. WHEN a user is on a mobile device (<768px) THEN the system SHALL display a fixed bottom navigation bar with the same four sections.
3. WHEN the user is on the active page THEN the system SHALL highlight the corresponding nav item with `surface-container-highest` background and a filled icon.
4. WHEN the user navigates to `/` while authenticated THEN the system SHALL redirect to `/dashboard`.
5. WHEN the user navigates to any authenticated route while unauthenticated THEN the system SHALL redirect to `/login`.
6. WHEN the user navigates to `/review?sessionId=X` (legacy URL) THEN the system SHALL redirect to `/editor/X`.

---

### Requirement 3: Login Page

**User Story:** As a new or returning user, I want a professional login experience so that I feel confident entrusting my documents to the service.

#### Acceptance Criteria

1. WHEN the user visits `/login` while unauthenticated THEN the system SHALL render a centered 440px card with the brand icon, email/password fields, and a "Sign In to Workspace" gradient button.
2. WHEN the user submits valid credentials THEN the system SHALL authenticate via Supabase and redirect to `/dashboard`.
3. WHEN authentication fails THEN the system SHALL display the error message from Supabase beneath the form.
4. WHEN the user clicks "Create account" THEN the system SHALL switch to sign-up mode in the same card.
5. WHEN sign-up succeeds without an active session THEN the system SHALL display a message instructing the user to confirm their email.
6. WHEN the login page renders THEN the system SHALL show a decorative glassmorphism "AI Insight" floating card as a visual accent (non-interactive).

---

### Requirement 4: Dashboard Page

**User Story:** As a user, I want a home page where I can upload documents and see my recent work so that I can quickly continue where I left off.

#### Acceptance Criteria

1. WHEN the user visits `/dashboard` THEN the system SHALL render a bento-grid layout: 7/12 upload panel on the left and 5/12 guidance panel on the right (stacks on mobile).
2. WHEN the upload panel renders THEN the system SHALL show a document-type dropdown with all 6 types (General, Medical Journal, Legal Document, Academic Paper, Business Report, Creative Writing), a drag-and-drop cloud upload area, and an "Analyze Document" button.
3. WHEN a user drags a file over the upload area THEN the system SHALL visually highlight the drop zone.
4. WHEN a file is dropped or selected AND it fails validation THEN the system SHALL display a validation error (unsupported type or exceeds 20 MB).
5. WHEN the user clicks "Analyze Document" THEN the system SHALL POST to `/api/upload`, show an upload progress bar, and redirect to `/editor/:sessionId` on success.
6. WHEN the dashboard loads THEN the system SHALL fetch `GET /api/sessions` and render a grid of document cards below the upload panel.
7. WHEN a document card is rendered THEN the system SHALL display: filename, document type, status badge (pending/proofreading/complete), and relative date.
8. WHEN a user clicks a document card THEN the system SHALL navigate to `/editor/:sessionId`.
9. WHEN no documents exist THEN the system SHALL render an empty-state message encouraging the user to upload their first document.
10. WHEN the guidance panel renders THEN the system SHALL show a SMART TIPS card with a tertiary badge and a Secure Architecture info card.

---

### Requirement 5: Editor Page

**User Story:** As a user, I want to review and edit my document in a focused split-pane environment so that I can efficiently act on AI suggestions alongside the full document text.

#### Acceptance Criteria

1. WHEN the user visits `/editor/:sessionId` THEN the system SHALL render a split-pane layout: the main editor canvas on the left and the AI Suggestions panel (w-80) on the right (hidden on mobile behind a toggle).
2. WHEN the editor canvas renders THEN the system SHALL display all existing section operations: view diff (original vs corrected), accept/reject sections, edit final text inline, add AI instruction, split section, merge sections, add new section, and match references.
3. WHEN the AI Suggestions panel renders THEN the system SHALL list sections that have a `corrected_text` differing from `original_text`, grouped by category (Clarity, Conciseness, Tone) with a NEW badge count.
4. WHEN a suggestion card is rendered THEN the system SHALL show: category label, a truncated original excerpt, the AI suggestion, and an "Accept Suggestion" button.
5. WHEN the user clicks "Accept Suggestion" THEN the system SHALL PATCH `/api/sections/:id` with `{ status: 'accepted' }` and remove the card from the panel.
6. WHEN the editor toolbar renders THEN the system SHALL show: a "Match References" button (calls `POST /sessions/:id/match-references`), an Export PDF button that opens a modal with the reference style selector (APA, MLA, Chicago, IEEE, Vancouver), and the session filename as the page title.
7. WHEN the editor bottom bar renders THEN the system SHALL show readability score and word count derived from visible section text.
8. WHEN a section has status "accepted" THEN the system SHALL render it with a primary-color left border highlight.
9. WHEN a section has status "rejected" THEN the system SHALL render it with a muted/dimmed appearance.
10. IF the session status is "proofreading" THEN the system SHALL display a loading indicator and poll every 5 seconds until the status changes.

---

### Requirement 6: Insights Page

**User Story:** As a user, I want to see detailed linguistic analytics for my document so that I can understand its overall quality and make informed revisions.

#### Acceptance Criteria

1. WHEN the user visits `/insights/:sessionId` THEN the system SHALL fetch `GET /api/sessions/:id/insights` and render a bento-grid analytics dashboard.
2. WHEN the insights load THEN the system SHALL render a Performance Metric card showing: Overall Quality score (0–100) and a Grammar & Syntax percentage progress bar.
3. WHEN the insights load THEN the system SHALL render a Tone Analysis card showing: Authority, Confidence, and Urgency as labeled percentage progress bars.
4. WHEN the insights load THEN the system SHALL render a Vocabulary Diversity card showing a score out of 10 with a descriptor.
5. WHEN the insights load THEN the system SHALL render a Lexical Density card showing a percentage with a descriptor.
6. WHEN the insights load THEN the system SHALL render a Content Sentiment card with a bar chart showing positive, neutral, and negative proportions.
7. WHEN the insights page renders THEN the system SHALL provide an Export PDF button (calls the existing export endpoint) and a Re-analyze button (re-triggers proofreading).
8. WHEN the API call fails THEN the system SHALL display an error state with a retry option.
9. IF the session does not have enough section data to compute insights THEN the system SHALL display a message: "Analyze a document first to see insights."

---

### Requirement 7: Profile Page

**User Story:** As a user, I want to manage my profile, subscription, and language preferences so that the AI adapts to my editorial standards.

#### Acceptance Criteria

1. WHEN the user visits `/profile` THEN the system SHALL fetch `GET /api/users/me` and render: avatar/initials, name, professional title, subscription plan card, precision score, language settings, and a help/support card.
2. WHEN the avatar renders without a profile image THEN the system SHALL display the user's initials in a styled circle.
3. WHEN the subscription card renders THEN the system SHALL show the plan tier ("Editorial Pro+") and a feature list with check icons.
4. WHEN the precision score renders THEN the system SHALL show an SVG circular progress indicator.
5. WHEN the language settings render THEN the system SHALL show dropdowns for Primary Dialect and Translation Target, and a toggle for AI Auto-localize.
6. WHEN the user saves language settings THEN the system SHALL PATCH `/api/users/me` with the updated metadata and show a success toast.
7. WHEN the help card renders THEN the system SHALL show an "Open Ticket" and "Documentation" button (non-functional stubs are acceptable).
8. IF saving profile fails THEN the system SHALL display the error message and keep the form in editable state.

---

### Requirement 8: Backend — Sessions List Endpoint

**User Story:** As a frontend, I need a paginated list of the current user's sessions so that the Dashboard can render recent documents.

#### Acceptance Criteria

1. WHEN `GET /api/sessions` is called with a valid JWT THEN the system SHALL return `{ sessions: [...], total, page }` with status 200.
2. WHEN the sessions list is returned THEN each session object SHALL include: `id`, `filename`, `file_type`, `document_type`, `status`, `created_at`, `updated_at`.
3. WHEN called with `?page=N&limit=M` THEN the system SHALL return the correct paginated slice.
4. IF the JWT is missing or invalid THEN the system SHALL return 401.
5. The system SHALL only return sessions belonging to the authenticated user (user_id scoping via Supabase RLS or explicit filter).

---

### Requirement 9: Backend — Insights Endpoint

**User Story:** As a frontend, I need computed analytics for a session so that the Insights page can render meaningful metrics without a separate AI call.

#### Acceptance Criteria

1. WHEN `GET /api/sessions/:id/insights` is called THEN the system SHALL return a JSON object with: `quality_score`, `grammar_score`, `tone` (`authority`, `confidence`, `urgency`), `vocabulary_diversity`, `lexical_density`, `sentiment` (`positive`, `neutral`, `negative`), `word_count`, `readability_score`.
2. WHEN computing `quality_score` THEN the system SHALL base it on the ratio of accepted + ready sections vs total sections (0–100).
3. WHEN the session does not belong to the authenticated user THEN the system SHALL return 403.
4. WHEN the session has no sections THEN the system SHALL return `{ error: 'No sections found' }` with status 422.
5. All metrics SHALL be computed server-side from section text — no additional AI/LLM calls.

---

### Requirement 10: Backend — User Profile Endpoint

**User Story:** As a frontend, I need to read and write user profile metadata so that the Profile page can display and persist preferences.

#### Acceptance Criteria

1. WHEN `GET /api/users/me` is called with a valid JWT THEN the system SHALL return user metadata: `email`, `name`, `title`, `primary_dialect`, `translation_target`, `auto_localize`.
2. WHEN `PATCH /api/users/me` is called with valid metadata fields THEN the system SHALL update Supabase user metadata and return the updated object with status 200.
3. WHEN invalid field values are submitted THEN the system SHALL return 400 with a descriptive error.
4. IF the JWT is invalid THEN the system SHALL return 401.

---

### Requirement 11: Preserve All Existing Features

**User Story:** As an existing user, I want all current functionality to continue working unchanged so that the UI upgrade does not break my workflow.

#### Acceptance Criteria

1. WHEN a user uploads a file THEN the system SHALL continue to support DOCX, PDF, and TXT formats up to 20 MB.
2. WHEN a section is proofreading THEN the system SHALL continue to use the existing retry logic in the backend.
3. WHEN any existing section operation is invoked (split, merge, add, instruct, accept, reject, edit) THEN the system SHALL behave identically to the current implementation.
4. WHEN the user exports a PDF THEN the system SHALL use the existing `POST /api/export/:sessionId` endpoint with the selected reference style.
5. WHEN the user matches references THEN the system SHALL use the existing `POST /api/sessions/:sessionId/match-references` endpoint.
6. The existing `SectionCard` component logic (LCS diff engine, token diff) SHALL remain unchanged.
