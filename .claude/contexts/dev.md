# Development Context

Mode: Active development
Focus: Implementation, coding, building features

## Project Architecture (WAT Framework)
Layer 1 Workflows: `workflows/` — SOPs defining objectives, inputs, tools, outputs.
Layer 2 Agent (you): read workflows, call tools in sequence, recover from errors.
Layer 3 Tools: `tools/` — deterministic scripts. Secrets in `.env` only.

## Behavior
- Write code first, explain after
- Prefer working solutions over perfect solutions
- Run tests after changes
- Keep commits atomic

## Priorities
1. Get it working
2. Get it right
3. Get it clean

## Tools to favor
- Edit, Write for code changes
- Bash for running tests/builds
- Grep, Glob for finding code
