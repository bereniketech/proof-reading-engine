# Proof-Reading Engine — Project Plan

## Goal
A web-based proofreading dashboard that accepts DOCX/PDF/TXT uploads, parses them into sections, runs AI-powered corrections (OpenAI GPT primary, LanguageTool fallback), presents a per-section review UI (original / corrected / reference), and exports the finalized document as a downloadable PDF.

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + TypeScript + Vite | Fast dev server, strong typing, ecosystem |
| Backend | Node.js + Express + TypeScript | Shared language with frontend, large parsing ecosystem |
| File Parsing | mammoth (DOCX), pdf-parse (PDF) | Battle-tested, preserves structure |
| AI Engine | OpenAI GPT-4o (primary) | Best grammar/style/clarity correction |
| AI Fallback | LanguageTool API | Free tier, no hallucination risk for grammar-only fixes |
| PDF Export | pdf-lib | Pure JS, no headless browser dependency |
| Database | Supabase (PostgreSQL) | File metadata, section state, version history, auth |
| Auth | Supabase Auth | JWT-based, integrates with DB RLS |
| Hosting | Vercel (frontend) + Render (backend) | Free tiers, zero-config deploys |
| Package Manager | bun | Faster installs, unified workspace |

## Architecture

```mermaid
graph TD
    User -->|Upload files| FE[React Dashboard]
    FE -->|POST /upload| API[Express Backend]
    API -->|Parse| Parser[File Parser\nmammoth / pdf-parse]
    Parser -->|Sections[]| API
    API -->|Store| DB[(Supabase\nPostgreSQL)]
    API -->|Proofread| GPT[OpenAI GPT-4o]
    GPT -->|Corrections| API
    API -->|Fallback| LT[LanguageTool API]
    API -->|Section results| FE
    FE -->|Review UI| User
    User -->|Accept/Reject| FE
    FE -->|POST /export| API
    API -->|Compile| PDF[pdf-lib\nPDF Generator]
    PDF -->|Download| User
```

## File & Folder Structure

```
proof-reading-engine/
  frontend/               # React + Vite app
    src/
      components/
        FileUpload.tsx     # Drag-and-drop uploader
        SectionList.tsx    # Sidebar: section navigation
        SectionCard.tsx    # Original / corrected / reference view
        DiffView.tsx       # Inline diff display
        StatusBadge.tsx    # pending / accepted / rejected
      pages/
        Home.tsx           # Upload entry point
        Review.tsx         # Main review dashboard
      hooks/
        useProofread.ts    # Proofreading session state
        useSections.ts     # Section CRUD + status
      lib/
        api.ts             # Typed fetch wrappers
        supabase.ts        # Supabase client
  backend/                # Express + TypeScript API
    src/
      routes/
        upload.ts          # POST /upload
        proofread.ts       # POST /proofread/:sessionId
        sections.ts        # GET/PATCH /sections/:id
        export.ts          # POST /export/:sessionId
      services/
        openai.ts          # GPT-4o correction service
        languagetool.ts    # LT fallback service
        supabase.ts        # DB service
      parsers/
        docx.ts            # mammoth DOCX → sections
        pdf.ts             # pdf-parse PDF → sections
        txt.ts             # Plain text → sections
      pdf/
        generator.ts       # pdf-lib PDF assembly
      middleware/
        auth.ts            # Supabase JWT verification
        upload.ts          # multer file handling
  .spec/                  # Planning artifacts
  .claude/                # AI assistant config
```

## Key Flows

**Upload & Parse:** User uploads file(s) → backend detects type → parser splits into sections with heading/paragraph metadata → sections stored in DB → session ID returned.

**Proofread:** Each section sent to GPT-4o with optional reference context → corrected text + change summary returned → stored as `corrected_text` alongside `original_text`.

**Review:** Frontend polls sections for session → SectionCard shows original + corrected in editable textarea → user accepts/edits/rejects → status written to DB.

**Export:** On "Download PDF" → backend fetches all accepted/edited sections in order → pdf-lib assembles with heading styles, body text, spacing → binary PDF streamed to client.

## Non-Functional Requirements
- Max upload: 20 MB per file
- Correction latency target: < 10s per section (GPT-4o streaming)
- PDF export: < 5s for documents up to 50 sections
- Auth: Supabase JWT on all `/api/*` routes
