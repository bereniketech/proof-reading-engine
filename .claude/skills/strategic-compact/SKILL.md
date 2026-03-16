---
name: strategic-compact
description: Compact context at logical phase boundaries to preserve coherence and avoid mid-task context loss.
---

# Strategic Compact

Trigger `/compact` at deliberate task boundaries rather than waiting for auto-compaction, which fires at arbitrary points and can destroy critical mid-task context.

---

## 1. When to Compact

Use this decision table at every phase transition:

| Transition | Compact? | Reason |
|---|---|---|
| Research → Planning | Yes | Research is bulky; plan is the distilled output |
| Planning → Implementation | Yes | Plan lives in TodoWrite or a file; free context for code |
| Implementation → Testing | Maybe | Keep if tests reference recent code; compact if switching focus |
| Debugging → Next feature | Yes | Debug traces pollute unrelated work |
| After a failed approach | Yes | Clear dead-end reasoning before retrying |
| Mid-implementation | No | Losing variable names, file paths, and partial state is costly |

**Rule:** Never compact mid-implementation. Always finish the current atomic unit of work first.

---

## 2. Hook-Based Threshold Detection

The `suggest-compact.js` script runs on `PreToolUse` for Edit and Write operations. It counts tool calls and suggests compaction at the configured threshold.

Register in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit",  "hooks": [{ "type": "command", "command": "node ~/.claude/skills/strategic-compact/suggest-compact.js" }] },
      { "matcher": "Write", "hooks": [{ "type": "command", "command": "node ~/.claude/skills/strategic-compact/suggest-compact.js" }] }
    ]
  }
}
```

Default threshold: 50 tool calls. Reminder every 25 calls after threshold. Override with `COMPACT_THRESHOLD` env var.

**Rule:** Treat the hook suggestion as a prompt to evaluate, not an automatic command. You decide whether to compact.

---

## 3. Token Budget Discipline

Monitor what consumes context:

- **CLAUDE.md files** — Always loaded; keep them lean.
- **Loaded skills** — Each adds 1–5K tokens; use trigger-table lazy loading.
- **Conversation history** — Grows with every exchange.
- **Tool results** — File reads and search results add bulk fast.

Trigger-table lazy loading: map keywords to skill paths and load skills only when triggered. This reduces baseline context by 50%+.

**Rule:** Audit CLAUDE.md and loaded skills for duplicate instructions before compacting — remove redundancy first.

---

## 4. What Survives Compaction

| Persists | Lost |
|---|---|
| CLAUDE.md instructions | Intermediate reasoning and analysis |
| TodoWrite task list | File contents you previously read |
| Memory files (`~/.claude/memory/`) | Multi-step conversation context |
| Git state (commits, branches) | Tool call history and counts |
| Files on disk | Nuanced user preferences stated verbally |

---

## 5. Pre-Compact Checklist

Before running `/compact`:

1. Write important decisions or context to a file or `~/.claude/memory/`.
2. Ensure the current plan is committed to TodoWrite.
3. Confirm all uncommitted code is saved to disk.
4. Use a summary hint: `/compact Focus on implementing auth middleware next`.

**Rule:** Never compact without saving volatile context first — memory files and TodoWrite are your anchors.

---

## 6. Anti-Patterns

- Do not rely on auto-compaction as a strategy — it has no awareness of task boundaries.
- Do not compact across sessions that share unfinished file edits.
- Do not load all skills at session start — lazy-load from a trigger table.
- Do not let duplicate instructions accumulate across CLAUDE.md and skill files.
