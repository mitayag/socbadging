import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

type Stage7Credentials = {
  baseUrl: string;
  scope: "STAGEH";
  admin: { email: string; password: string };
  faculty: { email: string; password: string };
  student: { email: string; password: string };
  class: { id: string; courseCode: string };
  stage7?: {
    facultyA: { email: string; password: string; userId: string; employeeId: string };
    facultyB: { email: string; password: string; userId: string; employeeId: string };
    studentA: { email: string; password: string; studentId: string; studentNumber: string };
    studentB: { email: string; password: string; studentId: string; studentNumber: string };
    classA: { id: string; courseCode: string; title: string };
    classB: { id: string; courseCode: string; title: string };
    course: { code: string; title: string };
    badge: { name: string };
  };
};

function loadCredentials(): Stage7Credentials | null {
  const path = process.env.STAGEH_CREDENTIALS_FILE;
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Stage7Credentials;
}

const credentials = loadCredentials();
const stage7 = credentials?.stage7;
const suffix = `${Date.now()}`.slice(-7);
const artwork = resolve(process.cwd(), "public/images/hausoclogo.png");

async function login(page: Page, email: string, password: string, target: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(target, { timeout: 20_000 });
}

async function createAndApproveBadge(page: Page, name: string) {
  await page.goto(`/catalog?q=${encodeURIComponent(stage7!.course.code)}`);
  await expect(
    page.getByRole("row", { name: new RegExp(stage7!.course.code) }).first(),
  ).toBeVisible();

  await page.goto("/library");
  const panel = page.locator("details", { hasText: "Create Badge Definition" });
  await panel.locator("summary").click();
  await panel
    .getByLabel("Associated Course")
    .selectOption({ label: `${stage7!.course.code} · ${stage7!.course.title}` });
  await panel.getByLabel("Badge Name").fill(name);
  await panel.getByLabel("Grading Period").fill("Prelim");
  await panel.getByLabel("Description").fill("Stage 7 production acceptance shared badge");
  await panel.getByLabel("Competencies").fill("Debugging, testing, version control");
  await panel.getByLabel("Assessment Criteria").fill("Build and test a working application");
  await panel.getByLabel(/Badge Artwork/).setInputFiles(artwork);
  await panel.getByRole("button", { name: "Create Badge" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText("Badge version submitted for approval.")).toBeVisible();
  await page.getByRole("button", { name: "Approve & Publish" }).click();
  await expect(page.getByText("Approval decision recorded.")).toBeVisible();
  await expect(page.locator(".status.approved").first()).toBeVisible();
}

async function openBadge(page: Page, name: string) {
  await page.goto(`/library?q=${encodeURIComponent(name)}`);
  await page
    .getByRole("row", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
    .getByRole("link", { name: /Open|Review/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function assignToClass(page: Page, classId: string, section: string) {
  const panel = page.locator("details", { hasText: "Assign to a Class Section" });
  await panel.locator("summary").click();
  const option = panel.getByRole("option", { name: new RegExp(`· ${section} \\(`) });
  const value = await option.getAttribute("value");
  if (!value) throw new Error("Class option was not rendered");
  await panel.getByLabel("Class Section").selectOption(value);
  await panel.getByRole("button", { name: "Assign Badge" }).click();
  await expect(page.getByText("Badge assigned to the class.")).toBeVisible();
}

test.describe.serial("Stage 7 production acceptance", () => {
  test.skip(!stage7, "Stage 7 credentials are not configured");

  test("administrator creates and approves a shared badge from the migrated course", async ({
    page,
  }) => {
    test.skip(!stage7 || !credentials);
    const badgeName = `STAGE7 E2E Primary ${suffix} ${test.info().project.name}`;
    await login(page, credentials!.admin.email, credentials!.admin.password, /\/dashboard$/);
    await createAndApproveBadge(page, badgeName);
  });

  test("faculty assign the shared badge, cannot duplicate it, and cannot cross class boundaries", async ({
    page,
    browser,
  }) => {
    test.skip(!stage7 || !credentials);
    const badgeName = `STAGE7 E2E Primary ${suffix} ${test.info().project.name}`;
    await login(page, stage7!.facultyA.email, stage7!.facultyA.password, /\/dashboard$/);
    await page.goto("/classes");
    await expect(page.locator(`a[href*="${stage7!.classB.id}"]`)).toHaveCount(0);
    await page.goto("/library?scope=library");
    await openBadge(page, badgeName);
    await assignToClass(page, stage7!.classA.id, "A");
    await expect(page.getByText("Create a New Version")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve & Publish" })).toHaveCount(0);

    await page.goto(`/library?q=${encodeURIComponent(badgeName)}`);
    await openBadge(page, badgeName);
    const panel = page.locator("details", { hasText: "Assign to a Class Section" });
    await panel.locator("summary").click();
    const option = panel.getByRole("option", { name: /· A \(/ });
    const value = await option.getAttribute("value");
    await panel.getByLabel("Class Section").selectOption(value ?? "");
    await panel.getByRole("button", { name: "Assign Badge" }).click();
    await expect(page.getByText("This badge is already assigned to the class.")).toBeVisible();

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await login(pageB, stage7!.facultyB.email, stage7!.facultyB.password, /\/dashboard$/);
      await pageB.goto("/library?scope=library");
      await openBadge(pageB, badgeName);
      await assignToClass(pageB, stage7!.classB.id, "B");
      await pageB.goto("/classes");
      await expect(pageB.locator(`a[href*="${stage7!.classA.id}"]`)).toHaveCount(0);

      await pageB.goto("/library?scope=mine");
      const proposalPanel = pageB.locator("details", { hasText: "Propose a Badge" });
      await proposalPanel.locator("summary").click();
      await proposalPanel
        .getByLabel("Associated Course")
        .selectOption({ label: `${stage7!.course.code} · ${stage7!.course.title}` });
      await proposalPanel
        .getByLabel("Badge Name")
        .fill(`STAGE7 E2E Proposal ${suffix} ${test.info().project.name}`);
      await proposalPanel
        .getByLabel("Description")
        .fill("Faculty proposal for production acceptance");
      await proposalPanel.getByLabel("Competencies").fill("Collaboration");
      await proposalPanel
        .getByLabel("Assessment Criteria")
        .fill("Complete the faculty assessment rubric");
      await proposalPanel.getByLabel(/Badge Artwork/).setInputFiles(artwork);
      await proposalPanel.getByRole("button", { name: "Create Proposal" }).click();
      await pageB.getByRole("button", { name: "Submit for Approval" }).click();
      await expect(pageB.getByText("Badge version submitted for approval.")).toBeVisible();
    } finally {
      await contextB.close();
    }
  });

  test("administrator approves the faculty proposal, verifies usage and creates a version", async ({
    page,
  }) => {
    test.skip(!stage7 || !credentials);
    const primaryName = `STAGE7 E2E Primary ${suffix} ${test.info().project.name}`;
    const proposalName = `STAGE7 E2E Proposal ${suffix} ${test.info().project.name}`;
    await login(page, credentials!.admin.email, credentials!.admin.password, /\/dashboard$/);

    await page.goto("/library?scope=queue");
    await openBadge(page, proposalName);
    await page.getByRole("button", { name: "Approve & Publish" }).click();
    await expect(page.getByText("Approval decision recorded.")).toBeVisible();

    await openBadge(page, primaryName);
    const associations = page.locator("section.panel", {
      hasText: "Associated Class Sections",
    });
    await expect(associations.locator("tbody tr")).toHaveCount(2);

    const versionPanel = page.locator("details", { hasText: "Create a New Version" });
    await versionPanel.locator("summary").click();
    await versionPanel.getByLabel("Description").fill("Stage 7 production acceptance version two");
    await versionPanel.getByLabel("Competencies").fill("Updated competencies");
    await versionPanel.getByLabel("Assessment Criteria").fill("Updated assessment criteria");
    await versionPanel.getByRole("button", { name: "Create Version" }).click();
    await expect(page.getByText("New badge version created.")).toBeVisible();
    await page.getByRole("button", { name: "Submit for Approval" }).click();
    await expect(page.getByText("Badge version submitted for approval.")).toBeVisible();
    await page.getByRole("button", { name: "Approve & Publish" }).click();
    await expect(page.getByText("Approval decision recorded.")).toBeVisible();
    const versionRows = page
      .locator("section.panel", { hasText: "Version History" })
      .locator("tbody tr");
    await expect(versionRows).toHaveCount(2);

    await page.goto("/audit-logs");
    await page.getByLabel("Search audit logs").fill("badge");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("student portal access is role-scoped for both test students", async ({ page, browser }) => {
    test.skip(!stage7 || !credentials);
    await login(page, stage7!.studentA.email, stage7!.studentA.password, /\/student$/);
    await expect(page.getByText("Student Overview")).toBeVisible();
    await page.goto("/student/badges");
    await expect(page.getByRole("heading", { name: "My Badges" })).toBeVisible();
    await page.goto("/students");
    await expect(page).not.toHaveURL(/\/students$/);
    await expect(page.getByRole("heading", { name: "Student Accounts" })).toHaveCount(0);
    for (const path of ["/api/issued/export", "/api/issuance-batches/bogus/report"]) {
      const response = await page.request.get(path);
      expect([403, 404]).toContain(response.status());
    }
    await expect(page.locator("body")).not.toContainText(stage7!.studentB.email);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await login(pageB, stage7!.studentB.email, stage7!.studentB.password, /\/student$/);
      await expect(pageB.getByText("Student Overview")).toBeVisible();
      await expect(pageB.locator("body")).not.toContainText(stage7!.studentA.email);
    } finally {
      await contextB.close();
    }
  });
});
