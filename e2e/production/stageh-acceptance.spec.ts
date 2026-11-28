import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { loadStageHCredentials } from "./stageh-credentials";

const credentials = loadStageHCredentials();

async function loginStaff(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

async function loginStudent(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/student$/, { timeout: 20_000 });
}

test.describe("Production public verification", () => {
  test("health, issuer, signing key, and status list are ready", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    await expect(health).toBeOK();
    const body = (await health.json()) as {
      readiness?: string;
      database?: { status?: string };
      signer?: { status?: string };
      notifications?: { status?: string; workerHeartbeat?: string };
    };
    expect(body.readiness).toBe("ready");
    expect(body.database?.status).toBe("ready");
    expect(body.signer?.status).toBe("ready");
    expect(body.notifications?.status).toBe("ready");
    expect(body.notifications?.workerHeartbeat).toBe("fresh");

    const issuer = await request.get("/api/issuers/hau-soc");
    expect(issuer.status()).toBe(200);
    const issuerBody = (await issuer.json()) as {
      id: string;
      verificationMethod: string[];
    };
    expect(issuerBody.id).toBe("https://socbadging.hausoc.org/api/issuers/hau-soc");
    expect(issuerBody.verificationMethod).toContain(
      "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11",
    );

    const key = await request.get("/api/issuers/hau-soc/keys/staging-2026-11");
    expect(key.status()).toBe(200);
    const keyBody = (await key.json()) as { id: string; keyTrust?: { state?: string } };
    expect(keyBody.id).toBe(
      "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11",
    );
    expect(keyBody.keyTrust?.state).toBe("ACTIVE");

    const statusList = await request.get("/api/status-lists/status-list-local");
    expect(statusList.status()).toBe(200);
    const statusBody = (await statusList.json()) as {
      issuer: string;
      proof?: { verificationMethod?: string };
    };
    expect(statusBody.issuer).toBe("https://socbadging.hausoc.org/api/issuers/hau-soc");
    expect(statusBody.proof?.verificationMethod).toBe(
      "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11",
    );
  });
});

test.describe("STAGEH authenticated production acceptance", () => {
  test.skip(!credentials, "STAGEH_CREDENTIALS_FILE is not set");

  test("Administrator login, dashboard, and management access", async ({ page }) => {
    if (!credentials) return;
    await loginStaff(page, credentials.admin.email, credentials.admin.password);
    await expect(page.getByText("Administrator Overview")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

    await page.goto("/faculty");
    await expect(page.getByRole("heading", { name: "Faculty Management" })).toBeVisible();
    await page.goto("/students");
    await expect(page.getByRole("heading", { name: "Student Accounts" })).toBeVisible();
    await page.goto("/classes");
    await expect(page.getByRole("heading", { name: "All Classes" })).toBeVisible();
    await page.goto("/audit-logs");
    await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();

    await page.getByRole("button", { name: /Open user menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  });

  test("Faculty login, assigned classes, and Administrator denial", async ({ page }) => {
    if (!credentials) return;
    await loginStaff(page, credentials.faculty.email, credentials.faculty.password);
    await page.goto("/classes");
    await expect(page.getByRole("heading", { name: "My Classes" })).toBeVisible();
    await expect(page.getByText(credentials.class.courseCode).first()).toBeVisible();

    await page.goto("/faculty");
    await expect(page).not.toHaveURL(/\/faculty$/);
    await expect(page.getByRole("heading", { name: "Faculty Management" })).toHaveCount(0);
  });

  test("Student login, badge dashboard, ownership isolation, and staff denial", async ({
    page,
  }) => {
    if (!credentials) return;
    await loginStudent(page, credentials.student.email, credentials.student.password);
    await expect(page.getByText("Student Overview")).toBeVisible();
    await expect(page.getByRole("heading", { name: "All Earned Badges" })).toBeVisible();
    await page.goto("/student/badges");
    await expect(page.getByRole("heading", { name: "My Badges" })).toBeVisible();

    await page.goto("/students");
    await expect(page).not.toHaveURL(/\/students$/);
    await expect(page.getByRole("heading", { name: "Student Accounts" })).toHaveCount(0);

    for (const path of ["/api/issued/export", "/api/issuance-batches/bogus/report"]) {
      const response = await page.request.get(path);
      expect([403, 404]).toContain(response.status());
    }
    await expect(page.locator("body")).not.toContainText(credentials.admin.email);
    await expect(page.locator("body")).not.toContainText(credentials.faculty.email);
  });
});
