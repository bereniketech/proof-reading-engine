# Context Budget

Treat context window tokens as a finite, non-renewable resource per session. Every token loaded is a token unavailable for reasoning.

---

## 1. CLAUDE.md Must Stay Lean

Keep `CLAUDE.md` under 2 000 tokens. It is loaded on every session — bloat here costs quota on every interaction.

- Reference skills by `/skill-name` only — never paste skill content into CLAUDE.md
- One line per skill, agent, and command entry
- Remove sections that duplicate what a loaded skill already covers
- If CLAUDE.md exceeds 2 000 tokens, audit and trim before the next session

**Rule:** Any instruction already in a skill file must not be repeated in CLAUDE.md.

---

## 2. Lazy-Load Skills — Never Load All at Once

Skills are loaded on demand, not at session start. Build a trigger table in CLAUDE.md mapping keywords to skill paths:

```
/tdd-workflow         → write test | failing test | red phase | coverage
/security-review      → auth | login | input | password | token | API key
/code-writing-software-development → implement | refactor | fix bug | edit
/autonomous-agents-task-automation → parallelize | subagent | delegate | loop
/strategic-compact    → compact | context full | phase boundary
/continuous-learning  → extract pattern | save instinct | learn
```

Load a skill only when its trigger keywords appear in the task. Loading all six mandatory skills at once consumes ~15–30K tokens before any work begins.

**Rule:** Never preload skills speculatively. Load on first trigger, not at session start.

---

## 3. Route Heavy Tasks to Subagents

A task staying in the main context window competes with everything else. Route out when the task is heavy:

| Condition | Action |
|---|---|
| Task touches > 3 files | Delegate to `@architect` or `@code-reviewer` |
| Debugging loop > 3 attempts | Delegate to `@build-error-resolver` |
| New feature needs a plan | Delegate to `@planner` before writing any code |
| Security check needed | Delegate to `@security-reviewer` |
| Code was just written | Delegate to `@code-reviewer` |
| Dead code / cleanup needed | Delegate to `@refactor-cleaner` |

Subagents return only concise summaries — the main context receives the conclusion, not the full reasoning chain.

**Rule:** If a task would consume more than ~20 tool calls in the main session, it belongs in a subagent.

---

## 4. Compact at Phase Boundaries — Not Mid-Task

Compact at natural phase transitions, never mid-implementation:

| Transition | Compact? |
|---|---|
| Spec approved → implementation starts | Yes |
| Implementation done → test run | Yes |
| Debugging done → next feature | Yes |
| Mid-implementation | No — losing file paths and variable names is costly |

Before every `/compact` run: write volatile state to a file, commit TodoWrite, confirm uncommitted code is saved.

**Rule:** Run `/save-session` before compacting to preserve the full work state across sessions.

---

## 5. Model Routing — Match Tier to Task

Defaulting to the most powerful model for every task wastes quota:

| Task type | Model |
|---|---|
| Narrow edits, formatting, boilerplate | Haiku |
| Feature implementation, refactoring, research | Sonnet |
| Architecture decisions, root-cause analysis, security review | Opus |

Escalate tier only when a lower tier fails with a clear reasoning gap — never preemptively.

**Rule:** Every automated subagent loop must run on Haiku or Sonnet unless Opus capability is demonstrably required.

---

## 6. Avoid Context Pollution

- Do not load large files into context unless they are directly needed for the current task
- Do not search broadly when a targeted `Grep` or `Glob` suffices
- Do not paste external documentation into context — use `WebFetch` and reference by URL
- Do not repeat prior conversation context in new messages — it is already in history
- When switching tasks, compact first to clear unrelated reasoning from context

**Rule:** Before reading any file, confirm it is needed for the current task — not just potentially relevant.
