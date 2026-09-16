import { defineConfig, devices } from "@playwright/test";
import { isAbsolute } from "node:path";
import { payrollSystemEnvironment } from "./payroll-qa-environment";

for (const name of ["DREAMLUX_NATIVE_BROWSER_DESCRIPTOR", "DREAMLUX_PAYROLL_CONTROL_SCRIPT", "DREAMLUX_BUN_PATH", "DREAMLUX_PAYROLL_BROWSER_REPORT", "DREAMLUX_PAYROLL_BROWSER_OUTPUT"]) {
  const value = process.env[name];
  if (!value || !isAbsolute(value)) throw new Error(`Payroll browser QA requires an explicit absolute ${name}`);
}
if (process.env.DREAMLUX_E2E_BASELINE || process.env.DREAMLUX_NATIVE_USE_BASELINE) {
  throw new Error("Current payroll verification must not select the historical baseline");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "issue239-payroll-native.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  globalTimeout: 120_000,
  expect: { timeout: 7_500 },
  reporter: [["json", { outputFile: process.env.DREAMLUX_PAYROLL_BROWSER_REPORT }]],
  outputDir: process.env.DREAMLUX_PAYROLL_BROWSER_OUTPUT,
  use: {
    baseURL: "http://127.0.0.1:3126",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    launchOptions: { env: payrollSystemEnvironment(process.env) },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.platform === "win32" ? { channel: "msedge" } : {}),
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        ...(process.platform === "win32" ? { channel: "msedge" } : {}),
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
