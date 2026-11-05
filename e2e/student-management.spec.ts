import type { Page } from "@playwright/test";

import { expect, test } from "./test-base";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_MANAGEMENT_STUDENT_NUMBER"
  | "E2E_MANAGEMENT_STUDENT_EMAIL"
  | "E2E_MANAGEMENT_PUBLIC_ID",
  string
>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

test.describe.serial("Student account management", () => {
  test("creates, searches, edits, filters, paginates, and manages portal access", async ({
    page,
    browser,
  }, testInfo) => {
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const studentNumber = `STU-${suffix}`;
    const email = `student-${suffix}@example.test`;
    const firstName = `Created ${suffix}`;
    const lastName = "Student";
    const fullName = `${firstName} ${lastName}`;
    const editedFirstName = `Edited ${suffix}`;
    const editedFullName = `${editedFirstName} ${lastName}`;
    const editedEmail = `edited-${suffix}@example.test`;

    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await page.goto("/students");
    await expect(page.getByRole("heading", { name: "Student Accounts" })).toBeVisible();
    expect(await page.locator(".student-table thead th").allTextContents()).toEqual([
      "Student Number",
      "Full Name",
      "Email",
      "Portal Status",
      "Actions",
    ]);

    const table = page.getByRole("region", { name: "Student accounts table" });
    await expect(table.locator("tbody tr")).toHaveCount(5);
    await expect(page.locator(".faculty-result-meta")).toContainText("Page 1 of");
    await expect(page.locator('select[name="pageSize"]')).toHaveValue("5");

    const addPanel = page.locator("details.panel").filter({ hasText: "Add Student" });
    await addPanel.locator("summary").click();
    await addPanel.getByLabel("Student Number").fill(studentNumber);
    await addPanel.getByLabel("First Name").fill(firstName);
    await addPanel.getByLabel("Last Name").fill(lastName);
    await addPanel.getByLabel("Email", { exact: true }).fill(email);
    await addPanel.getByRole("button", { name: "Create Student" }).click();

    await expect(page.getByText("Student record created successfully.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(studentNumber)}`));
    const createdRow = page.locator("tbody tr").filter({ hasText: studentNumber });
    await expect(createdRow).toHaveCount(1);
    await expect(createdRow).toContainText(fullName);
    await expect(createdRow.locator(".status")).toHaveText("Not Activated");

    await page.goto(`/students?q=${encodeURIComponent(firstName)}`);
    await expect(page.getByText(studentNumber, { exact: true })).toBeVisible();
    await page.goto(`/students?q=${encodeURIComponent(email)}`);
    await expect(page.getByText(studentNumber, { exact: true })).toBeVisible();

    await page.goto(`/students?q=${encodeURIComponent(studentNumber)}`);
    await page.getByRole("button", { name: `Edit ${fullName}` }).click();
    const editDialog = page.getByRole("dialog", { name: `Edit ${fullName}`, exact: true });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("First Name").fill(editedFirstName);
    await editDialog.getByLabel("Email", { exact: true }).fill(editedEmail);
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Student details updated successfully.")).toBeVisible();
    await expect(page.getByText(editedFullName, { exact: true })).toBeVisible();

    await page.getByLabel("Portal status").selectOption("NOT_ACTIVATED");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/status=NOT_ACTIVATED/);
    for (const label of await page.locator(".student-table .status").allTextContents()) {
      expect(label).toBe("Not Activated");
    }

    await page.getByLabel("Sort by").selectOption("studentNumber");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/sort=studentNumber/);

    if (testInfo.project.name === "desktop") {
      await page.goto(`/students?q=${encodeURIComponent(fixture.E2E_MANAGEMENT_STUDENT_NUMBER)}`);
      const managementRow = page.locator("tbody tr").filter({
        hasText: fixture.E2E_MANAGEMENT_STUDENT_NUMBER,
      });
      await expect(managementRow).toHaveCount(1);
      await expect(managementRow.locator(".status")).toHaveText("Active");

      await page.getByRole("button", { name: "Delete Management Student" }).click();
      const deleteDialog = page.getByRole("dialog", {
        name: "Delete Management Student's portal account?",
        exact: true,
      });
      await expect(deleteDialog).toBeVisible();
      await deleteDialog.getByRole("button", { name: "Delete Portal Account" }).click();
      await expect(
        page.getByText(
          "Student portal account deleted. The student record and issued badges were preserved.",
        ),
      ).toBeVisible();
      await expect(managementRow.locator(".status")).toHaveText("Deactivated");

      await page.goto(
        `/students?status=DEACTIVATED&q=${encodeURIComponent(fixture.E2E_MANAGEMENT_STUDENT_NUMBER)}`,
      );
      await expect(
        page.getByText(fixture.E2E_MANAGEMENT_STUDENT_NUMBER, { exact: true }),
      ).toBeVisible();

      const origin = new URL(page.url()).origin;
      const deactivatedContext = await browser.newContext({ baseURL: origin });
      const deactivatedPage = await deactivatedContext.newPage();
      await deactivatedPage.goto("/login");
      await deactivatedPage
        .getByLabel("Institutional Email")
        .fill(fixture.E2E_MANAGEMENT_STUDENT_EMAIL);
      await deactivatedPage.getByLabel("Password").fill(fixture.E2E_ADMIN_PASSWORD);
      await deactivatedPage.getByRole("button", { name: "Sign In Securely" }).click();
      await expect(deactivatedPage).toHaveURL(/\/login$/);
      await expect(deactivatedPage.locator(".auth-error")).toHaveText("Invalid email or password.");
      await deactivatedPage.goto(`/credentials/${fixture.E2E_MANAGEMENT_PUBLIC_ID}`);
      await expect(deactivatedPage.getByText("Active credential")).toBeVisible();
      await deactivatedContext.close();
    }

    const origin = new URL(page.url()).origin;
    const facultyContext = await browser.newContext({ baseURL: origin });
    const facultyPage = await facultyContext.newPage();
    await login(facultyPage, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await facultyPage.goto("/students");
    await expect(facultyPage).toHaveURL(/\/dashboard$/);
    await expect(facultyPage.getByRole("heading", { name: "Student Accounts" })).toHaveCount(0);
    await facultyContext.close();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/students");
    await page.screenshot({
      caret: "initial",
      path: `docs/screenshots/student-management-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/students");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
    const horizontalScroll = await page
      .getByRole("region", { name: "Student accounts table" })
      .evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(horizontalScroll).toBe(true);
    await page.screenshot({
      caret: "initial",
      path: `docs/screenshots/student-management-${testInfo.project.name}-mobile.png`,
      fullPage: true,
    });
  });
});
