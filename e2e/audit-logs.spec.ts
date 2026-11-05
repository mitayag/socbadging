import type { Page } from "@playwright/test";

import { expect, test } from "./test-base";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  "E2E_ADMIN_EMAIL" | "E2E_ADMIN_PASSWORD" | "E2E_FACULTY_EMAIL" | "E2E_FACULTY_PASSWORD",
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

test.describe.serial("Audit logs management", () => {
  test("searches, filters, paginates, scrolls, and enforces Administrator access", async ({
    page,
    browser,
  }, testInfo) => {
    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await page.goto("/audit-logs");
    await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();

    const table = page.getByRole("region", { name: "Audit records table" });
    expect(await page.locator(".audit-table thead th").allTextContents()).toEqual([
      "Event",
      "Actor",
      "Record Type",
      "Recorded",
    ]);
    await expect(table.locator("tbody tr")).toHaveCount(5);
    await expect(page.locator(".faculty-result-meta")).toContainText(/\d+ audit records/);
    await expect(page.locator(".faculty-result-meta")).toContainText("Page 1 of");
    await expect(table).toHaveCSS("max-height", "550px");
    await expect(table).toHaveCSS("overflow", "auto");
    await expect(page.locator(".audit-table thead th").first()).toHaveCSS("position", "sticky");

    await page
      .getByRole("navigation", { name: "Audit records pages" })
      .getByRole("link", { name: "Next" })
      .click();
    await expect(page).toHaveURL(/page=2/);
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await expect(page.locator(".faculty-result-meta")).toContainText("Page 2 of");
    await page
      .getByRole("navigation", { name: "Audit records pages" })
      .getByRole("link", { name: "Previous" })
      .click();
    await expect(page).not.toHaveURL(/page=2/);

    const totalText = await page.locator(".faculty-result-meta").innerText();
    const total = Number(totalText.match(/(\d+) audit records/)?.[1] ?? 0);
    await page.getByLabel("Rows per page").selectOption("10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(table.locator("tbody tr")).toHaveCount(Math.min(total, 10));
    await expect(page.locator(".faculty-result-meta")).toContainText("Page 1 of");

    await page.goto("/audit-logs");
    await page.getByLabel("Search audit logs").fill("Badge");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/query=Badge/);
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const badgeRows = await table.locator("tbody tr").all();
    expect(badgeRows.length).toBeGreaterThanOrEqual(3);
    for (const row of badgeRows) {
      await expect(row).toContainText("Badge");
    }

    await page.goto("/audit-logs");
    await page.getByLabel("Search audit logs").fill("E2E Faculty");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const actorRows = await table.locator("tbody tr").all();
    expect(actorRows.length).toBeGreaterThanOrEqual(4);
    for (const row of actorRows) {
      await expect(row).toContainText("E2E Faculty");
    }

    await page.goto("/audit-logs");
    await page.getByLabel("Search audit logs").fill("BadgeIssuance");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const issuanceRows = await table.locator("tbody tr").all();
    expect(issuanceRows.length).toBeGreaterThanOrEqual(2);
    for (const row of issuanceRows) {
      await expect(row).toContainText("BadgeIssuance");
    }

    await page.goto("/audit-logs");
    await page.getByLabel("Record type").selectOption("BadgeIssuance");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/entityType=BadgeIssuance/);
    await expect(table.locator("tbody tr").first()).toBeVisible();
    expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(2);

    await page.goto("/audit-logs");
    await page.getByLabel("Event type").selectOption("badge.issued");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/action=badge.issued/);
    await expect(table.locator("tbody tr").first()).toBeVisible();
    expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(1);
    await expect(table).toContainText("Badge Issued");

    await page.goto("/audit-logs");
    await page.getByLabel("Search audit logs").fill("E2E Faculty");
    await page.getByLabel("Record type").selectOption("BadgeIssuance");
    await page.getByLabel("Event type").selectOption("badge.issued");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(1);
    await expect(table.locator("tbody tr").first()).toContainText("Badge Issued");

    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.goto("/audit-logs");
    await page.getByLabel("From date").fill(future);
    await page.getByLabel("To date").fill(future);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/No audit records match these filters/i)).toBeVisible();
    await expect(page.locator(".faculty-result-meta")).toContainText("0 audit records");

    await page.goto("/audit-logs");
    await expect(page.locator(".faculty-result-meta")).toContainText("Page 1 of");
    await page.getByLabel("Search audit logs").fill("nothing-matches-this");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/No audit records match these filters/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset" })).toBeVisible();
    await page.getByRole("link", { name: "Reset" }).click();
    await expect(page).toHaveURL(/\/audit-logs$/);
    await expect(table.locator("tbody tr").first()).toBeVisible();

    const facultyContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const facultyPage = await facultyContext.newPage();
    await login(facultyPage, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await facultyPage.goto("/audit-logs");
    await expect(
      facultyPage.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    await facultyContext.close();

    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/audit-logs");
      await page.screenshot({
        caret: "initial",
        path: "docs/screenshots/audit-logs-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/audit-logs");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow).toBe(false);
      const horizontalScroll = await page
        .getByRole("region", { name: "Audit records table" })
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(horizontalScroll).toBe(true);
      await page.screenshot({
        caret: "initial",
        path: "docs/screenshots/audit-logs-desktop-mobile.png",
        fullPage: true,
      });
    }
  });
});
