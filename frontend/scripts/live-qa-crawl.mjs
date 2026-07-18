// Ad-hoc live-site QA crawler (not part of the app; run manually).
// Usage: node scripts/live-qa-crawl.mjs [baseUrl]
// Logs console errors, page errors, failed API calls, and visible error banners
// for every navigable route per role. Output: scripts/live-qa-report.json
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] || "https://dreamlux-erp.vercel.app";
const PASSWORD = "Password123";

const ROLE_ROUTES = {
  ceo: [
    "/", "/hr", "/insert", "/events", "/events/proposals", "/events/proposals/new",
    "/hr/event-types", "/hr/payments", "/hr/expenses/approve", "/hr/reports/profit",
    "/hr/finance/hisab", "/hr/finance/overheads", "/hr/finance/investments",
    "/hr/finance/net-profit", "/hr/finance/imports", "/hr/salary-levels",
    "/settings/departments", "/settings/positions", "/settings/offices",
    "/assets", "/assets/dashboard", "/assets/reports", "/assets/movements",
    "/fleet", "/notifications", "/report", "/report/employees", "/docs/guidelines",
  ],
  admin: ["/settings", "/settings/users", "/settings/permissions", "/assets/trash"],
  inv: ["/assets", "/assets/insert", "/assets/dispatch", "/assets/returns", "/assets/reconcile", "/assets/history"],
  ops: ["/events", "/events/proposals/new", "/hr", "/fleet"],
  acc: ["/hr/payments", "/hr/expenses/approve", "/hr/reports/profit", "/hr/finance/net-profit"],
  driver: ["/events", "/"],
  eventmgr: ["/events", "/events/proposals"],
};

const ERROR_TEXT_MARKERS = [
  "Workspace unavailable", "Something went wrong", "Application error",
  "Internal Server Error", "could not reach the server", "Unhandled Runtime Error",
  "This page could not be found", "minified react error",
];

const findings = [];

function record(role, route, kind, detail) {
  findings.push({ role, route, kind, detail: String(detail).slice(0, 500) });
  console.log(`[${role}] ${route} :: ${kind} :: ${String(detail).slice(0, 200)}`);
}

const browser = await chromium.launch({ headless: true });

const roleFilter = (process.env.QA_ROLES || "").split(",").filter(Boolean);
for (const [role, routes] of Object.entries(ROLE_ROUTES)) {
  if (roleFilter.length && !roleFilter.includes(role)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const consoleBuf = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") consoleBuf.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleBuf.push(`pageerror: ${err.message}`));
  page.on("response", (resp) => {
    const s = resp.status();
    if (s >= 400 && !resp.url().includes("favicon")) consoleBuf.push(`http ${s}: ${resp.request().method()} ${resp.url()}`);
  });

  // Login
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500); // let hydration finish before typing
    await page.getByPlaceholder("admin").fill(role);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    consoleBuf.length = 0;
    const submit = page.locator("button[type=submit]").first();
    await submit.click({ timeout: 15000 }).catch(async () => {
      // Disabled-button hydration flake: retype and retry once.
      await page.getByPlaceholder("admin").fill(role);
      await page.getByPlaceholder("••••••••").fill(PASSWORD);
      await submit.click({ timeout: 30000 });
    });
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  } catch (e) {
    record(role, "/login", "LOGIN_FAILED", e.message);
    for (const line of consoleBuf) record(role, "/login", "console", line);
    await ctx.close();
    continue;
  }
  for (const line of consoleBuf.splice(0)) record(role, "/login", "console", line);

  for (const route of routes) {
    consoleBuf.length = 0;
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(2500);
    } catch (e) {
      record(role, route, "NAV_TIMEOUT", e.message);
    }
    const body = (await page.textContent("body").catch(() => "")) || "";
    for (const marker of ERROR_TEXT_MARKERS) {
      if (body.includes(marker)) record(role, route, "VISIBLE_ERROR", marker);
    }
    const seen = new Set();
    for (const line of consoleBuf.splice(0)) {
      if (seen.has(line)) continue;
      seen.add(line);
      record(role, route, "console", line);
    }
  }
  await ctx.close();
}

await browser.close();
const outName = roleFilter.length ? `./live-qa-report-${roleFilter.join("-")}.json` : "./live-qa-report.json";
writeFileSync(new URL(outName, import.meta.url), JSON.stringify(findings, null, 2));
console.log(`\nTOTAL FINDINGS: ${findings.length}`);
