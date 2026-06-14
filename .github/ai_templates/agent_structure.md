# Codebase Structure Rules

This document outlines the strict directory and modular structure rules for the Dream Lux ERP. All AI agents and developers must adhere to these layout standards when creating or refactoring files.

---

## 1. Directory Structure Map

The repository is organized into a modular frontend-backend split:

```
dreamlux-erp/
├── frontend/                  # Next.js web application
│   ├── src/
│   │   ├── app/               # App Router pages (dashboards, HR, inventory, settings)
│   │   ├── components/        # Reusable UI components (NavBar, cards, modals)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utility functions and API client definitions
│   │   └── utils/             # Helper formatters and checkers
│   ├── public/                # Static assets (images, logos)
│   ├── package.json           # Frontend configuration (Bun-compatible)
│   └── tsconfig.json          # TypeScript configurations
├── backend/                   # Node/Express Express backend API
│   ├── src/
│   │   ├── db/                # PostgreSQL client, schema.sql, migrations, seeds
│   │   │   ├── schema.sql     # Database schema definitions
│   │   │   └── migrations/    # Individual SQL migration scripts
│   │   ├── routes/            # Express endpoint routers (auth, employees, events, expenses)
│   │   ├── middleware/        # Authentication and authorization guards (RBAC)
│   │   ├── lib/               # Service wrappers (S3 adapters, exports)
│   │   └── index.ts           # Express server bootstrap
│   ├── package.json           # Backend package definitions
│   └── tsconfig.json          # TypeScript configurations
└── .github/
    ├── ISSUE_TEMPLATE/        # Issue definitions
    ├── ai_templates/          # AI Agent execution rules (this directory)
    └── PULL_REQUEST_TEMPLATE.md # PR templates
```

---

## 2. File Organization Rules

- **Clean API Separation**: All frontend data fetching must use the API clients defined in `frontend/src/lib/api.ts` (using React Query/TanStack Query). Avoid direct API calls or fetch invocations inside page components.
- **RBAC Enforcement**: All backend routes must enforce role-based access checks through middleware. Sensitive financial metrics must only be accessible by the `Owner/CEO` and `Accountant`.
- **Database Safety**: Never run database queries directly in endpoint logic. Database pools must be imported from `backend/src/db/pool.ts`.

---

## 3. TypeScript & Code Standards

- **Strict Mode**: `strict: true` must be enabled. Do not use the `any` type under any circumstance. Define interfaces or types for all API inputs, DB outputs, and component props.
- **File Naming Conventions**:
  - React components: PascalCase (e.g. `EventDetailModal.tsx`).
  - Logic/APIs/utils: camelCase or kebab-case (e.g. `apiClient.ts`, `date-utils.ts`).
  - Schema/Migration: lowercase with underscores (e.g. `migrate_v4_events.sql`).

---

## 4. Testing & Verification Rules

- **Unit Tests**: Place tests adjacent to the file they are testing using the `.test.ts` or `.spec.ts` suffix (e.g., `payroll.test.ts` next to `payroll.ts`).
- **Dry-run Database Migrations**: Before deploying schema changes, verify SQL scripts locally using Bun to ensure indexes and constraints resolve without conflicts.

