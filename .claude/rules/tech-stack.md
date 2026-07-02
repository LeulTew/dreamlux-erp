# Technical Stack & CLI Tooling Rules

These rules apply when installing dependencies, running local servers, linting, executing tests, or applying migrations.

---

## 1. Package Manager Constraints
- **Strict Bun Enforcement**: Always use **Bun** (`bun`) as the exclusive package manager. Do not use `npm` or `yarn`. 
- **PNPM Exception**: Use `pnpm` only as a secondary last resort if Bun fails under specific node native compatibility errors.

---

## 2. Command Execution Patterns
- **Task Running**: Always run project tasks, hooks, and linters through Bun:
  - `bun run dev` (run the development environment)
  - `bun run build` (trigger Next.js or Elysia compiling)
  - `bun run lint` (run project-wide eslint and code-style tests)
  - `bun run test` / `bun test` (execute unit/integration test suites)
  - `bun run test:e2e` (execute Playwright integration flows)
- **CI / Static Checks**: Ensure that static checks (linting, type checking) are run at the project root before final E2E test runs to prevent test failures from syntax/compilation issues.
