import { defineConfig, devices } from "@playwright/test";

// Start an owned frontend on this port; every API response is synthetic in the spec.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "issue234-drawer-lifecycle.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3234",
    serviceWorkers: "block",
    trace: "on",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "drawer-desktop", use: {
      ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 },
      channel: process.platform === "win32" ? "msedge" : undefined,
      contextOptions: { reducedMotion: "no-preference" },
    } },
    { name: "drawer-mobile", use: {
      ...devices["Pixel 5"], viewport: { width: 390, height: 844 },
      channel: process.platform === "win32" ? "msedge" : undefined,
      contextOptions: { reducedMotion: "reduce" },
    } },
  ],
});
