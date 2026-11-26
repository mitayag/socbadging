import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.STAGEH_BASE_URL ?? "https://socbadging.hausoc.org";

export default defineConfig({
  testDir: "./e2e/production",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { outputFolder: "test-results/stageh-html", open: "never" }]],
  outputDir: "test-results/stageh",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
