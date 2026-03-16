# Plan: Proof-Reading Engine

## Goal
Build a web-based proofreading dashboard that parses uploaded DOCX/PDF/TXT files into sections, runs AI-powered corrections via OpenAI GPT, presents a review UI for accept/reject per section, and exports the finalized document as PDF.

## Constraints
- Frontend: React + TypeScript (Vite)
- Backend: Node.js + Express + TypeScript
- AI: OpenAI GPT API primary; LanguageTool fallback
- PDF export: pdf-lib
- File parsing: mammoth (DOCX), pdf-parse (PDF)
- Hosting: Vercel (frontend) + Render (backend)
- DB: Supabase (PostgreSQL)

## Deliverables
The plan must produce:
- `.spec/plan.md` — high-level project overview: goal, tech stack, architecture diagram, file structure
- `.spec/requirements.md` — user stories and acceptance criteria (EARS format)
- `.spec/design.md` — architecture, data models, API design, ADRs, security, performance
- `.spec/tasks.md` — ordered task list with acceptance criteria per task

## Instructions
Use /planning-specification-architecture.
Write `plan.md` first as the high-level overview, then follow the skill's 3-phase gated workflow: requirements → user approves → design → user approves → tasks → user approves.
Do not write implementation code. Do not skip approval gates.
Save each artifact only after the user explicitly approves that phase.
