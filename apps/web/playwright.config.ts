import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "../..");
const browserChannel = process.env["PLAYWRIGHT_BROWSER_CHANNEL"];

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
    },
  },
  forbidOnly: Boolean(process.env["CI"]),
  fullyParallel: false,
  outputDir: path.join(repoRoot, "test-results", "playwright"),
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        channel: browserChannel,
        viewport: { height: 900, width: 1440 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        channel: browserChannel,
        deviceScaleFactor: 1,
        isMobile: true,
        viewport: { height: 844, width: 390 },
      },
    },
  ],
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.join(repoRoot, "playwright-report"),
      },
    ],
  ],
  retries: process.env["CI"] ? 1 : 0,
  snapshotPathTemplate: path.join(
    webRoot,
    "e2e",
    "__screenshots__",
    "{testFilePath}",
    "{projectName}",
    "{arg}{ext}",
  ),
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    colorScheme: "light",
    locale: "en-US",
    trace: "retain-on-first-failure",
  },
  webServer: {
    command: "corepack pnpm --filter @relationship/web dev:quality",
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3100",
  },
  workers: 1,
});
