# Project Context — DreamLux ERP

> **Always-on context for every agent session.** Read this before making any changes.

---

## 1. Project Name & Purpose

**Name:** DreamLux ERP
**Platform:** Decoupled Web Application (Next.js Frontend & Express Backend)
**Purpose:** An integrated enterprise resource planning (ERP) system designed specifically for **Dream Lux PLC** (Addis Ababa, Ethiopia) to manage event decoration lifecycles, staff commission payrolls, inventory recounts, and event expense/profit reports.

**Environments:**
- **Development (dev)**: Local runtime (Next.js: `http://localhost:3000`, Express: `http://localhost:5000`, local postgres/Supabase DB connection)
- **Production (prod)**: Hosted on Vercel:
  - Frontend: `https://dreamlux-erp.vercel.app`
  - Backend: `https://dreamlux-backend.vercel.app`

---

## 2. Directory & File Structure

```
dreamlux-erp/
├── .agents/                    # AI agent config files
├── docs/                       # Project documentation, epics, stories & credentials
│   ├── BOARD.md                # Scrum project board mapping user stories
│   ├── TEST_CREDENTIALS.md     # Seeded credentials & RBAC test matrix
│   ├── issues/                 # Epic and story requirements specifications
│   └── ...                     # System Audit reports
├── backend/                    # Node.js + Express API backend
│   ├── vercel.json             # Vercel backend deployment config
│   ├── package.json            # Bun/npm package scripts & backend dependencies
│   └── src/
│       ├── db/                 # DB pool, schema definitions, and seed data scripts
│       │   ├── schema.sql      # Database schema (tables, RLS policies, constraints)
│       │   ├── seeds_dreamlux.sql  # Seed data matching SRD v1.0 specifications
│       │   └── migrations/     # SQL migration scripts (RLS, indexes, triggers)
│       ├── lib/                # Shared utilities & business logic services
│       │   ├── permissions.ts      # Permission catalogs and default role-slug maps
│       │   ├── permissions-db.ts   # Database-driven multi-role permission resolver
│       │   ├── permissions-cache.ts # In-memory user permission cache layer
│       │   └── payroll-generation.ts # Base pay & attended events commission calculator
│       ├── middleware/         # Express middleware
│       │   └── auth.ts         # JWT validation & permission slug access gating
│       └── routes/             # REST API endpoint routers
│           ├── auth.ts         # Login, /auth/me, /auth/permissions (RBAC metadata)
│           ├── employees.ts    # Employee profile updates & custom event commission rates
│           ├── assets.ts       # Store inventory items, photos, and event allocations
│           ├── history-lifecycle.ts # Stock recount sessions & discrepancies audit logs
│           ├── payroll.ts      # Monthly payroll runs, finalized snapshots, Zemen Bank letters
│           └── events/         # Modular event routes (profit, views, proposals, core)
├── frontend/                   # Next.js React frontend
│   ├── vercel.json             # Vercel frontend deployment config
│   ├── next.config.ts          # Next.config compiler parameters
│   └── src/
│       ├── app/                # Next.js App Router screen views
│       │   ├── page.tsx        # Central entry screen & routing dashboard shell
│       │   ├── globals.css     # Brand color tokens (obsidian, slate, gold oklch)
│       │   ├── login/          # User login screen view
│       │   ├── events/         # Event workspaces, saved views, and proposal intakes
│       │   ├── hr/             # Employee payroll runs, department configurations
│       │   ├── assets/         # Store inventory listings, recounts, reports
│       │   └── docs/           # Local system guidelines & documentation pages
│       ├── components/         # Reusable design system primitives
│       │   ├── NavBar.tsx      # Bilingual translation trigger & main top nav
│       │   ├── SearchDialog.tsx # Ctrl+K global search overlay dialog
│       │   ├── ImportWizard.tsx # 4-step CSV importer & column mapper wizard
│       │   └── ...             # Cards, Tables, Buttons, Sheets, Modals
│       ├── hooks/              # Custom React hooks
│       │   └── useLanguage.ts  # Immediate bilingual text translation trigger
│       ├── lib/                # Shared API clients & query configurations
│       └── utils/              # Client-side validation & calculations helpers
```

---

## 3. Modules & Features

