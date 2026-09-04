import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_NON_OWNER_EMAIL"
  | "E2E_NON_OWNER_PASSWORD"
  | "E2E_DESKTOP_OWNED_ISSUANCE_ID"
  | "E2E_MOBILE_OWNED_ISSUANCE_ID"
  | "E2E_DESKTOP_NOTIFICATION_ID"
  | "E2E_MOBILE_NOTIFICATION_ID",
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
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectTwoLineBrand(page: Page) {
  let institution = page.locator('[data-brand-line="institution"]:visible');
  if ((await institution.count()) === 0) {
    const navigationToggle = page.getByLabel("Open navigation");
    if (await navigationToggle.isVisible()) await navigationToggle.click();
    institution = page.locator('[data-brand-line="institution"]:visible');
  }
  const product = page.locator('[data-brand-line="product"]:visible');
  await expect(institution).toHaveText("HAU SOC");
  await expect(product).toHaveText("Badging System");
  const [institutionBox, productBox] = await Promise.all([
    institution.boundingBox(),
    product.boundingBox(),
  ]);
  expect(institutionBox).not.toBeNull();
  expect(productBox).not.toBeNull();
  expect(productBox!.y).toBeGreaterThanOrEqual(institutionBox!.y + institutionBox!.height);
  await expect(page.getByRole("img", { name: "HAU School of Computing logo" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

function ownedFixture(projectName: string) {
  return projectName === "mobile"
    ? {
        issuanceId: fixture.E2E_MOBILE_OWNED_ISSUANCE_ID,
        notificationId: fixture.E2E_MOBILE_NOTIFICATION_ID,
      }
    : {
        issuanceId: fixture.E2E_DESKTOP_OWNED_ISSUANCE_ID,
        notificationId: fixture.E2E_DESKTOP_NOTIFICATION_ID,
      };
}

test.describe.serial("Phase 7 notification hardening", () => {
  test("keeps the shared two-line lockup accessible on login and Administrator screens", async ({
    page,
  }, testInfo) => {
    await page.goto("/login");
    await expectTwoLineBrand(page);
    await expect(page.getByLabel("Institutional Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 768, height: 1024 });
      await expectTwoLineBrand(page);
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await expectTwoLineBrand(page);
  });

  test("lets an Administrator inspect, retry, and audit a privacy-safe failed delivery", async ({
    page,
  }, testInfo) => {
    const owned = ownedFixture(testInfo.project.name);
    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Email Notifications" })).toBeVisible();
    await expect(page.getByText("e***@example.test", { exact: true }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("e2e-recipient@example.test");
    await page.waitForLoadState("networkidle");
    const retryInput = page.locator(`input[name="deliveryId"][value="${owned.notificationId}"]`);
    await retryInput.locator("..").getByRole("button", { name: "Retry Notification" }).click();
    await expect(retryInput).toHaveCount(0);

    await page.goto("/audit-logs");
    await expect(
      page.getByText("Notification Retry Requested", { exact: true }).first(),
    ).toBeVisible();
  });

  test("shows scoped Faculty status and denies a non-owner Faculty", async ({
    browser,
    page,
  }, testInfo) => {
    const owned = ownedFixture(testInfo.project.name);
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await expectTwoLineBrand(page);
    await page.goto(`/issued/${owned.issuanceId}`);
    await expect(page.getByText(/Email (FAILED|PENDING)/)).toBeVisible();

    const nonOwnerContext = await browser.newContext();
    const nonOwner = await nonOwnerContext.newPage();
    await login(nonOwner, fixture.E2E_NON_OWNER_EMAIL, fixture.E2E_NON_OWNER_PASSWORD);
    await nonOwner.goto(`/issued/${owned.issuanceId}`);
    await expect(
      nonOwner.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    await nonOwner.goto("/notifications");
    await expect(
      nonOwner.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    await nonOwnerContext.close();
  });
});
