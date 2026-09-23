import { defineConfig, devices } from "@playwright/test";
import { isAbsolute } from "node:path";
import { payrollSystemEnvironment } from "./payroll-qa-environment";

for (const name of [
  "DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR", "DREAMLUX_EQUIPMENT_CONTROL_SCRIPT", "DREAMLUX_EQUIPMENT_RETURN_CONTROL_SCRIPT",
  "DREAMLUX_EQUIPMENT_CONDITION_CONTROL_SCRIPT",
  "DREAMLUX_BUN_PATH", "DREAMLUX_EQUIPMENT_BROWSER_REPORT", "DREAMLUX_EQUIPMENT_BROWSER_OUTPUT",
]) {
  const value = process.env[name];
  if (!value || !isAbsolute(value)) {
    throw new Error(`Equipment browser QA requires an explicit absolute ${name}`);
  }
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["issue259-equipment-deletion.spec.ts", "issue259-equipment-native.spec.ts", "issue273-return-correction-native.spec.ts", "issue279-condition-stock-native.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  globalTimeout: 120_000,
  expect: { timeout: 7_500 },
  reporter: [["json", { outputFile: process.env.DREAMLUX_EQUIPMENT_BROWSER_REPORT }]],
  outputDir: process.env.DREAMLUX_EQUIPMENT_BROWSER_OUTPUT,
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
      use: { ...devices["Desktop Chrome"], ...(process.platform === "win32" ? { channel: "msedge" } : {}), viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], ...(process.platform === "win32" ? { channel: "msedge" } : {}), viewport: { width: 390, height: 844 } },
    },
  ],
});
