import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./test-base";

type Fixture = Record<
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_NON_OWNER_EMAIL"
  | "E2E_NON_OWNER_PASSWORD",
  string
>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;

const suffix = `${Date.now()}`.slice(-7);
const courseCode = `S7-${suffix}`;
const courseTitle = `Stage 7 Shared Badge ${suffix}`;
const badgeName = `Prelim Skills ${suffix}`;
const artwork = resolve(process.cwd(), "public/images/hausoclogo.png");
const evidenceDir = resolve(process.cwd(), "docs/evidence/stage7-release1");
mkdirSync(evidenceDir, { recursive: true });

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

async function createClass(page: Page, section: string) {
  await page.goto("/classes");
  const panel = page.locator("details", { hasText: "Create Class" });
  await panel.locator("summary").click();
  await panel.getByLabel("Course Code").fill(courseCode);
  await panel.getByLabel("Class Title").fill(courseTitle);
  await panel.getByLabel("Section").fill(section);
  await panel.getByLabel("Term").fill("First Semester");
  await panel.getByLabel("Academic Year").fill("2026-2027");
  await panel.getByRole("button", { name: "Create Class" }).click();
  await expect(page.getByText("Class created successfully.")).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(section) }).first();
  const roster = row.getByRole("link", { name: /Open roster for/ });
  const href = await roster.getAttribute("href");
  if (!href) throw new Error("Class roster link was not rendered");
  const classId = href.split("/")[2];
  if (!classId) throw new Error("Class roster link did not contain a class id");
  return classId;
}

async function mapCourse(page: Page, classId: string) {
  await page.goto(`/classes/${classId}/settings`);
  await page.getByLabel("Catalog Course").selectOption({ label: `${courseCode} · ${courseTitle}` });
  await page.getByRole("button", { name: "Save Course Mapping" }).click();
  await expect(page.getByText("Course mapping updated.")).toBeVisible();
}

async function assignSharedBadge(page: Page, classId: string) {
  await page.goto(`/classes/${classId}/badges`);
  const panel = page.locator("details", { hasText: "Assign an Approved Badge" });
  await panel.locator("summary").click();
  const option = panel.getByRole("option", { name: new RegExp(badgeName) });
  const value = await option.getAttribute("value");
  if (!value) throw new Error("Approved badge option was not rendered");
  await panel.getByLabel("Approved Badge").selectOption(value);
  await panel.getByRole("button", { name: "Assign Badge" }).click();
  await expect(page.getByText("Approved badge assigned to this class.")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(badgeName) })).toBeVisible();
}

test.describe.serial("Stage 7 shared badge library", () => {
  test("administrator creates a standardized course and approves a shared badge", async ({
    page,
  }) => {
    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);

    await page.goto("/catalog");
    const coursePanel = page.locator("details", { hasText: "Create Course" });
    await coursePanel.locator("summary").click();
    await coursePanel.getByLabel("Course Code").fill(courseCode);
    await coursePanel.getByLabel("Course Title").fill(courseTitle);
    await coursePanel.getByLabel("Description").fill("Stage 7 end-to-end shared badge course");
    await coursePanel.getByLabel(/Academic Programs/).fill("BS Computer Science");
    await coursePanel.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("Course created successfully.")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(courseCode) })).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, "course-catalog.png"), fullPage: true });

    await page.goto("/library");
    const badgePanel = page.locator("details", { hasText: "Create Badge Definition" });
    await badgePanel.locator("summary").click();
    await badgePanel
      .getByLabel("Associated Course")
      .selectOption({ label: `${courseCode} · ${courseTitle}` });
    await badgePanel.getByLabel("Badge Name").fill(badgeName);
    await badgePanel.getByLabel("Grading Period").fill("Prelim");
    await badgePanel.getByLabel("Description").fill("Foundational application development skills");
    await badgePanel.getByLabel("Competencies").fill("Debugging, testing, version control");
    await badgePanel.getByLabel("Assessment Criteria").fill("Build and test a working application");
    await badgePanel.getByLabel(/Badge Artwork/).setInputFiles(artwork);
    await badgePanel.getByRole("button", { name: "Create Badge" }).click();
    await expect(page.getByRole("heading", { name: badgeName })).toBeVisible();

    await page.getByRole("button", { name: "Submit for Approval" }).click();
    await expect(page.getByText("Badge version submitted for approval.")).toBeVisible();

    await page.getByRole("button", { name: "Approve & Publish" }).click();
    await expect(page.getByText("Approval decision recorded.")).toBeVisible();
    await expect(page.locator(".status.approved").first()).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDir, "badge-library-detail.png"),
      fullPage: true,
    });
  });

  test("two faculty share the same approved badge across sections and cannot govern it", async ({
    page,
    browser,
  }) => {
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    const facultyClassId = await createClass(page, "S7A");
    await mapCourse(page, facultyClassId);
    await assignSharedBadge(page, facultyClassId);

    await page.screenshot({ path: resolve(evidenceDir, "class-shared-badge.png"), fullPage: true });
    const card = page.locator(".badge-card", { hasText: badgeName });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Shared badge from the centralized library/)).toBeVisible();
    await expect(card.getByText("Edit Template")).toHaveCount(0);

    await page.goto("/catalog");
    await expect(page).toHaveURL(/\/dashboard$/);

    const nonOwnerContext = await browser.newContext();
    try {
      const nonOwnerPage = await nonOwnerContext.newPage();
      await login(nonOwnerPage, fixture.E2E_NON_OWNER_EMAIL, fixture.E2E_NON_OWNER_PASSWORD);
      const secondClassId = await createClass(nonOwnerPage, "S7B");
      await mapCourse(nonOwnerPage, secondClassId);
      await assignSharedBadge(nonOwnerPage, secondClassId);
      await expect(nonOwnerPage.getByRole("row", { name: new RegExp(badgeName) })).toBeVisible();
    } finally {
      await nonOwnerContext.close();
    }
  });

  test("faculty cannot reach the approval queue or administrator catalog", async ({ page }) => {
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await page.goto("/library?scope=queue");
    await expect(page.getByRole("heading", { name: "Shared Badge Library" })).toBeVisible();
    await expect(page.getByText("Approval Queue")).toHaveCount(0);
    await page.goto("/catalog");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
