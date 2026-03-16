# Tasks — Proof-Reading Engine

## Task Order

---

### T-01 Project Scaffolding
Set up bun monorepo with `frontend/` (Vite + React + TypeScript) and `backend/` (Express + TypeScript) workspaces.

_Requirements:_ US-01, US-08
_Skills:_ /code-writing-software-development, /build-website-web-app

**AC:**
- `bun install` succeeds from root
- `bun run dev` starts both frontend (port 5173) and backend (port 3001)
- TypeScript compiles without errors in both workspaces
- ESLint + Prettier configured and passing

---

### T-02 Supabase Schema & RLS
Create and apply the `sessions` and `sections` tables with indexes and RLS policies.

_Requirements:_ US-08, US-09
_Skills:_ /postgres-patterns, /database-migrations

**AC:**
- Migration SQL in `backend/src/db/migrations/001_initial.sql`
- Both tables exist in Supabase with correct columns and constraints
- RLS policies enforced: users cannot read other users' sessions or sections
- Index on `(session_id, position)` confirmed via `\d sections`

---

### T-03 Auth Integration
Implement Supabase Auth on frontend (sign-up, login, logout) and JWT verification middleware on backend.

_Requirements:_ US-08
_Skills:_ /build-website-web-app, /security-review

**AC:**
- `frontend/src/lib/supabase.ts` initializes Supabase client
- Auth pages: login and sign-up with Supabase Auth UI or custom form
- `backend/src/middleware/auth.ts` verifies Supabase JWT; returns 401 on failure
- All `/api/*` routes reject unauthenticated requests

---

### T-04 File Upload Endpoint
Implement `POST /api/upload` with multer, MIME validation, and Supabase session creation.

_Requirements:_ US-01, US-02
_Skills:_ /api-design, /security-review

**AC:**
- Accepts `file` (required) and `reference` (optional) as multipart form fields
- Rejects files > 20 MB and unsupported MIME types with descriptive errors
- Creates a `sessions` row in DB; returns `{ sessionId, status }`
- Uploaded file saved temporarily to `uploads/` and path stored for parser

---

### T-05 File Parsers
Implement DOCX, PDF, and TXT parsers that return a typed `Section[]` array.

_Requirements:_ US-03
_Skills:_ /code-writing-software-development, /nutrient-document-processing

**AC:**
- `backend/src/parsers/docx.ts` uses mammoth to extract headings + paragraphs
- `backend/src/parsers/pdf.ts` uses pdf-parse to split on blank lines / headings
- `backend/src/parsers/txt.ts` splits on double newlines; detects ALL-CAPS as headings
- Each parser returns `{ position, section_type, heading_level, original_text }[]`
- Uploaded temp file deleted after parsing succeeds or fails

---

### T-06 Section Storage
After parsing, insert all sections into the `sections` table and update session status to `proofreading`.

_Requirements:_ US-03, US-04
_Skills:_ /postgres-patterns

**AC:**
- All sections inserted in a single batch upsert
- `sessions.status` updated to `'proofreading'`
- Reference file text (if present) stored in `reference_text` per section

---

### T-07 Proofreading Service — OpenAI
Implement `backend/src/services/openai.ts` that sends each section to GPT-4o and returns `{ corrected_text, change_summary }`.

_Requirements:_ US-04
_Skills:_ /code-writing-software-development, /security-review

**AC:**
- Uses `openai` npm SDK with `OPENAI_API_KEY` from env
- Sends system prompt + section text; parses JSON response
- Handles rate limits and timeouts with one retry
- Returns structured result or throws for fallback

---

### T-08 Proofreading Service — LanguageTool Fallback
Implement `backend/src/services/languagetool.ts` as a fallback when OpenAI fails.

_Requirements:_ US-04
_Skills:_ /code-writing-software-development

**AC:**
- Calls LanguageTool `/check` endpoint with section text
- Applies corrections from response matches
- Returns `{ corrected_text, change_summary: "Grammar corrections via LanguageTool" }`

---

### T-09 Proofreading Orchestrator
Implement the async orchestrator that runs up to 5 parallel GPT-4o calls per session, writes results to DB, and updates session status.

_Requirements:_ US-04
_Skills:_ /autonomous-agents-task-automation, /postgres-patterns

**AC:**
- `backend/src/services/proofreader.ts` processes all sections for a session
- Max 5 concurrent calls enforced (p-limit or equivalent)
- On each section completion: `corrected_text`, `change_summary`, `status='ready'` written to DB
- After all sections done: `sessions.status` updated to `'review'`

