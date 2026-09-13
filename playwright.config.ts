import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // The public rate limiter is intentionally process-global. Keep projects
  // sequential so their shared disposable fixture remains deterministic.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: testDatabaseUrl
    ? {
        command: "tsx e2e/start-phase8-server.ts",
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        env: { ...process.env, TEST_DATABASE_URL: testDatabaseUrl },
      }
    : undefined,
});
