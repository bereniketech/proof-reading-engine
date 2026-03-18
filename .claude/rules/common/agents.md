# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations. Launch multiple agents in a single message; never chain them sequentially when tasks are independent.

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

## When NOT to Invoke Agents

**Default = no agent.** Only invoke when the cost of NOT calling is demonstrably high.

Never invoke an agent when:

1. **Trivial change** — typo, single-line config, constant rename. Main session handles it.
2. **Hooks already cover it** — PostToolUse hooks auto-format and type-check; don't duplicate.
3. **Inside an autonomous loop** — prevents cascading agent spawns that balloon token cost.
4. **Context window < 20% remaining** — spawning risks context truncation mid-task.
5. **Same agent already reviewed this file in this session** — only re-invoke if code changed significantly.
6. **Outside agent's declared scope** — e.g., calling `go-reviewer` on Python code.
7. **Pure read/research task** — reviewer agents have no value when nothing was written.
