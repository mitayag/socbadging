import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_ACTIVE_PUBLIC_ID"
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_CLASS_ID"
  | "E2E_SIGNED_DESKTOP_PUBLIC_ID"
  | "E2E_SIGNED_MOBILE_PUBLIC_ID"
  | "E2E_SIGNED_EXPIRED_PUBLIC_ID"
  | "E2E_SIGNED_TAMPERED_PUBLIC_ID"
  | "E2E_SIGNED_ORIGINAL_PUBLIC_ID"
  | "E2E_SIGNED_REPLACEMENT_PUBLIC_ID"
  | "E2E_SIGNED_DESKTOP_ISSUANCE_ID"
  | "E2E_SIGNED_MOBILE_ISSUANCE_ID"
  | "E2E_SIGNER_CONTROL_TOKEN",
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

function projectCredential(projectName: string) {
  return projectName === "mobile"
    ? {
        publicId: fixture.E2E_SIGNED_MOBILE_PUBLIC_ID,
        issuanceId: fixture.E2E_SIGNED_MOBILE_ISSUANCE_ID,
      }
    : {
        publicId: fixture.E2E_SIGNED_DESKTOP_PUBLIC_ID,
        issuanceId: fixture.E2E_SIGNED_DESKTOP_ISSUANCE_ID,
      };
}

