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
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test.describe.serial("Dashboard and global user menu", () => {
  test("renders the Administrator dashboard and the global account menu", async ({
    page,
  }, testInfo) => {
    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);

    await expect(page.getByText("Administrator Overview")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome back, E2E/ })).toBeVisible();
    for (const label of [
      "Faculty Accounts",
      "Classes",
      "Students",
      "Badge Templates",
      "Issued Badges",
      "Active Credentials",
      "Revoked Credentials",
      "Expired Credentials",
    ]) {
      await expect(
        page.getByLabel("Dashboard summary").getByText(label, { exact: true }),
      ).toBeVisible();
    }
    const issuanceSection = page
      .locator("section.panel")
      .filter({ has: page.getByRole("heading", { name: "Recent Badge Issuances" }) });
    const activitySection = page
      .locator("section.panel")
      .filter({ has: page.getByRole("heading", { name: "Recent Activities" }) });
    await expect(issuanceSection).toBeVisible();
    await expect(activitySection).toBeVisible();
    const issuanceRow = issuanceSection.locator(".recent-issuance-table tbody tr").first();
    await expect(issuanceRow).toBeVisible();
    await expect(issuanceRow).toHaveCSS("display", "table-row");
    await expect(issuanceSection.locator("tbody tr")).toHaveCount(5);
    await expect(activitySection.locator("tbody tr")).toHaveCount(5);

    await expect(page.getByRole("heading", { name: "Badge Issuance Trend" })).toBeVisible();
    const trendTrackHeight = await page
      .locator(".trend-track")
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(trendTrackHeight).toBeGreaterThanOrEqual(testInfo.project.name === "mobile" ? 118 : 178);

    if (testInfo.project.name !== "mobile") {
      const panelHeights = await page
        .locator(".dashboard-split > .panel")
        .evaluateAll((panels) => panels.map((panel) => panel.getBoundingClientRect().height));
      expect(panelHeights).toHaveLength(2);
      const [firstHeight = 0, secondHeight = 0] = panelHeights;
      expect(Math.abs(firstHeight - secondHeight)).toBeLessThanOrEqual(1);
    }

    for (const section of [issuanceSection, activitySection]) {
      const scroll = section.locator(".dashboard-record-scroll");
      await expect(scroll).toHaveCSS("max-height", "360px");
      await expect(scroll).toHaveCSS("overflow", "auto");
      await expect(section.locator("thead th").first()).toHaveCSS("position", "sticky");
    }

    const issuancePager = page.getByRole("navigation", { name: "Badge issuance pages" });
    const activityPager = page.getByRole("navigation", { name: "Activity pages" });
    const issuanceFooter = issuanceSection.locator(".dashboard-record-footer");
    const activityFooter = activitySection.locator(".dashboard-record-footer");
    await expect(issuanceFooter).toContainText("Page 1 of");
    await expect(issuanceFooter).toContainText("record");
    await expect(activityFooter).toContainText("Page 1 of");
    await expect(activityFooter).toContainText("record");

    await issuancePager.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/issuancePage=2/);
    await expect(issuanceSection.locator("tbody tr")).toHaveCount(5);
    await expect(issuanceFooter).toContainText("Page 2 of");
    await issuancePager.getByRole("link", { name: "Previous" }).click();
    await expect(page).not.toHaveURL(/issuancePage=2/);

    await activityPager.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/activityPage=2/);
    await expect(activityFooter).toContainText("Page 2 of");
    await activityPager.getByRole("link", { name: "Previous" }).click();
    await expect(page).not.toHaveURL(/activityPage=2/);

    await page.goto("/issued");
    await expect(page.getByRole("heading", { name: "Issued Badges", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Issued badges table" })).toBeVisible();
    await expect(page.locator(".issuance-table thead th").first()).toHaveText("Badge");
    await expect(page.locator(".issuance-table tbody tr")).toHaveCount(5);
    await expect(page.getByText("Credential data unavailable").first()).toBeVisible();
    await expect(page.getByText("UNAVAILABLE").first()).toBeVisible();
    await expect(page.getByText("Unavailable record").first()).toBeVisible();
    await page.screenshot({
      caret: "initial",
      path: `docs/screenshots/issued-badges${testInfo.project.name === "mobile" ? "-mobile" : ""}.png`,
      fullPage: true,
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Quick Actions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent Activities" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Faculty" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const projectSuffix = testInfo.project.name === "mobile" ? "-mobile" : "";
    await page.screenshot({
      path: `docs/screenshots/admin-dashboard${projectSuffix}.png`,
      fullPage: true,
    });

    const trigger = page.getByRole("button", {
      name: "Open user menu for E2E Administrator",
    });
    await trigger.click();
    const menu = page.getByRole("menu", { name: "User menu" });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("E2E Administrator");
    await expect(menu).toContainText("System Administrator");
    await expect(page.getByRole("menuitem", { name: "My Profile" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Account Settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole("menuitem", { name: "Account Settings" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Account Settings" })).toBeVisible();

    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Your Account" })).toBeVisible();

    await page.goto("/dashboard");
    await trigger.click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("renders a Faculty-scoped dashboard without Administrator metrics", async ({
    page,
  }, testInfo) => {
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);

    await expect(page.getByText("Faculty Overview")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome back, E2E/ })).toBeVisible();
    for (const label of [
      "My Classes",
      "Enrolled Students",
      "Badge Templates",
      "Badges Issued",
      "Active Credentials",
      "Revoked Credentials",
      "Expired Credentials",
    ]) {
      await expect(
        page.getByLabel("Dashboard summary").getByText(label, { exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByLabel("Dashboard summary").getByText("Faculty Accounts", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create Class" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Badge" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Issue Badge" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const projectSuffix = testInfo.project.name === "mobile" ? "-mobile" : "";
    await page.screenshot({
      path: `docs/screenshots/faculty-dashboard${projectSuffix}.png`,
      fullPage: true,
    });

    await page.getByRole("button", { name: "Open user menu for E2E Faculty" }).click();
    await expect(page.getByRole("menu", { name: "User menu" })).toContainText("Faculty");
    await page.getByRole("menuitem", { name: "My Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Your Professional Details" })).toBeVisible();
  });
});
