# Proof-Reading Engine

## WAT Framework
Layer 1 Workflows: `workflows/` — SOPs defining objectives, inputs, tools, outputs.
Layer 2 Agent (you): read workflows, call tools in sequence, recover from errors.
Layer 3 Tools: `tools/` — deterministic scripts. API keys in `.env`. Never store secrets elsewhere.

## Active Feature
Feature: editorial-intelligence-ui
Spec: .spec/editorial-intelligence-ui/requirements.md, .spec/editorial-intelligence-ui/design.md
Tasks: .spec/editorial-intelligence-ui/tasks/
Current task: .spec/editorial-intelligence-ui/tasks/task-008.md
Branch: main

## Build Order (remaining)
| # | Task | File | What |
|---|---|---|---|
| 1 | Task 008 | `task-008.md` | DashboardPage — upload panel + recent docs grid |
| 2 | Task 009 | `task-009.md` | SuggestionPanel component |
| 3 | Task 010 | `task-010.md` | EditorPage — split-pane + toolbar |
| 4 | Task 011 | `task-011.md` | InsightsPage + GET /api/sessions/:id/insights |
| 5 | Task 012 | `task-012.md` | ProfilePage + GET\|PATCH /api/users/me |
| 6 | Task 013 | `task-013.md` | Backend insights endpoint |
| 7 | Task 014 | `task-014.md` | Backend user profile endpoint |
| 8 | Task 015 | `task-015.md` | Mobile responsiveness audit (375px/768px) |
| 9 | Task 016 | `task-016.md` | E2E Playwright tests |

## Status Snapshot (2026-04-19)
**Backend:** production-ready. Upload, parse, proofread, sections CRUD, PDF export all complete. Missing: insights endpoint, user profile endpoint.
**Frontend:** ~30% complete. Done: LoginPage, AppShell+Layout, DocumentCard, SectionCard (legacy). Stubs: DashboardPage, EditorPage, InsightsPage, ProfilePage. Missing: SuggestionPanel component entirely.
**Tests:** backend unit tests exist; Playwright suite empty.
**Mobile:** not yet audited.

## Start Here
Read `.spec/plan.md` for project overview, then `.spec/requirements.md`, `.spec/design.md`, and `.spec/tasks.md` for full spec.
Complete tasks in order. Mark each done before starting the next.

## Project Config
Read `.claude/project-config.md` for deployment targets, hosting, GitHub settings, and env var names.
Use this config when executing deployment, CI/CD, or hosting-related tasks.

## Skills
Skills are loaded via `@` imports below. Active on every session start.

@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/development/code-writing-software-development/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/testing-quality/tdd-workflow/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/testing-quality/security-review/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/planning/autonomous-agents-task-automation/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/core/continuous-learning/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/core/strategic-compact/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/development/build-website-web-app/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/development/api-design/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/data-backend/postgres-patterns/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/data-backend/database-migrations/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/testing-quality/e2e-testing/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/integrations/nutrient-document-processing/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/planning/planning-specification-architecture/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/frameworks-frontend/react-ui-patterns/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/frameworks-frontend/react-best-practices/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/ui-design/ui-ux-pro-max/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/ui-design/design-system/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/testing-quality/playwright-skill/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/performance/web-performance-optimization/SKILL.md
@C:/Users/Hp/Desktop/Experiment/claude_kit/skills/_studio/batch-tasks/SKILL.md

## Agents
Specialized subagents via junction → `C:/Users/Hp/Desktop/Experiment/claude_kit/agents/`. Invoke with `@agent-name`.
**Default: do not invoke agents unless the condition below is explicitly met.**

| Agent | Call ONLY when | Never call when |
|---|---|---|
| `@planner` | Feature has >5 tasks or unclear dependencies | Scope is clear and small |
| `@architect` | New service, data model change, or new external integration | Extending existing patterns |
| `@security-reviewer` | Code touches auth, user input, APIs, or secrets | Pure logic/UI, no data boundaries |
| `@build-error-resolver` | Build fails AND first fix attempt already failed | Build passes |
| `@database-reviewer` | Writing SQL, migrations, or schema changes | No DB interaction |
| `@e2e-runner` | Adding or modifying Playwright tests | Unit tests only |
| `@doc-updater` | Public API surface changes | Internal refactor |
| `@ui-design-expert` | Building new pages/components (Tasks 008–012) with bespoke layout or design system decisions | Simple prop/style tweak |

`@code-reviewer` and `@tdd-guide` are triggered via `/code-review` and `/tdd` commands — not inline.
**Rule:** Never invoke agents in the last 20% of context. Never invoke inside autonomous loops or hook scripts.

## Commands
Slash commands via junction → `C:/Users/Hp/Desktop/Experiment/claude_kit/commands/`. Invoke with `/command-name`.
/plan — restate requirements and create implementation plan before any code
/tdd — scaffold failing tests first, then implement (Red/Green/Refactor)
/verify — run full build → type → lint → test → security → diff pipeline
/quality-gate — run ECC quality pipeline on demand for any file or scope
/refactor-clean — safely remove dead code with test verification at every step
/save-session — save full session state to ~/.claude/sessions/ before ending
/resume-session — load last session state and resume with full context
/code-review — quality and security review of current changes
/build-fix — incrementally fix build and type errors
/checkpoint — save current context state mid-session
/learn — extract reusable patterns from this session
/learn-eval — extract and self-evaluate patterns before saving
/model-route — select the right model tier for a task
/e2e — run Playwright E2E suite

## Rules
Always-follow guidelines in `.claude/rules/`. Applied automatically.

## Bug Log
When any bug is found and fixed, append an entry to `bug-log.md`:
```
## [YYYY-MM-DD] Short title
- **What broke:** one line description
- **Root cause:** what caused it
- **Fix applied:** what was changed
- **Affected file(s):** path(s)
```
Do this immediately after fixing — before moving to the next task.

## Self-Check (run before marking any task done)
1. Does the output match the acceptance criteria in `.spec/tasks.md`?
2. Are there any hardcoded values that should be config or env vars?
3. Did any new files get created that aren't in the File Layout? Add them.
4. Did this change break anything upstream or downstream?
5. Is `bug-log.md` up to date if any errors occurred?

If any check fails — fix it before proceeding.

## File Layout
```
.gitignore
.env
.env.example
.claude/
  CLAUDE.md
  CLAUDE.planning.md
  project-config.md
  agents/    → junction: C:/Users/Hp/Desktop/Experiment/claude_kit/agents/
  commands/  → junction: C:/Users/Hp/Desktop/Experiment/claude_kit/commands/
  hooks/     → junction: C:/Users/Hp/Desktop/Experiment/claude_kit/hooks/
  contexts/  → junction: C:/Users/Hp/Desktop/Experiment/claude_kit/contexts/
  rules/
    common/     → junction: C:/Users/Hp/Desktop/Experiment/claude_kit/rules/common/
    typescript/ → junction: C:/Users/Hp/Desktop/Experiment/claude_kit/rules/typescript/
  mcp-configs/
    mcp-servers.json
.spec/
  plan.md
  requirements.md
  design.md
  tasks.md
.tmp/
frontend/
  src/
    components/
    pages/
    hooks/
    lib/
  public/
backend/
  src/
    routes/
    services/
    parsers/
    proofreader/
    pdf/
  uploads/
tools/
workflows/
bug-log.md
```
