import type { Page } from "@playwright/test";

import { expect, test } from "./test-base";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_CLASS_ID"
  | "E2E_RESET_STUDENT_NUMBER"
  | "E2E_RESET_STUDENT_EMAIL"
  | "E2E_RESET_STUDENT_PUBLIC_ID"
  | "E2E_RESET_STUDENT_MOBILE_NUMBER"
  | "E2E_RESET_STUDENT_MOBILE_EMAIL"
  | "E2E_RESET_STUDENT_MOBILE_PUBLIC_ID",
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
}

async function loginAdmin(page: Page) {
  await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

async function loginFaculty(page: Page) {
  await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

test.describe.serial("Dual-method student password reset", () => {
  test("Administrator can email and directly reset a password, forcing a change and preserving badges", async ({
    page,
    browser,
  }, testInfo) => {
    const student =
      testInfo.project.name === "mobile"
        ? {
            number: fixture.E2E_RESET_STUDENT_MOBILE_NUMBER,
            email: fixture.E2E_RESET_STUDENT_MOBILE_EMAIL,
            name: "Reset Student Mobile",
          }
        : {
            number: fixture.E2E_RESET_STUDENT_NUMBER,
            email: fixture.E2E_RESET_STUDENT_EMAIL,
            name: "Reset Student",
          };
    const temporaryPassword = "StudentReset!2026";
    const finalPassword = "StudentFinal!2026";

    await loginAdmin(page);
    await page.goto(`/students?q=${encodeURIComponent(student.number)}`);
    const row = page
      .locator(".student-table tbody tr")
      .filter({ has: page.getByRole("cell", { name: student.number, exact: true }) });
    await expect(row).toHaveCount(1);
    await page
      .getByRole("button", { name: `Reset password for ${student.name}`, exact: true })
      .click();

    const resetDialog = page.getByRole("dialog", {
      name: `Reset password for ${student.name}`,
      exact: true,
    });
    await expect(resetDialog).toBeVisible();
    await expect(resetDialog.getByText("e***@example.test")).toBeVisible();

    await resetDialog.getByRole("button", { name: "Send Reset Link" }).click();
    const emailConfirm = page.getByRole("dialog", { name: "Send a reset link?", exact: true });
    await expect(emailConfirm).toBeVisible();
    await emailConfirm.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(
      page.getByText(
        /Reset link created, but email delivery is unavailable|Password reset link requested/,
      ),
    ).toBeVisible();

    await page
      .getByRole("button", { name: `Reset password for ${student.name}`, exact: true })
      .click();
    const directDialog = page.getByRole("dialog", {
      name: `Reset password for ${student.name}`,
      exact: true,
    });
    await directDialog.getByLabel("Your Current Password").fill(fixture.E2E_ADMIN_PASSWORD);
    await directDialog.getByLabel("New Password", { exact: true }).fill(temporaryPassword);
    await directDialog.getByLabel("Confirm New Password", { exact: true }).fill(temporaryPassword);
    await directDialog.getByRole("button", { name: "Show passwords" }).click();
    await expect(directDialog.getByLabel("New Password", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await directDialog.getByRole("button", { name: "Hide passwords" }).click();
    await directDialog.getByRole("button", { name: "Reset Password", exact: true }).click();

    const directConfirm = page.getByRole("dialog", {
      name: "Confirm password reset",
      exact: true,
    });
    await expect(directConfirm).toBeVisible();
    await directConfirm.getByRole("button", { name: "Confirm Password Reset" }).click();
    await expect(
      page.getByText("Student password reset. They must choose a new password at next sign-in."),
    ).toBeVisible();

    const studentContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const studentPage = await studentContext.newPage();
    await login(studentPage, student.email, fixture.E2E_ADMIN_PASSWORD);
    await expect(studentPage).toHaveURL(/\/login$/);
    await expect(studentPage.locator(".auth-error")).toHaveText("Invalid email or password.");

    await login(studentPage, student.email, temporaryPassword);
    await expect(studentPage).toHaveURL(/\/student\/change-password$/);
    await studentPage.getByLabel("Current Password").fill(temporaryPassword);
    await studentPage.getByLabel("New Password", { exact: true }).fill(finalPassword);
    await studentPage.getByLabel("Confirm New Password", { exact: true }).fill(finalPassword);
    await studentPage.getByRole("button", { name: "Update Password" }).click();
    await expect(studentPage).toHaveURL(/\/login\?notice=password-updated$/);

    await login(studentPage, student.email, finalPassword);
    await expect(studentPage).toHaveURL(/\/student$/, { timeout: 20_000 });
    await expect(studentPage.getByText("Phase 6 E2E Badge").first()).toBeVisible();
    await studentContext.close();
  });

  test("assigned Faculty can directly reset a student password", async ({
    page,
    browser,
  }, testInfo) => {
    const student =
      testInfo.project.name === "mobile"
        ? {
            number: fixture.E2E_RESET_STUDENT_MOBILE_NUMBER,
            email: fixture.E2E_RESET_STUDENT_MOBILE_EMAIL,
            name: "Reset Student Mobile",
          }
        : {
            number: fixture.E2E_RESET_STUDENT_NUMBER,
            email: fixture.E2E_RESET_STUDENT_EMAIL,
            name: "Reset Student",
          };
    const temporaryPassword = "FacultyReset!2026";
    const finalPassword = "FacultyFinal!2026";

    await loginFaculty(page);
    await page.goto(
      `/classes/${fixture.E2E_CLASS_ID}/students?q=${encodeURIComponent(student.number)}`,
    );
    const row = page
      .locator(".roster-table tbody tr")
      .filter({ has: page.getByRole("cell", { name: student.number, exact: true }) });
    await expect(row).toHaveCount(1);
    await page
      .getByRole("button", { name: `Reset password for ${student.name}`, exact: true })
      .click();

    const resetDialog = page.getByRole("dialog", {
      name: `Reset password for ${student.name}`,
      exact: true,
    });
    await resetDialog.getByLabel("Your Current Password").fill(fixture.E2E_FACULTY_PASSWORD);
    await resetDialog.getByLabel("New Password", { exact: true }).fill(temporaryPassword);
    await resetDialog.getByLabel("Confirm New Password", { exact: true }).fill(temporaryPassword);
    await resetDialog.getByRole("button", { name: "Reset Password", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Confirm password reset", exact: true })
      .getByRole("button", { name: "Confirm Password Reset" })
      .click();
    await expect(
      page.getByText("Student password reset. They must choose a new password at next sign-in."),
    ).toBeVisible();

    const studentContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const studentPage = await studentContext.newPage();
    await login(studentPage, student.email, temporaryPassword);
    await expect(studentPage).toHaveURL(/\/student\/change-password$/);
    await studentPage.getByLabel("Current Password").fill(temporaryPassword);
    await studentPage.getByLabel("New Password", { exact: true }).fill(finalPassword);
    await studentPage.getByLabel("Confirm New Password", { exact: true }).fill(finalPassword);
    await studentPage.getByRole("button", { name: "Update Password" }).click();
    await expect(studentPage).toHaveURL(/\/login\?notice=password-updated$/);
    await login(studentPage, student.email, finalPassword);
    await expect(studentPage).toHaveURL(/\/student$/, { timeout: 20_000 });
    await expect(studentPage.getByText("Phase 6 E2E Badge").first()).toBeVisible();
    await studentContext.close();
  });
});
