# DreamLux ERP – Project Context Knowledge Base

## Table of Contents
- [Overview](#overview)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Database Schema](#database-schema)
- [Codebase Overview](#codebase-overview)
- [Key Modules](#key-modules)
- [GitHub Issues & Pull Requests](#github-issues--pull-requests)
- [Documentation & Assets](#documentation--assets)
- [Deployment & Operations](#deployment--operations)
- [Rules & Maintenance](#rules--maintenance)

---

## Overview
*Brief description of the DreamLux ERP system, its purpose, and primary stakeholders.*

## Architecture & Tech Stack
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS v4, TanStack Table
- **Backend**: Express, TypeScript, Bun runtime
- **Database**: PostgreSQL (Supabase hosted)
- **Storage**: Supabase Storage (S3‑compatible)
- **Deploy**: Vercel (frontend + backend), Supabase (DB)

## Database Schema
*See `backend/src/db/schema.sql` for full definitions. Key tables include `users`, `roles`, `permissions`, `role_permissions`, `expenses`, `vehicles`, etc.*

## Codebase Overview
- **Backend (`backend/src`)**: API routes, middleware (`auth.ts`), permission utilities, DB migrations.
- **Frontend (`frontend/src`)**: UI components, pages, app layout, state management.
- **Shared Docs (`docs/`)**: Issue tracking, design docs, code audit reports.

## Key Modules
- **Authentication & Authorization** – `middleware/auth.ts`, `lib/permissions.ts`
- **Event Management** – routes under `backend/src/routes/events/`
- **Payroll & HR** – modules under `backend/src/routes/payroll/`
- **Inventory** – modules under `backend/src/routes/inventory/`

## GitHub Issues & Pull Requests
*Generated automatically – includes titles, statuses, and key discussion points for all open and closed items.*

## Documentation & Assets
- `README.md`
- `PRODUCT.md`
- `AGENTS.md`
- `RULES.md`
- Architecture diagrams (generated assets will be placed in the `artifacts/` folder).

## Deployment & Operations
Instructions from `DEPLOYMENT_DEMO.md` and scripts in `scripts/`.

## Rules & Maintenance
- **Keep this file up‑to‑date**: Whenever major code, schema, or design changes occur, update the relevant sections.
- See `frontend/RULES.md` for contributor guidelines.

---

*This file is intended as a living knowledge base for AI agents and developers.*