| Module | Location | Purpose |
| :--- | :--- | :--- |
| **Authentication & RBAC** | `backend/src/routes/auth.ts`, `backend/src/middleware/auth.ts` | Handles JWT login, exposes `/auth/permissions` to resolve active user permission lists. Gates paths using granular slugs. |
| **Event Intake & Proposals** | `backend/src/routes/events/proposals.ts` | Allows users to submit, approve/reject, and convert intake proposals into live events idempotently. |
| **Saved Views** | `backend/src/routes/events/saved-views.ts` | Enables personal, role, or global custom grids with saved filters, columns, and sorts. |
| **Operational Workspace** | `backend/src/routes/events.ts` | Central view tracking checklist tasks, crew bookings, vehicle assignments, and inventory allocations. |
| **Logistics Overlap Triggers** | `backend/src/db/migrations/assignment_integrity.sql` | Enforces double-booking conflict checks at database layer using triggers and advisory locks. |
| **Fuel Tracking & Trips** | `backend/src/routes/events.ts` | Calculates fuel usage based on vehicle type distance logs; adds fuel costs to event expenses. |
| **Expense Review Queue** | `backend/src/routes/events.ts` | Queue for Accountant/Owner to approve or reject pending ad-hoc event expenses. |
| **Profit Analytics & KPIs** | `backend/src/routes/events/profit-reports.ts` | Computes revenue, approved expenses, and margins; exports to CSV/XLSX and prints reports. |
| **Inventory & Recounts** | `backend/src/routes/assets.ts`, `backend/src/routes/history-lifecycle.ts` | Catalogues items, tracks allocations, and registers audit-logged physical recounts. |
| **Payroll Runs** | `backend/src/routes/payroll.ts` | Builds payroll worksheets, base salaries, and event commissions; outputs Zemen Bank letters. |
| **Bilingual Localisation** | `frontend/src/hooks/useLanguage.ts` | Implements runtime English and Amharic language toggling across all screens. |

---

## 4. Key Technologies, Integrations & Data Flows

### Dependencies (key)
| Service/Package | Layer | Purpose |
| :--- | :--- | :--- |
| **Bun** | Runtime | App engine for local testing, tests running, and linting. |
| **Next.js** | Frontend | React framework with App Router routing structure. |
| **Express** | Backend | REST API server with JWT authentication. |
| **node-postgres (pg)** | Backend | Postgres client pool connection. |
| **Supabase** | Database | PostgreSQL database host. |
| **Zod** | Validation | Schema validation for CSV files, inputs, and payloads. |
| **React Query** | Frontend | Server state caching and refetching. |
| **Tailwind CSS** | Styling | Brand color systems, dark mode classes. |
| **Vitest / Jest** | Testing | Front/back unit tests. |

### Primary Data Flows

```
App Bootstrap
  └─ Load JWT from localStorage.getItem("token")
  └─ Fetch GET /auth/permissions
        ├─ Returns effective permission slugs (e.g. "events:write", "*")
        ├─ Returns user metadata and role context
        └─ Exposes hasPermission(slug) to gate UI elements

Event Completion & Commission Loop
  User flags event status as "Completed" (via PUT /events/:id)
  └─ Express starts PoolClient transaction
  └─ Queries event assignments: SELECT SUM(commission_amount) WHERE attended = true
  └─ Inserts pending "Labor" expense (Category: Labor, Description: "Auto-generated...")
  └─ Registers outcome in event_logs audit
  └─ Commits transaction. Lock prevents duplicate triggers

CSV Importer Path
  User uploads file in ImportWizard
  └─ Step 1: Parse CSV file locally
  └─ Step 1.5: Columns Matcher (maps DB fields to CSV headers, shows preview)
  └─ Step 2: Show parsed JSON preview
  └─ Step 3: Call POST /events/import/commit to insert records to database
```

