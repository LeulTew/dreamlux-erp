#!/usr/bin/env bash
# ============================================================
# EL ERP Demo — Deployment Helper Script
# ============================================================
# Usage: bash scripts/deploy-demo.sh
# Requires: Vercel CLI (npx vercel), Bun, a Supabase project
# ============================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
section() { echo -e "\n${BOLD}── $1 ──${NC}"; }

section "EL ERP Demo Deployment"
echo "This script deploys the EL ERP demo to Vercel (frontend + backend)"
echo "using a separate Supabase instance from production."
echo ""
warn "Ensure you have created a NEW Supabase project for this demo."
warn "DO NOT use any production credentials."
echo ""

# ── Preflight checks ──────────────────────────────────────
section "Preflight"

command -v bun >/dev/null 2>&1 || fail "bun is not installed. Install from https://bun.sh"
command -v npx >/dev/null 2>&1 || fail "npx is not installed. Install Node.js from https://nodejs.org"
log "Runtime dependencies found"

# ── Collect env vars ──────────────────────────────────────
section "Environment Setup"

read -rp "Supabase DATABASE_URL (postgres://...): " DATABASE_URL
read -rp "Supabase project URL (https://xxx.supabase.co): " SUPABASE_URL
read -rp "Supabase service_role key: " SUPABASE_SERVICE_ROLE_KEY
read -rp "JWT Secret (generate with: openssl rand -base64 32): " JWT_SECRET
read -rp "Admin password for demo [default: admin123]: " ADMIN_PASSWORD
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
read -rp "Frontend URL (e.g. https://el-erp.vercel.app) [leave blank to set after frontend deploy]: " FRONTEND_URL
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

# ── Install dependencies ───────────────────────────────────
section "Installing Dependencies"
bun run install:all
log "Dependencies installed"

# ── Run migrations ─────────────────────────────────────────
section "Database Migrations"
DATABASE_URL="$DATABASE_URL" bun run migrate
log "Migrations complete"

# ── Deploy Backend ─────────────────────────────────────────
section "Deploying Backend"
echo "Linking backend to a NEW Vercel project..."
cd backend
npx vercel link --yes
npx vercel env add DATABASE_URL production <<< "$DATABASE_URL"
npx vercel env add SUPABASE_URL production <<< "$SUPABASE_URL"
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production <<< "$SUPABASE_SERVICE_ROLE_KEY"
npx vercel env add JWT_SECRET production <<< "$JWT_SECRET"
npx vercel env add ADMIN_PASSWORD production <<< "$ADMIN_PASSWORD"
npx vercel env add FRONTEND_URL production <<< "$FRONTEND_URL"
npx vercel env add ALLOWED_ORIGINS production <<< "$FRONTEND_URL"
BACKEND_URL=$(npx vercel --prod --yes 2>&1 | grep -oP 'https://[^\s]+' | tail -1)
log "Backend deployed: $BACKEND_URL"
cd ..

# ── Deploy Frontend ────────────────────────────────────────
section "Deploying Frontend"
echo "Linking frontend to a NEW Vercel project..."
cd frontend
npx vercel link --yes
npx vercel env add NEXT_PUBLIC_API_URL production <<< "$BACKEND_URL"
FRONTEND_URL=$(npx vercel --prod --yes 2>&1 | grep -oP 'https://[^\s]+' | tail -1)
log "Frontend deployed: $FRONTEND_URL"
cd ..

# ── Summary ────────────────────────────────────────────────
section "Deployment Complete"
echo ""
echo -e "  ${BOLD}Frontend:${NC} $FRONTEND_URL"
echo -e "  ${BOLD}Backend:${NC}  $BACKEND_URL"
echo ""
echo -e "  ${BOLD}Demo credentials:${NC}"
echo -e "  Username: admin       Password: $ADMIN_PASSWORD"
echo -e "  Username: manager     Password: manager123"
echo ""
warn "Remember to update the backend's FRONTEND_URL and ALLOWED_ORIGINS env vars"
warn "in Vercel dashboard to point to: $FRONTEND_URL"
echo ""
log "Done! Share the frontend URL with potential clients."
