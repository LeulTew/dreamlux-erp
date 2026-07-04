# Dependency Audit Report

This report outlines the plan and audit results verifying that development utilities like `playwright` and other dev tools are isolated from production builds.

## Dependency Isolation Status

### 1. Dev-Only Tools Verification
The following tools are successfully isolated in `devDependencies` within the frontend setup:
* `@playwright/test`: Used strictly for local and CI/CD end-to-end integration flows.
* `vitest` / `@testing-library/react` / `@testing-library/jest-dom`: Utilized only for unit and UI regression validations.
* `msw`: Used for API mocking in test environments.
* `eslint` / `typescript`: Linter and type compilers.

### 2. Next.js Production Build Validation
Next.js production bundles (generated via `next build`) leverage tree-shaking and module boundary isolation. Test files (`*.test.tsx`, `*.spec.ts`, and the `e2e/` folder) are completely omitted from production code compilation.

## Audit Actions
1. **CI Verification**: Ensure CI build runner commands run with `NODE_ENV=production` or matching flags to verify devDependencies do not pollute compiled output.
2. **Build Size Control**: Regularly run dependency audits and visualizers to detect any accidental inclusion of heavy dev libs into page bundles.
