import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3200";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["student-import.spec.ts", "student-import-evidence.spec.ts"],
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/student-import-html", open: "never" }],
  ],
  outputDir: "test-results/student-import",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "tsx e2e/start-local-production.ts",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      E2E_DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      E2E_BASE_URL: baseURL,
    },
  },
});