---

### T-10 Sections API
Implement `GET /api/sessions/:id`, `GET /api/sections/:id`, and `PATCH /api/sections/:id`.

_Requirements:_ US-05, US-06, US-09
_Skills:_ /api-design, /postgres-patterns

**AC:**
- `GET /api/sessions/:id` returns session + all sections ordered by position
- `GET /api/sections/:id` returns single section
- `PATCH /api/sections/:id` accepts `{ final_text?, status }` and validates status enum
- All routes return 403 if session belongs to another user

---

### T-11 Frontend — FileUpload Component
Build the Home page with drag-and-drop file upload, reference file slot, and upload progress indicator.

_Requirements:_ US-01, US-02
_Skills:_ /build-website-web-app

**AC:**
- Accepts drag-and-drop or click-to-browse for .docx, .pdf, .txt
- Shows file name + size after selection; rejects wrong types client-side
- Optional reference file slot with same validation
- Upload progress bar during POST; redirects to Review page with sessionId on success
- Displays server error messages inline

---

### T-12 Frontend — Review Page Layout
Build the Review page with sidebar section list and main content area.

_Requirements:_ US-05
_Skills:_ /build-website-web-app

**AC:**
- Sidebar: scrollable list of sections showing `position`, `section_type`, and status badge
- Status badge colors: pending=gray, ready=blue, accepted=green, rejected=red
- Clicking a section in sidebar updates the active section in main view
- Polls `GET /api/sessions/:id` every 2s until all sections are `ready`

---

### T-13 Frontend — SectionCard Component
Build the SectionCard showing original text, editable corrected text, optional reference text, diff view, and action buttons.

_Requirements:_ US-05, US-06
_Skills:_ /build-website-web-app

**AC:**
- Displays `original_text` (read-only), `corrected_text` in editable textarea, `reference_text` (collapsible)
- Inline diff highlighting between original and corrected (word-level)
- Accept / Reject buttons; Accept saves current textarea value as `final_text`
- PATCH request sent on Accept or Reject; sidebar status updates immediately
- Edit-only mode: user can modify textarea without accepting yet

---

### T-14 PDF Export Endpoint
Implement `POST /api/export/:sessionId` using pdf-lib to compile and stream the final PDF.

_Requirements:_ US-07
_Skills:_ /code-writing-software-development

**AC:**
- Returns 400 if any section is still `pending`
- Compiles sections in `position` order: rejected → `original_text`, others → `final_text`
- Headings rendered bold at correct font sizes; paragraphs at 11pt / 1.15 line-height
- Streams PDF binary with correct Content-Type and Content-Disposition headers
- Completes in < 5s for ≤ 50 sections

---

### T-15 Frontend — Export Button & Download
Add "Download PDF" button to Review page that calls the export endpoint and triggers browser download.

_Requirements:_ US-07
_Skills:_ /build-website-web-app

**AC:**
- Button disabled until all sections are non-pending
- On click: POST to `/api/export/:sessionId`, receive blob, trigger download
- Shows loading spinner during export; shows error message on failure

---

### T-16 E2E Tests
Write Playwright tests covering the full happy path: upload → proofread → review → export.

_Requirements:_ All US
_Skills:_ /e2e-testing

**AC:**
- Test: upload a sample .docx file, wait for all sections to be ready
- Test: accept all sections, click Download PDF, verify file is downloaded
- Test: reject one section, verify original_text used in export
- Test: unauthenticated user redirected to login page
- All tests pass in CI (`bun run test:e2e`)

---

### T-17 Security Hardening
Run /security-review across all auth, upload, and API surfaces.

_Requirements:_ US-08
_Skills:_ /security-review

**AC:**
- OWASP checklist completed for: file upload (path traversal, MIME bypass), JWT (expiry, sig validation), API (IDOR, RLS), env secrets
- No secrets in source code or logs
- CORS allows only `FRONTEND_URL`
- All findings from review resolved or documented as accepted risk

---

### T-18 Deployment
Deploy frontend to Vercel and backend to Render; configure env vars on both platforms.

_Requirements:_ All
_Skills:_ /terminal-cli-devops, /code-writing-software-development

**AC:**
- `vercel deploy` succeeds; frontend live at Vercel URL
- Render service running backend; health check endpoint `GET /api/health` returns 200
- All env vars set on both platforms (no `.env` committed)
- Frontend `VITE_API_URL` points to Render backend URL
