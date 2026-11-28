import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

type Credentials = {
  admin: { email: string; password: string };
  stage7?: {
    facultyA: { email: string; password: string };
    studentA: { email: string; password: string };
    classA: { id: string; courseCode: string };
  };
};

function load(): Credentials | null {
  const path = process.env.STAGEH_CREDENTIALS_FILE;
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Credentials;
}

const credentials = load();
const stage7 = credentials?.stage7;
const evidenceDir = resolve(process.cwd(), "docs/evidence/stage7-release1c");
mkdirSync(evidenceDir, { recursive: true });

async function login(page: Page, email: string, password: string, target: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(target, { timeout: 20_000 });
}

test.describe("Stage 7 production evidence", () => {
  test.skip(!stage7 || !credentials, "Stage 7 credentials are not configured");

  test("captures catalog, library, class assignment, audit and student portal", async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    await login(page, credentials!.admin.email, credentials!.admin.password, /\/dashboard$/);
    await page.goto(`/catalog?q=${encodeURIComponent(stage7!.classA.courseCode)}`);
    await expect(
      page.getByRole("row", { name: new RegExp(stage7!.classA.courseCode) }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDir, `catalog-${project}.png`),
      fullPage: true,
    });

    await page.goto("/library?q=STAGE7%20E2E");
    await expect(page.getByText(/STAGE7 E2E/).first()).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDir, `badge-library-${project}.png`),
      fullPage: true,
    });

    await page.goto("/audit-logs");
    await page.getByLabel("Search audit logs").fill("badge");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDir, `audit-log-${project}.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: /Open user menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });

    await login(page, stage7!.facultyA.email, stage7!.facultyA.password, /\/dashboard$/);
    await page.goto(`/classes/${stage7!.classA.id}/badges`);
    await expect(page.getByText("Shared Badge Assignments")).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDir, `class-shared-assignments-${project}.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: /Open user menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });

    await login(page, stage7!.studentA.email, stage7!.studentA.password, /\/student$/);
    await expect(page.getByText("Student Overview")).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDir, `student-portal-${project}.png`),
      fullPage: true,
    });
  });
});
