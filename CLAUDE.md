# Claude Code Gateway & Rules Register for DreamLux ERP

Welcome! This repository uses a modular gateway-driven rules structure. Claude Code loads this gateway file at the beginning of each session to route execution context to the relevant standards.

---

## 1. Project Overview & Tech Stack
DreamLux ERP is an integrated enterprise resource planning system managing event decoration lifecycles, staff commissions, inventory recounts, logistics, and financial analytics.

*   **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
*   **Backend**: Bun, Elysia, Postgres (Supabase integration)
*   **Package Manager**: Bun (`bun` only)
*   **Tests**: Vitest (unit/integration), Playwright (E2E)

---

## 2. Command Reference

| Action | Command |
| :--- | :--- |
| **Install Dependencies** | `bun install` |
| **Run Dev Server (Frontend)**| `bun run dev` (inside `frontend/`) |
| **Run Dev Server (Backend)** | `bun run dev` (inside `backend/`) |
| **Run Linter** | `bun run lint` (root) |
| **Run Unit/Integration** | `bun run test` (frontend/backend) |
| **Run E2E Tests** | `bun run test:e2e` (inside `frontend/`) |
| **Build Frontend** | `bun run build:frontend` |
| **Build Backend** | `bun run build` (inside `backend/`) |
| **GitHub CLI (`gh`)** | `wsl fish -c "gh <command>"` (authenticated under `LeulTew` in WSL Fish) |

---

## 3. Rules Register (Gateway Index)

> [!IMPORTANT]
> **READING AND FOLLOWING THESE MODULAR RULES IS MANDATORY & NOT OPTIONAL.**
> Before starting any coding task, staging commits, designing UI, or updating the database, you MUST load and adhere to the relevant rule files in `.claude/rules/`:
>
> - **General Development & Tasks**: Start by reading [.claude/rules/workflow.md](file:///.claude/rules/workflow.md) to align on task pipelines, issue assignment, and branching.
> - **Git Commits & Pull Requests**: Before staging, committing, pushing, or requesting review/merges, read [.claude/rules/git.md](file:///.claude/rules/git.md).
> - **Frontend / UI Development**: When modifying styling, layouts, components, or typography, read [.claude/rules/ui-design.md](file:///.claude/rules/ui-design.md).
> - **System Architecture & Refactoring**: When designing components, services, or abstractions, read [.claude/rules/architecture.md](file:///.claude/rules/architecture.md).
> - **Postgres & Database Changes**: When writing database operations, schema updates, or applying migrations, read [.claude/rules/database.md](file:///.claude/rules/database.md).
> - **Tooling & Commands**: For dependency management and scripting, read [.claude/rules/tech-stack.md](file:///.claude/rules/tech-stack.md).
> - **Senior & Staff PR Auditing**: Before finalizing, creating, or requesting approval on a PR, you MUST audit against [SENIOR_ISSUE_REVIEW_PROMPT.md](file:///docs/SENIOR_ISSUE_REVIEW_PROMPT.md) and [STAFF_PR_REVIEW_PROMPT.md](file:///docs/STAFF_PR_REVIEW_PROMPT.md).
> - **GitHub CLI Environment**: GitHub CLI (`gh`) authentication (`LeulTew`) is configured in WSL Fish (`Ubuntu 24.04` / `fish`). Always execute `gh` commands via `wsl fish -c "gh <command>"`. Never invoke host Windows `gh` directly.


