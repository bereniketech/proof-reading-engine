# Requirements — Proof-Reading Engine

## User Stories & Acceptance Criteria

### US-01 File Upload
As a user, I want to upload a DOCX, PDF, or TXT file so that the system can parse it for proofreading.

EARS: WHEN the user drags or selects a file on the Home page,
  THE SYSTEM SHALL accept files of type .docx, .pdf, .txt up to 20 MB,
  display a progress indicator during upload,
  reject unsupported types with a clear error message,
  AND return a session ID upon successful upload.

### US-02 Reference File Upload (Optional)
As a user, I want to optionally upload a reference file so that corrections can be aligned to its style and content.

EARS: WHEN the user uploads a second file as a reference,
  THE SYSTEM SHALL associate it with the current session,
  AND make reference text available alongside each section in the review UI.

### US-03 Automatic Section Parsing
As a user, I want the uploaded file parsed into sections automatically so I can review corrections section by section.

EARS: WHEN a file is successfully uploaded,
  THE SYSTEM SHALL parse it into logical sections (headings + body paragraphs),
  preserve the original order and heading hierarchy,
  AND store each section with its original_text and section_type (heading/paragraph).

### US-04 AI Proofreading
As a user, I want each section automatically proofread so I don't have to run corrections manually.

EARS: WHEN sections are created for a session,
  THE SYSTEM SHALL send each section to OpenAI GPT-4o for grammar, spelling, style, and clarity correction,
  fall back to LanguageTool if OpenAI is unavailable,
  store the corrected_text and change_summary per section,
  AND mark section status as "ready" when correction is complete.

### US-05 Section Review UI
As a user, I want to see original and corrected text side by side so I can review each correction.

EARS: WHEN the user navigates to the Review page,
  THE SYSTEM SHALL display a sidebar listing all sections with status indicators (pending / ready / accepted / rejected),
  show the active section's original_text, an editable corrected_text field, and optionally the reference_text,
  AND highlight diffs between original and corrected text inline.

### US-06 Accept / Edit / Reject Corrections
As a user, I want to accept, manually edit, or reject each correction so I retain full control of the final document.

EARS: WHEN the user clicks Accept, edits the text field, or clicks Reject on a section,
  THE SYSTEM SHALL update the section's status and final_text in the database immediately,
  reflect the new status in the sidebar indicator,
  AND prevent export until all sections have a non-pending status.

### US-07 PDF Export
As a user, I want to download the finalized document as a PDF so I can share or archive it.

EARS: WHEN all sections have been accepted or rejected AND the user clicks "Download PDF",
  THE SYSTEM SHALL compile accepted/edited sections in original order using pdf-lib,
  preserve heading styles, body text, and spacing from the original structure,
  AND stream the PDF file to the browser as a download within 5 seconds for documents ≤ 50 sections.

### US-08 Authentication
As a user, I want my sessions to be private so no one else can access my documents.

EARS: WHEN any request is made to /api/*,
  THE SYSTEM SHALL require a valid Supabase JWT,
  reject unauthenticated requests with HTTP 401,
  AND enforce row-level security so users can only access their own sessions and sections.

### US-09 Session Persistence
As a user, I want my review progress saved so I can close the browser and continue later.

EARS: WHEN a user returns to the dashboard,
  THE SYSTEM SHALL restore all sessions with their section states from the database,
  AND allow the user to resume any in-progress review.

### US-10 Error Handling
As a user, I want clear error messages when something fails so I know what to do next.

EARS: WHEN an upload, parse, or correction step fails,
  THE SYSTEM SHALL display a user-readable error message,
  log the error server-side with request context,
  AND allow the user to retry the failed step.
