# EL ERP

**Professional enterprise resource planning — HR, Payroll & Inventory**

Built by Leul (Dev) & Elias (Business). This is the demo system used for client showcases.

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS v4, TanStack Table
- **Backend**: Express, TypeScript, Bun runtime
- **Database**: PostgreSQL (Supabase hosted)
- **Storage**: Supabase Storage (S3-compatible)
- **Deploy**: Vercel (frontend + backend), Supabase (DB)

## Setup (Local Development)

```bash
# 1. Install all dependencies
bun run install:all

# 2. Copy and fill env vars
cp .env.example backend/.env
# Set NEXT_PUBLIC_API_URL in frontend/.env.local

# 3. Run DB migrations
bun run migrate

# 4. Start dev servers
bun run dev:backend   # → http://localhost:4000
bun run dev:frontend  # → http://localhost:3000
```

## Demo Credentials

| Role        | Username  | Password    | Email                |
|-------------|-----------|-------------|----------------------|
| Super Admin | `admin`   | `admin123`  | `admin@el-erp.com`   |
| Manager     | `manager` | `manager123`| `manager@el-erp.com` |

## Deployment

See [DEPLOYMENT_DEMO.md](./DEPLOYMENT_DEMO.md) for the full Vercel + Supabase deployment guide.

Quick deploy: `bash scripts/deploy-demo.sh`

## Agent Instructions

See [AGENTS.md](./AGENTS.md) for the Antigravity 2.0 agent playbook for this repository.
