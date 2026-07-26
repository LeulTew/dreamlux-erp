# AI Collaboration & Style Rules for Dream Lux ERP

> [!IMPORTANT]
> **READING AND FOLLOWING THESE MODULAR RULES IS MANDATORY & NOT OPTIONAL.**
> The rules for this repository are organized into modular, specialized files. You MUST load and prioritize the relevant rule file(s) for your active task:
>
> - **General Tasks & Workflow**: For session check-ins, issue pipelines, task checklists, and branch setups, you MUST read [.claude/rules/workflow.md](file:///.claude/rules/workflow.md).
> - **Git Commits & Pull Requests**: For commits syntax, draft PRs, and verification readiness, you MUST read [.claude/rules/git.md](file:///.claude/rules/git.md).
> - **Frontend / UI Development**: For theme colors (gold/slate), border radius constraints, typography, and mobile touch architectures, you MUST read [.claude/rules/ui-design.md](file:///.claude/rules/ui-design.md).
> - **System Architecture & Refactoring**: For module design, folder structures, service abstraction, and error bubble propagation, you MUST read [.claude/rules/architecture.md](file:///.claude/rules/architecture.md).
> - **Postgres & Database Changes**: For migration setups, query loop warnings, tenant scoping, and transaction wrap blocks, you MUST read [.claude/rules/database.md](file:///.claude/rules/database.md).
> - **Tooling & Commands**: For package manager standards (Bun), linting, and testing suites execution, you MUST read [.claude/rules/tech-stack.md](file:///.claude/rules/tech-stack.md).
> - **Senior & Staff PR Auditing**: Before requesting PR merge approvals, you MUST audit the implementation against [SENIOR_ISSUE_REVIEW_PROMPT.md](file:///docs/SENIOR_ISSUE_REVIEW_PROMPT.md) and [STAFF_PR_REVIEW_PROMPT.md](file:///docs/STAFF_PR_REVIEW_PROMPT.md).
> - **Forks, Clones & Environment Migrations**: Before auditing, planning, creating, running, migrating, or deploying a fork/clone/white-label instance, read and follow [.agents/skills/fork-isolation-safety/SKILL.md](file:///.agents/skills/fork-isolation-safety/SKILL.md). Fork quarantine forbids database, Supabase, MCP, migration, seed, backup, keep-alive, and deployment connections until target attestation and explicit authorization.

---

## 🛠️ GitHub CLI & Environment Rules (WSL Fish)
> [!CAUTION]
> **WSL FISH MANDATE FOR GITHUB CLI (`gh`)**:
> - GitHub CLI (`gh`) authentication, active tokens (`LeulTew`), and SSH keys reside ONLY inside the WSL Fish shell environment (`Ubuntu 24.04` / `fish`).
> - Host Windows `pwsh` is NOT authenticated with GitHub.
> - AI agents MUST ALWAYS execute all `gh` commands, GitHub API operations, issue workflows, and PR commands via WSL Fish using:
>   `wsl fish -c "gh <command>"` (e.g., `wsl fish -c "gh issue list"` or `wsl fish -c "gh pr status"`).
> - Never attempt to run `gh` directly from host Windows PowerShell.

> [!IMPORTANT]
> **MANDATORY GITHUB ISSUE CHECKLIST VERIFICATION & CLOSING BEFORE MERGE**:
> - Before merging any PR or declaring an issue complete, AI agents MUST view the GitHub issue body (`wsl fish -c "gh issue view <issue_number>"`).
> - Verify every acceptance criteria item (`[ ]`) line by line against authoritative code, unit tests, integration tests, and Playwright E2E coverage.
> - AI agents MUST edit the issue body (`wsl fish -c "gh issue edit <issue_number> --body '...'`") to tick off every completed item (`[x]`).
> - Once all acceptance criteria are verified 100% and the PR is merged into `main`, the AI agent MUST close the GitHub issue using `wsl fish -c "gh issue close <issue_number>"`.


