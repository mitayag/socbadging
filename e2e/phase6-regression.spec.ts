import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_ACTIVE_PUBLIC_ID"
  | "E2E_EXPIRED_PUBLIC_ID"
  | "E2E_REVOKED_PUBLIC_ID"
  | "E2E_RATE_PUBLIC_ID"
  | "E2E_DESKTOP_REVOCABLE_PUBLIC_ID"
  | "E2E_MOBILE_REVOCABLE_PUBLIC_ID"
  | "E2E_DESKTOP_OWNED_ISSUANCE_ID"
  | "E2E_MOBILE_OWNED_ISSUANCE_ID"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_NON_OWNER_EMAIL"
  | "E2E_NON_OWNER_PASSWORD",
  string
>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

function ownedFixture(projectName: string) {
  return projectName === "mobile"
    ? {
        issuanceId: fixture.E2E_MOBILE_OWNED_ISSUANCE_ID,
        publicId: fixture.E2E_MOBILE_REVOCABLE_PUBLIC_ID,
      }
    : {
        issuanceId: fixture.E2E_DESKTOP_OWNED_ISSUANCE_ID,
        publicId: fixture.E2E_DESKTOP_REVOCABLE_PUBLIC_ID,
      };
}

test.describe.serial("Phase 6 verification lifecycle", () => {
  test("shows privacy-safe active, expired, and revoked public lifecycle states", async ({
    page,
  }) => {
    await page.goto(`/credentials/${fixture.E2E_ACTIVE_PUBLIC_ID}`);
    await expect(page.getByText("Active credential")).toBeVisible();
    await expect(page.getByText("e2e-recipient@example.test", { exact: true })).not.toBeVisible();
    await expect(page.locator("body")).not.toContainText("e2e-internal-student");

    await page.goto(`/credentials/${fixture.E2E_EXPIRED_PUBLIC_ID}`);
    await expect(page.getByText("Expired credential")).toBeVisible();

    await page.goto(`/credentials/${fixture.E2E_REVOKED_PUBLIC_ID}`);
    await expect(page.getByText("Revoked credential")).toBeVisible();
  });

  test("allows an owning Faculty revocation and immediately preserves the public history", async ({
    page,
  }, testInfo) => {
    const owned = ownedFixture(testInfo.project.name);
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await page.goto(`/issued/${owned.issuanceId}`);
    await page.getByLabel("Revocation Reason").fill("E2E lifecycle verification");
    await page.getByText("I understand this revocation cannot be undone").click();
    await page.getByRole("button", { name: "Revoke Credential" }).click();
    await expect(page).toHaveURL(/notice=revoked/);

    await page.goto(`/credentials/${owned.publicId}`);
    await expect(page.getByText("Revoked credential")).toBeVisible();
  });

  test("allows an Administrator settings update and uniformly denies a non-owner Faculty", async ({
    browser,
    page,
  }, testInfo) => {
    const owned = ownedFixture(testInfo.project.name);
    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await page.goto("/settings");
    await page.getByLabel("Support Contact").fill("e2e-support@example.test");
    await page.getByRole("button", { name: "Save Issuer Settings" }).click();
    await expect(page.getByText("Issuer settings saved.")).toBeVisible();
    await page.goto("/audit-logs");
    await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();

    const nonOwnerContext = await browser.newContext();
    const nonOwner = await nonOwnerContext.newPage();
    await login(nonOwner, fixture.E2E_NON_OWNER_EMAIL, fixture.E2E_NON_OWNER_PASSWORD);
    await nonOwner.goto(`/issued/${owned.issuanceId}`);
    await expect(
      nonOwner.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    await nonOwner.goto("/settings");
    await expect(
      nonOwner.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    await nonOwnerContext.close();
  });

  test("returns public HTML security headers and generic rate-limit denial", async ({
    request,
  }) => {
    const response = await request.get(`/credentials/${fixture.E2E_RATE_PUBLIC_ID}`);
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");

    let denied = response;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      denied = await request.get(`/credentials/${fixture.E2E_RATE_PUBLIC_ID}`);
    }
    expect(denied.status()).toBe(429);
    expect(denied.headers()["retry-after"]).toBeTruthy();
    await expect(denied.text()).resolves.not.toContain(fixture.E2E_RATE_PUBLIC_ID);
  });
});