test.describe.serial("Phase 8 Open Badges local conformance", () => {
  test("renders a responsive privacy-safe verified credential and immutable JSON-LD", async ({
    page,
    request,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const owned = projectCredential(testInfo.project.name);
    await page.goto(`/credentials/${owned.publicId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Active credential")).toBeVisible();
    await expect(page.getByText("Cryptographically verified")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Phase 8 Signed Badge" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("e2e-recipient@example.test");
    await expect(page.locator("body")).not.toContainText("e2e-internal-student");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("link", { name: "View JSON-LD" }).focus();
    await expect(page.getByRole("link", { name: "View JSON-LD" })).toBeFocused();

    const response = await request.get(`/api/credentials/${owned.publicId}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/ld+json");
    const credentialJson = (await response.json()) as Record<string, unknown>;
    expect(credentialJson.proof).toMatchObject({
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
    });
    expect(JSON.stringify(credentialJson)).not.toMatch(
      /e2e-recipient@example|e2e-internal-student/i,
    );
    expect(errors).toEqual([]);
  });

  test("fails proof tampering closed and distinguishes expiration", async ({ page }) => {
    await page.goto(`/credentials/${fixture.E2E_SIGNED_TAMPERED_PUBLIC_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Cryptographic verification failed")).toBeVisible();

    await page.goto(`/credentials/${fixture.E2E_SIGNED_EXPIRED_PUBLIC_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Expired credential")).toBeVisible();
    await expect(
      page.getByText("Cryptographic proof is valid, but this credential has expired"),
    ).toBeVisible();
  });

  test("labels legacy credentials without overstating cryptographic verification", async ({
    page,
    request,
  }) => {
    await page.goto(`/credentials/${fixture.E2E_ACTIVE_PUBLIC_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByText("Legacy credential — cryptographic verification is unavailable"),
    ).toBeVisible();
    const response = await request.get(`/api/credentials/${fixture.E2E_ACTIVE_PUBLIC_ID}`);
    expect(response.status()).toBe(200);
    expect((await response.json()) as Record<string, unknown>).not.toHaveProperty("proof");
  });

  test("preserves and links signed replacement history", async ({ page }) => {
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await page.goto(`/issued/phase6-e2e-signed-original`);
    await expect(page.getByRole("link", { name: "replacement credential" })).toBeVisible();
    await page.getByRole("link", { name: "replacement credential" }).click();
    await expect(page.getByRole("link", { name: "original credential" })).toBeVisible();
    await expect(page.getByText(/original remains historically available/i)).toBeVisible();
  });

  test("shows public signing metadata to Administrators and denies Faculty settings access", async ({
    browser,
    page,
  }) => {
    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Credential signing" })).toBeVisible();
    await expect(page.getByText("Signer health: healthy")).toBeVisible();
    await expect(page.getByText("eddsa-rdfc-2022").first()).toBeVisible();
    await expect(page.getByText("RETIRED", { exact: true })).toBeVisible();
    await expect(page.getByText("COMPROMISED", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("privateKeyMultibase");

    const facultyContext = await browser.newContext();
    const faculty = await facultyContext.newPage();
    await login(faculty, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await faculty.goto("/settings");
    await expect(
      faculty.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    await facultyContext.close();
  });

  test("fails closed without a commit while the signer is unavailable and recovers", async ({
    page,
    request,
  }, testInfo) => {
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await page.goto(`/classes/${fixture.E2E_CLASS_ID}/issued`);
    const suffix = testInfo.project.name === "mobile" ? "Mobile" : "Desktop";
    const badgeName = `Phase 8 Outage ${suffix} Badge`;
    await page.getByLabel("Badge Template", { exact: true }).selectOption({ label: badgeName });
    await page
      .getByLabel("Student", { exact: true })
      .selectOption({ label: "e2e-internal-student · E2E Recipient" });

    const authorization = { authorization: `Bearer ${fixture.E2E_SIGNER_CONTROL_TOKEN}` };
    expect(
      (await request.post("http://127.0.0.1:3102/stop", { headers: authorization })).status(),
    ).toBe(204);
    try {
      await page.getByRole("button", { name: "Issue Badge", exact: true }).click();
      await expect(
        page.getByText(
          "Credential signing is temporarily unavailable. No badge was issued. Try again.",
        ),
      ).toBeVisible();
    } finally {
      expect(
        (await request.post("http://127.0.0.1:3102/start", { headers: authorization })).status(),
      ).toBe(204);
    }

    await page.getByLabel("Badge Template", { exact: true }).selectOption({ label: badgeName });
    await page
      .getByLabel("Student", { exact: true })
      .selectOption({ label: "e2e-internal-student · E2E Recipient" });
    await page.getByRole("button", { name: "Issue Badge", exact: true }).click();
    await expect(page.getByText(/badge issued successfully/i)).toBeVisible();
    await page.goto("/issued");
    await expect(page.getByText(badgeName, { exact: true })).toHaveCount(1);
  });

  test("signs individual and previewed batch issuance before creating notification records", async ({
    page,
  }, testInfo) => {
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await page.goto(`/classes/${fixture.E2E_CLASS_ID}/issued`);
    const suffix = testInfo.project.name === "mobile" ? "Mobile" : "Desktop";
    await page.getByLabel("Badge Template", { exact: true }).selectOption({
      label: `Phase 8 Individual ${suffix} Badge`,
    });
    await page
      .getByLabel("Student", { exact: true })
      .selectOption({ label: "e2e-internal-student · E2E Recipient" });
    await page.getByRole("button", { name: "Issue Badge", exact: true }).click();
    await expect(page.getByText(/badge issued successfully/i)).toBeVisible();

    await page.goto(`/classes/${fixture.E2E_CLASS_ID}/issued`);
    const batchPanel = page.locator(".batch-panel");
    await batchPanel.getByLabel("Badge Template").selectOption({
      label: `Phase 8 Batch ${suffix} Badge`,
    });
    const csvPath = testInfo.outputPath(`phase8-${suffix.toLowerCase()}-batch.csv`);
    writeFileSync(
      csvPath,
      "student_number,email\ne2e-internal-student,e2e-recipient@example.test\n",
    );
    await batchPanel.getByLabel("Student Batch File").setInputFiles(csvPath);
    await batchPanel.getByRole("button", { name: "Inspect File" }).click();
    await expect(batchPanel.getByRole("heading", { name: "Map Columns" })).toBeVisible();
    await batchPanel.getByRole("button", { name: "Validate Preview" }).click();
    await expect(batchPanel.getByText("1 Ready", { exact: true })).toBeVisible();
    await batchPanel.getByLabel("Issue Only 1 Ready Credential").check();
    await batchPanel.getByRole("button", { name: "Issue 1 Credential" }).click();
    await expect(page).toHaveURL(/\/issuance-batches\//);
    await expect(page.getByText(/signed before the batch committed/i)).toBeVisible();
    await page.getByRole("link", { name: "View Credential" }).click();
    await expect(page.getByText("Email PENDING")).toBeVisible();
  });

  test("revokes a signed credential and publishes the signed status bit", async ({
    page,
    request,
  }, testInfo) => {
    const owned = projectCredential(testInfo.project.name);
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await page.goto(`/issued/${owned.issuanceId}`);
    await page.getByLabel("Revocation Reason").fill("Phase 8 E2E revocation");
    await page.getByText("I understand this revocation cannot be undone").click();
    await page.getByRole("button", { name: "Revoke Credential" }).click();
    await expect(page).toHaveURL(/notice=revoked/);
    await page.goto(`/credentials/${owned.publicId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Revoked credential")).toBeVisible();
    await expect(
      page.getByText("Cryptographic proof is valid, but this credential is revoked"),
    ).toBeVisible();

    const credentialResponse = await request.get(`/api/credentials/${owned.publicId}`);
    const credential = (await credentialResponse.json()) as {
      credentialStatus: { statusListCredential: string };
    };
    const statusPath = new URL(credential.credentialStatus.statusListCredential).pathname;
    const statusResponse = await request.get(statusPath);
    expect(statusResponse.status()).toBe(200);
    expect(await statusResponse.json()).toMatchObject({
      type: ["VerifiableCredential", "BitstringStatusListCredential"],
      proof: { cryptosuite: "eddsa-rdfc-2022" },
    });
  });
});
