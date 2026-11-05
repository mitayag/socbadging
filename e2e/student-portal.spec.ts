import type { Page } from "@playwright/test";

import { expect, test } from "./test-base";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_STUDENT_EMAIL"
  | "E2E_STUDENT_PASSWORD"
  | "E2E_ACTIVATION_TOKEN_DESKTOP"
  | "E2E_ACTIVATION_EMAIL_DESKTOP"
  | "E2E_ACTIVATION_TOKEN_MOBILE"
  | "E2E_ACTIVATION_EMAIL_MOBILE"
  | "E2E_RECOVERY_TOKEN_DESKTOP"
  | "E2E_RECOVERY_EMAIL_DESKTOP"
  | "E2E_RECOVERY_TOKEN_MOBILE"
  | "E2E_RECOVERY_EMAIL_MOBILE"
  | "E2E_RESEND_BADGE_DESKTOP"
  | "E2E_RESEND_BADGE_MOBILE"
  | "E2E_OTHER_STUDENT_ISSUANCE_ID"
  | "E2E_CLASS_ID"
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD",
  string
>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;

async function loginStudent(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/student$/, { timeout: 20_000 });
}

test.describe.serial("Student credential portal", () => {
  test("shows the student dashboard, wallet, detail, and downloads", async ({
    page,
    request,
  }, testInfo) => {
    await loginStudent(page, fixture.E2E_STUDENT_EMAIL, fixture.E2E_STUDENT_PASSWORD);
    await expect(page.getByText("Student Overview")).toBeVisible();
    await expect(page.getByRole("heading", { name: "All Earned Badges" })).toBeVisible();
    await expect(page.getByLabel("Badge summary").getByText("Earned Badges")).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/student-portal-dashboard${testInfo.project.name === "mobile" ? "-mobile" : ""}.png`,
      fullPage: true,
    });

    await page.goto("/student/badges");
    await expect(page.getByRole("heading", { name: "My Badges" })).toBeVisible();
    await expect(page.locator(".student-badge-card").first()).toBeVisible();
    await expect(page.getByText("E2E-601")).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/student-portal-wallet${testInfo.project.name === "mobile" ? "-mobile" : ""}.png`,
      fullPage: true,
    });

    const detailLink = page.locator('a[href^="/student/badges/"]').first();
    await detailLink.click();
    await expect(page.getByText("Credential Details")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download Badge Image" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PDF Summary" })).toBeVisible();

    const pdfHref = await page
      .getByRole("link", { name: "Download PDF Summary" })
      .getAttribute("href");
    const jsonHref = await page
      .getByRole("link", { name: "Download JSON-LD" })
      .getAttribute("href");
    expect(pdfHref).toBeTruthy();
    expect(jsonHref).toBeTruthy();
    const pdf = await request.get(`http://127.0.0.1:3100${pdfHref}`);
    const json = await request.get(`http://127.0.0.1:3100${jsonHref}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(json.status()).toBe(200);
    expect(json.headers()["content-type"]).toContain("application/ld+json");
  });

  test("shows notification history, profile identity, and help", async ({ page }) => {
    await loginStudent(page, fixture.E2E_STUDENT_EMAIL, fixture.E2E_STUDENT_PASSWORD);
    await page.goto("/student/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText(/does not confirm inbox delivery/i)).toBeVisible();
    await page.goto("/student/profile");
    await expect(page.getByText("e2e-internal-student")).toBeVisible();
    await expect(page.getByText("e2e-recipient@example.test")).toBeVisible();
    await page.goto("/student/help");
    await expect(page.getByRole("heading", { name: "Badge Access Help" })).toBeVisible();
  });

  test("does not expose another student's credential or staff APIs", async ({ page }) => {
    await loginStudent(page, fixture.E2E_STUDENT_EMAIL, fixture.E2E_STUDENT_PASSWORD);
    const foreign = await page.goto(`/student/badges/${fixture.E2E_OTHER_STUDENT_ISSUANCE_ID}`);
    expect(foreign?.status()).toBe(404);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Other Student");

    for (const path of [
      "/api/issued/export",
      `/api/classes/${fixture.E2E_CLASS_ID}/roster/export`,
      "/api/issuance-batches/bogus/report",
      `/api/issued/${fixture.E2E_OTHER_STUDENT_ISSUANCE_ID}/credential`,
    ]) {
      const response = await page.request.get(`http://127.0.0.1:3100${path}`);
      expect([403, 404]).toContain(response.status());
      const body = await response.text();
      expect(body).not.toContain("e2e-recipient@example.test");
      expect(body).not.toContain("e2e-internal-student");
    }
  });

  test("activates an invited student account", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    const activationToken = mobile
      ? fixture.E2E_ACTIVATION_TOKEN_MOBILE
      : fixture.E2E_ACTIVATION_TOKEN_DESKTOP;
    const activationEmail = mobile
      ? fixture.E2E_ACTIVATION_EMAIL_MOBILE
      : fixture.E2E_ACTIVATION_EMAIL_DESKTOP;
    await page.goto(`/student/activate/${activationToken}`);
    await expect(page.getByRole("heading", { name: "Activate Student Account" })).toBeVisible();
    await page.getByLabel("New Password", { exact: true }).fill("Activation-Student-2026!");
    await page.getByLabel("Confirm New Password", { exact: true }).fill("Activation-Student-2026!");
    await page.getByRole("button", { name: "Activate Account" }).click();
    await expect(page).toHaveURL(/\/login\?notice=student-activated/);
    await loginStudent(page, activationEmail, "Activation-Student-2026!");
    await expect(page.getByText(/No badges match these filters/i)).toBeVisible();
  });

  test("resets a student password through a recovery token", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    const recoveryToken = mobile
      ? fixture.E2E_RECOVERY_TOKEN_MOBILE
      : fixture.E2E_RECOVERY_TOKEN_DESKTOP;
    const recoveryEmail = mobile
      ? fixture.E2E_RECOVERY_EMAIL_MOBILE
      : fixture.E2E_RECOVERY_EMAIL_DESKTOP;
    await page.goto(`/student/recover/${recoveryToken}`);
    await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
    await page.getByLabel("New Password", { exact: true }).fill("Recovery-Student-2026!");
    await page.getByLabel("Confirm New Password", { exact: true }).fill("Recovery-Student-2026!");
    await page.getByRole("button", { name: "Reset Password" }).click();
    await expect(page).toHaveURL(/\/login\?notice=student-password-reset/);
    await loginStudent(page, recoveryEmail, "Recovery-Student-2026!");
  });

  test("lets an Administrator resend a SENT issuance notification", async ({ page }, testInfo) => {
    page.on("dialog", (dialog) => dialog.accept());
    const resendBadge =
      testInfo.project.name === "mobile"
        ? fixture.E2E_RESEND_BADGE_MOBILE
        : fixture.E2E_RESEND_BADGE_DESKTOP;
    await page.goto("/login");
    await page.getByLabel("Institutional Email").fill(fixture.E2E_ADMIN_EMAIL);
    await page.getByLabel("Password").fill(fixture.E2E_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In Securely" }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await page.goto("/notifications?pageSize=50");
    const row = page
      .locator("tr")
      .filter({ hasText: resendBadge })
      .filter({ hasText: "Sent" })
      .first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Resend Notification" }).click();
    await expect(page.getByText(/Notification queued for resend/i)).toBeVisible();
  });
});
