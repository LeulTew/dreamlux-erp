import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import navigationConfig from "./playwright.navigation.config";

export default defineConfig({
  ...navigationConfig,
  testMatch: "issue225-proposal-clone.spec.ts",
  reporter: [["list"], ["json", { outputFile: path.join("test-results", "proposal-clone-results.json") }]],
  projects: [
    {
      name: "clone-desktop",
      use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : undefined) },
    },
    {
      name: "clone-mobile",
      use: { ...devices["Pixel 5"], channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : undefined) },
    },
  ],
});