### Database Schema & RLS Hardening
*   **Row-Level Security (RLS)** is enabled on all 40+ tables.
*   **Revoked Privileges**: Privileges are revoked on public schema from `anon` and `authenticated` roles (the ones used by Supabase's direct client libraries).
*   **Sole Gatekeeper**: The Express backend acts as the sole database accessor via a superuser pool connection, securing data from client-side direct access.

---

## 5. Actors & Roles

| Actor | Description | Interactions |
| :--- | :--- | :--- |
| **Owner / CEO** | Business owner, full system administrator. | Accesses financial dashboards, approves payroll, reviews expenses, manages roles. |
| **Operations Manager** | Manages crew assignments, logistics schedules, and event details. | Assigns staff and vehicles, manages event workflows, runs recounts. |
| **Accountant** | Performs financial entries, payroll confirmation, and expense reviews. | Approves event expenses, generates monthly payroll, exports bank letters. |
| **Event Manager** | Oversees on-site event execution. | Updates checklist items, logs ad-hoc expenses, views event crew assignments. |
| **Inventory Officer** | Manages warehouse stock counts and logistics allocations. | Adds inventory items, schedules recounts, allocates items to events. |
| **Driver** | Transports crew and materials. | Logs trip locations and distances to calculate fuel costs. |
| **Super Admin** | System administrator (username: `admin`). | Configures user accounts, role definitions, and permission matrices. |

---

## 6. GitHub Issue Intelligence

*   [x] **[DONE] Issue #1 (STORY-1)**: UI & Contrast Revamp. Warm-white/obsidian color scheme, elegant gold `#D4AF37` accents, minimal border radius, and WCAG AA contrast conformance.
*   [x] **[DONE] Issue #4**: Ctrl+K Global Search. Data-aware keyboard shortcut navigation.
*   [x] **[DONE] Issue #6 (FEAT-5)**: Amharic i18n Localization. Bilingual system pass.
*   [x] **[DONE] Issue #9**: Crew and vehicle scheduling with overlap conflict detection.
*   [x] **[DONE] Issue #10**: Event expenses, trips, fuel costing, and Accountant approval queue.
*   [x] **[DONE] Issue #11**: Event profitability reports and financial dashboards.
*   [x] **[DONE] Issue #12 (STORY)**: Event operations workspace, store allocations, and checklist.
*   [x] **[DONE] Issue #13**: Seeding SRD data and table field parity.
*   [x] **[DONE] Issue #20**: Event Workspace BOLA and middleware fixes.
*   [x] **[DONE] Issue #21**: UI stock display calculations and composite SQL index optimizations.
*   [x] **[DONE] Issue #24**: Dynamic Role-Permission Manager UI and middleware.
*   [x] **[DONE] Issue #31**: Database RLS hardening and assignment concurrency triggers.
*   [x] **[DONE] Issue #32**: Event completion commission and attendance payroll automation.
*   [x] **[DONE] Issue #33**: Advanced event proposals intake, filters, import/export, and profit reports.
*   [x] **[DONE] Issue #83 (STORY)**: Security posture status page with OWASP/CVE tracking. Redesigned /settings/security as a clean, plain-language, non-technical UI for Ethiopian business users. No jargon visible — friendly area names (Who Can Access What, Software Safety, Data Protection, etc.), traffic-light status cards, overall banner, KPI chips, Amharic i18n. 20/20 Vitest tests. Merged via PR #101 with all CI checks passing.
*   [x] **[DONE] Issue #85 (STORY)**: HR Dashboard for workforce, payroll, and staffing readiness. Theme-aware dashboard at `/hr` with KPI metric cards, payroll redaction gate, exception tables (Missing Bank/IDs/Contracts), click-to-edit drawer, Amharic i18n, empty/loading states, 15/15 Vitest tests. Merged via PR #100.
*   [ ] **[ACTIVE] Issue #2**: STORY-2: Core Event Lifecycle. Story remains open to track core lifecycle stages.
*   [ ] **[ACTIVE] Issue #25 (ux/system)**: Permission-Aware UI/UX Consistency & Access Polish. Gating buttons, links, and drawers dynamically based on `/auth/permissions`.

---

## 7. Known Issues & Notes

*   **LocalStorage JWT**: JWT is stored in `localStorage` as `token`. High-risk XSS vector.
*   **In-Memory Cache**: `permissions-cache.ts` Map is local to Node. Cannot scale horizontally without Redis sync.
*   **Monolithic Route File**: `events.ts` route file exceeds 2.6k lines. Needs refactoring.
*   **Bilingual local fallback**: Unrecognized translation keys default to English labels.
*   **WSL Fish Wildcard Expansion**: WSL runs the **fish shell**. Always wrap wildcards in single quotes or run commands via `bash -c` to prevent syntax expansion errors.
