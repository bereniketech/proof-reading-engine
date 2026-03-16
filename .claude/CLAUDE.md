# Proof-Reading Engine

## WAT Framework
Layer 1 Workflows: `workflows/` — SOPs defining objectives, inputs, tools, outputs.
Layer 2 Agent (you): read workflows, call tools in sequence, recover from errors.
Layer 3 Tools: `tools/` — deterministic scripts. API keys in `.env`. Never store secrets elsewhere.

## Start Here
Read `.spec/plan.md` for project overview, then `.spec/requirements.md`, `.spec/design.md`, and `.spec/tasks.md` for full spec.
Complete tasks in order. Mark each done before starting the next.

## Project Config
Read `.claude/project-config.md` for deployment targets, hosting, GitHub settings, and env var names.
Use this config when executing deployment, CI/CD, or hosting-related tasks.

## Skills
Skill files are in `.claude/skills/[skill-name]/SKILL.md`. Load with `/[skill-name]`.
/code-writing-software-development — all feature implementation, bug fixes, and refactors
/tdd-workflow — write failing tests before any implementation
/security-review — run before every PR touching auth, input, secrets, or APIs
/autonomous-agents-task-automation — delegate to subagents and parallelize independent tasks
/continuous-learning — extract and persist reusable patterns from this session
/strategic-compact — compact context at phase boundaries to prevent context rot
/build-website-web-app — React/TypeScript frontend components, routing, state
/api-design — Express REST API design, request validation, error handling
/postgres-patterns — Supabase/PostgreSQL queries, RLS policies, indexing
/database-migrations — schema versioning and safe migration scripts
/e2e-testing — Playwright end-to-end test authoring and execution
/nutrient-document-processing — DOCX/PDF parsing, structure extraction

## Agents
Specialized subagents in `.claude/agents/`. Invoke with `@agent-name`.
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

`@code-reviewer` and `@tdd-guide` are triggered via `/code-review` and `/tdd` commands — not inline.
**Rule:** Never invoke agents in the last 20% of context. Never invoke inside autonomous loops or hook scripts.

## Commands
Slash commands in `.claude/commands/`. Invoke with `/command-name`.
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
  skills/
    continuous-learning/SKILL.md
    strategic-compact/SKILL.md
    tdd-workflow/SKILL.md
    code-writing-software-development/SKILL.md
    security-review/SKILL.md
    autonomous-agents-task-automation/SKILL.md
    build-website-web-app/SKILL.md
    api-design/SKILL.md
    postgres-patterns/SKILL.md
    database-migrations/SKILL.md
    e2e-testing/SKILL.md
    nutrient-document-processing/SKILL.md
    planning-specification-architecture/SKILL.md
  agents/
    planner.md, architect.md, code-reviewer.md
    security-reviewer.md, tdd-guide.md, build-error-resolver.md
    refactor-cleaner.md, e2e-runner.md, doc-updater.md, database-reviewer.md
  commands/
    plan.md, tdd.md, verify.md, quality-gate.md, build-fix.md
    checkpoint.md, code-review.md, refactor-clean.md
    save-session.md, resume-session.md, learn.md, learn-eval.md
    model-route.md, e2e.md
  rules/
    common/
      security.md, testing.md, coding-style.md, patterns.md
      performance.md, development-workflow.md, git-workflow.md
      agents.md, hooks.md, context-budget.md
    typescript/
  hooks/
    hooks.json
  contexts/
    dev.md, research.md, review.md
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
