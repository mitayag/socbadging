import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./test-base";

type Fixture = Record<
  | "E2E_SIGNED_REPLACEMENT_PUBLIC_ID"
  | "E2E_SIGNED_REPLACEMENT_ISSUANCE_ID"
  | "E2E_STUDENT_EMAIL"
  | "E2E_STUDENT_PASSWORD",
  string
>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;

async function loginStudent(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(fixture.E2E_STUDENT_EMAIL);
  await page.getByLabel("Password").fill(fixture.E2E_STUDENT_PASSWORD);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/student$/);
}

test.describe("Stage 6A public credential sharing", () => {
  test("publishes privacy-safe Open Graph metadata and official share links", async ({ page }) => {
    await page.goto(`/credentials/${fixture.E2E_SIGNED_REPLACEMENT_PUBLIC_ID}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /Phase 8 Signed Badge/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /^http:\/\/127\.0\.0\.1:3100\//,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      new RegExp(`/credentials/${fixture.E2E_SIGNED_REPLACEMENT_PUBLIC_ID}$`),
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", /.+/);

    const html = await page.content();
    expect(html).not.toContain("e2e-recipient@example.test");
    expect(html).not.toContain("2026-00001");

    await expect(
      page.getByRole("link", { name: "Add certification to LinkedIn profile" }),
    ).toHaveAttribute("href", /linkedin\.com\/profile\/add/);
    await expect(page.getByRole("link", { name: "Share on LinkedIn" })).toHaveAttribute(
      "href",
      /linkedin\.com\/sharing/,
    );
    await expect(page.getByRole("link", { name: "Share on Facebook" })).toHaveAttribute(
      "href",
      /facebook\.com\/sharer/,
    );
    await expect(page.getByRole("link", { name: "Share on X" })).toHaveAttribute(
      "href",
      /x\.com\/intent/,
    );
    await expect(page.getByRole("button", { name: /copy verification link/i })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "QR code for the public credential verification page" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Download Badge Image" })).toBeVisible();
  });

  test("student credential detail exposes sharing without private data", async ({ page }) => {
    await loginStudent(page);
    await page.goto(`/student/badges/${fixture.E2E_SIGNED_REPLACEMENT_ISSUANCE_ID}`);

    await expect(
      page.getByRole("link", { name: "Add certification to LinkedIn profile" }),
    ).toHaveAttribute("href", /linkedin\.com\/profile\/add/);
    await expect(page.getByRole("button", { name: /copy verification link/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download Badge Image" })).toBeVisible();

    await expect(page.locator("main").getByText("e2e-recipient@example.test")).toHaveCount(0);
    await expect(page.locator("main").getByText("2026-00001")).toHaveCount(0);
  });
});
