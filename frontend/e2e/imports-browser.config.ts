import { defineConfig, devices } from "@playwright/test";
import { isAbsolute } from "node:path";
import { payrollSystemEnvironment } from "../payroll-qa-environment";

const report = process.env.DREAMLUX_IMPORT_BROWSER_REPORT;
const output = process.env.DREAMLUX_IMPORT_BROWSER_OUTPUT;
if (!report || !output || !isAbsolute(report) || !isAbsolute(output)) {
  throw new Error("Import browser verification requires explicit private report/output paths");
}

export default defineConfig({
  testDir: ".",
  testMatch: ["issue113-imports.spec.ts", "issue261-formula-imports.spec.ts"],
  fullyParallel: true,
  workers: 2,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  globalTimeout: 60_000,
  expect: { timeout: 7_500 },
  reporter: [["json", { outputFile: report }]],
  outputDir: output,
  use: {
    baseURL: "http://127.0.0.1:3261",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    launchOptions: { env: payrollSystemEnvironment(process.env) },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.platform === "win32" ? { channel: "msedge" } : {}), viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"], ...(process.platform === "win32" ? { channel: "msedge" } : {}), viewport: { width: 390, height: 844 } } },
  ],
});
