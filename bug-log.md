## [2026-03-16] Upload route stability and error-safety fixes
- **What broke:** Upload flow could leak temporary files on backend failures, classify client validation errors as server errors, and expose internal error details; health route was unintentionally auth-protected.
- **Root cause:** Missing cleanup on some early-return/failure paths, generic error handling that did not separate upload validation failures, and middleware order putting `/api/health` behind JWT auth.
- **Fix applied:** Added cleanup for all failure paths, introduced upload validation error classification with 400 responses, validated uploaded content signatures (PDF/DOCX) plus TXT binary guard, switched unexpected errors to generic 500 responses, and moved health route registration before JWT middleware.
- **Affected file(s):** backend/src/routes/upload.ts, backend/src/server.ts, backend/src/lib/supabase.ts
