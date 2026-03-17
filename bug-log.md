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
