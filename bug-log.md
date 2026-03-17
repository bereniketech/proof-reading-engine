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
- **Fix applied:** Corrected useEffect dependency arrays and added explicit outlet re-render on sidebar toggle for mobile UX.
- **Affected file(s):** frontend/src/ReviewPage.tsx

## [2026-03-17] PDF export heading text rendering
- **What broke:** Export endpoint heading text was rendered as heading level numbers instead of actual section text.
- **Root cause:** PDF generation logic was setting heading content to heading_level.toString() instead of using the textToUse variable.
- **Fix applied:** Corrected content array population to use textToUse for all section types and fix text reference in PDF drawing loop.
- **Affected file(s):** backend/src/services/export.ts
- **Root cause:** Edited text cache initialized only once per section without server resync, and responsive CSS removed the only section picker.
- **Fix applied:** Added dirty-aware draft synchronization from server values, introduced a mobile section select control, improved accessibility labeling for corrected-text textarea, and replaced listbox-like sidebar markup with semantic buttons.
- **Affected file(s):** frontend/src/ReviewPage.tsx, frontend/src/components/SectionCard.tsx, frontend/src/styles.css
