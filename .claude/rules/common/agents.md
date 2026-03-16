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

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

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
