---
description: After completing a task, fill in the Handoff to Next Task section of the current task file, auto-populate the Handoff from Previous Task section of the next task file, mark the current task complete, and advance the Current task pointer in .claude/CLAUDE.md.
---

# Task Handoff

Run this after completing each task. Propagates context forward so the next task needs zero codebase re-exploration.

## Usage

```
/task-handoff                                      # auto-detects from Active Feature pointer
/task-handoff .spec/auth/tasks/task-002.md         # explicit path
```

---

## 1. Identify the Current Task File

If no argument given, read `.claude/CLAUDE.md` and extract the `Current task:` line from the `## Active Feature` block.

If the path cannot be determined, ask:

> "Which task file did you just complete? (e.g. `.spec/auth/tasks/task-002.md`)"

Read the file. Confirm task number, feature name, and objective before proceeding.

---

## 2. Gather Handoff Data

Collect the following. Use `git diff --name-only --diff-filter=ACM` and recent session activity first — ask the user only to fill gaps.

**Files changed:** Every file created or modified this task, with a one-line description of what changed.

**Decisions made:** Architectural choices, tradeoffs accepted, approaches chosen. Look for phrases like "I decided to", "we chose", "I'll use X instead of Y" in the session.

**Context for next task:** 2–4 sentences covering what was just built, how it integrates, and what the next task must know immediately.

**Open questions:** Anything unresolved, deferred, or needing investigation in the next task.

---

## 3. Fill "Handoff to Next Task" in Current File

Edit the current task file. Replace the placeholder content in `## Handoff to Next Task`:

```markdown
## Handoff to Next Task

**Files changed:**

| File | What changed | State |
|------|-------------|-------|
| `path/to/file.ts` | [one-line description] | complete |

**Decisions made:**
- **[Decision]** — [reason, what was rejected]

**Context for next task:**
[2–4 sentences of the most important things to know]

**Open questions:**
- [Specific question or investigation item]
```

---

## 4. Update Status in Current File

In the YAML frontmatter of the current task file, change `status: in-progress` (or `pending`) to `status: complete`.

---

## 5. Locate the Next Task File

1. Compute next = current task number + 1. Format zero-padded: `task-004.md`.
2. Check if `.spec/{feature}/tasks/task-{NNN+1}.md` exists.
3. If not found, scan the folder for the lowest-numbered file with `status: pending`.
4. If no pending tasks remain, skip Steps 6–7 and go to Step 8 (feature complete path).

---

## 6. Populate "Handoff from Previous Task" in Next File

Edit the next task file. Replace the placeholder content in `## Handoff from Previous Task`:

```markdown
## Handoff from Previous Task

**Files changed by previous task:**

| File | What changed |
|------|-------------|
| `path/to/file.ts` | [one-line description] |

**Decisions made in previous task:**
- **[Decision]** — [reason]

**Context for this task:**
[The "Context for next task" text from Step 2]

**Open questions left by previous task:**
- [Open question]
```

---

## 7. Advance Active Feature Pointer

Find the `## Active Feature` block in `.claude/CLAUDE.md`. Update only the `Current task:` line:

```markdown
## Active Feature
Feature: {feature-name}
Spec: .spec/{feature}/requirements.md, design.md
Tasks: .spec/{feature}/tasks/
Current task: .spec/{feature}/tasks/task-NNN+1.md
Branch: feature/{feature-name}
```

**Rule:** Edit only the `Current task:` line. Never modify any other section of `.claude/CLAUDE.md`.

---

## 8. Output Summary

**Normal path:**

```
HANDOFF COMPLETE
================
Completed : .spec/{feature}/tasks/task-NNN.md  [status: complete]
Next task : .spec/{feature}/tasks/task-NNN+1.md  [status: pending]
Pointer   : .claude/CLAUDE.md → Current task updated

Files propagated:
  - path/to/file.ts
  - path/to/file.ts

Open questions forwarded:
  - [list]

Ready: Task NNN+1 — {title}
Open .spec/{feature}/tasks/task-NNN+1.md and begin.
```

**Feature complete path** (no pending tasks remain):

```
FEATURE COMPLETE
================
All tasks in .spec/{feature}/tasks/ are marked complete.
Active Feature block removed from .claude/CLAUDE.md.

Run /code-review and /verify before merging feature/{feature-name}.
```

---

## Rules

**Rule:** Never read files outside `.spec/{feature}/tasks/` and `.claude/CLAUDE.md` during this command. Handoff data comes from the session and git, not codebase re-exploration.

**Rule:** Never overwrite a `## Handoff from Previous Task` section that already contains real content — confirm with the user first.

**Rule:** If git is unavailable, ask the user to list modified files rather than skipping the step.
