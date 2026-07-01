# DreamLux ERP

**Professional Enterprise Resource Planning System for Dream Lux PLC (Addis Ababa, Ethiopia)**

An integrated enterprise resource planning (ERP) system designed to manage event decoration lifecycles, staff commission payrolls, inventory recounts, logistics coordination, and financial analytics.

---

## Brand Theme & Aesthetics

DreamLux ERP follows a premium, high-end visual design system:
- **Light Mode**: Warm-white background with polished elegant gold accents (`#D4AF37`).
- **Dark Mode**: Deep charcoal backdrop with high-contrast borders and gold highlights.
- **Micro-Animations & Physics**: Spring-physics transitions and responsive mobile sheets.
- **Geometric Radius**: Compact minimal radii (`rounded-xl` or `8px` max) with solid high-contrast borders rather than blurred shadows.

---

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, TanStack Query (React Query)
- **Backend**: Express.js REST API, TypeScript, Bun Runtime
- **Database**: PostgreSQL (Supabase Hosted)
- **Storage**: Supabase Storage (S3-compatible bucket)
- **Deployment**: Vercel (Frontend & Backend), Supabase (PostgreSQL)

---

## Setup & Local Development

Always use **Bun** (`bun`) as the sole package manager and runner.

### 1. Install Dependencies
Run from the repository root:
```bash
bun install
```

### 2. Configure Environment Variables
Copy the templates and configure your secrets:
```bash
# In root or backend folder
cp .env.example backend/.env

# In frontend folder
# Set NEXT_PUBLIC_API_URL in frontend/.env.local (default: http://localhost:4000)
```

### 3. Run Database Migrations
Deploy your postgres tables, schemas, triggers, and seed datasets:
```bash
bun run db:migrate
```

### 4. Start Local Development Servers
Run frontend and backend simultaneously:
```bash
# Start backend (port 4000) and frontend (port 3000)
bun run dev
```
Alternatively:
```bash
# Start separately
bun run dev:backend   # -> http://localhost:4000
bun run dev:frontend  # -> http://localhost:3000
```

---

## 🔑 Seeded Test Credentials

The default password for all seeded test accounts is **`Password123`** (case-sensitive).

| Username | Role | Full Name | Associated Email | Scope / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`ceo`** | `OWNER` | Dream Lux CEO | `owner@dreamlux.com` | Full system access, financials, and payroll approvals. |
| **`ops`** | `OPS_MANAGER` | Operations Manager | `ops@dreamlux.com` | Task checklists, crew scheduling, and logistics setup. |
| **`acc`** | `ACCOUNTANT` | Senior Accountant | `accountant@dreamlux.com` | Expense approvals, profit dashboards, and payroll runs. |
| **`eventmgr`** | `EVENT_MANAGER` | Event Manager | `events@dreamlux.com` | Event workflows, checklist items, and lodging expenses. |
| **`inv`** | `INVENTORY_OFFICER` | Inventory Officer | `store@dreamlux.com` | Warehouse inventory catalog, recounts, and allocations. |
| **`driver`** | `DRIVER` | Selam Bekele | `selam@dreamlux.com` | View assigned trips and log vehicle distance logs. |
| **`admin`** | `SUPER_ADMIN` | System Administrator | `admin@local.erp` | Configuration of users, roles, and security permissions. |

---

## 🧪 Testing and Verification

Ensure all tests compile and execute cleanly before making pull requests.

### Backend Unit & Integration Tests
```bash
cd backend
bun test
```

### Frontend Vitest Unit Tests
```bash
cd frontend
bun run test
```

### End-to-End Playwright Tests
Ensure the development servers are running before starting Playwright:
```bash
cd frontend
bunx playwright test
```

---

## 🚀 Deployment & Guidelines

- For step-by-step deployment steps, check [DEPLOYMENT_DEMO.md](./DEPLOYMENT_DEMO.md).
- Follow all development standards in [AGENTS.md](./AGENTS.md) and style configurations.
