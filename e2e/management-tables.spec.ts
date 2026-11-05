import type { Page } from "@playwright/test";

import { expect, test } from "./test-base";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_CLASS_ID",
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

test.describe.serial("Management tables", () => {
  test("classes and roster tables support search, filters, sorting, and protected actions", async ({
    page,
    browser,
  }, testInfo) => {
    await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
    await page.goto("/classes");
    await expect(page.getByRole("heading", { name: "My Classes" })).toBeVisible();
    expect(await page.locator(".class-table thead th").allTextContents()).toEqual([
      "Course",
      "Section",
      "Term / Academic Year",
      "Owner",
      "Status",
      "Actions",
    ]);
    const classes = page.getByRole("region", { name: "Classes table" });
    await expect(classes.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByText("Create Class", { exact: true }).first()).toBeVisible();

    await page.getByLabel("Search classes").fill("E2E-600");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(classes.locator("tbody tr")).toHaveCount(1);
    await expect(classes).toContainText("E2E-600");

    await page.goto("/classes");
    await page.getByLabel("Class status").selectOption("ACTIVE");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/status=ACTIVE/);
    for (const label of await page.locator(".class-table .status").allTextContents()) {
      expect(label).toBe("ACTIVE");
    }

    await page.getByLabel("Sort by").selectOption("courseCode");
    await page.getByLabel("Rows per page").selectOption("10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/sort=courseCode/);
    await expect(page).toHaveURL(/pageSize=10/);

    await page.goto("/classes");
    await page.getByRole("button", { name: /^Edit E2E-600/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: /^Archive E2E-600/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/classes/${fixture.E2E_CLASS_ID}/students`);
    expect(await page.locator(".roster-table thead th").allTextContents()).toEqual([
      "Student Number",
      "Full Name",
      "Email",
      "Enrollment Status",
      "Actions",
    ]);
    const roster = page.getByRole("region", { name: "Class roster table" });
    await expect(roster.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByText("Add One Student", { exact: true })).toBeVisible();
    await expect(page.getByText("Import CSV or XLSX", { exact: true })).toBeVisible();

    await page.getByLabel("Search roster").fill("e2e-internal-student");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(roster.locator("tbody tr")).toHaveCount(1);
    await expect(roster).toContainText("E2E Recipient");

    await page.goto(`/classes/${fixture.E2E_CLASS_ID}/students`);
    await page.getByLabel("Sort by").selectOption("studentNumber");
    await page.getByLabel("Rows per page").selectOption("10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/sort=studentNumber/);
    await expect(page).toHaveURL(/pageSize=10/);

    await page.getByRole("button", { name: /^Edit e2e-internal-student/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: /^Remove e2e-internal-student/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/classes");
      await page.screenshot({
        caret: "initial",
        path: "docs/screenshots/classes-desktop.png",
        fullPage: true,
      });
      await page.goto(`/classes/${fixture.E2E_CLASS_ID}/students`);
      await page.screenshot({
        caret: "initial",
        path: "docs/screenshots/class-roster-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/classes");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow).toBe(false);
      const horizontalScroll = await page
        .getByRole("region", { name: "Classes table" })
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(horizontalScroll).toBe(true);
    }

    const adminContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const adminPage = await adminContext.newPage();
    await login(adminPage, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await adminPage.goto("/classes");
    await expect(adminPage.getByRole("heading", { name: "All Classes" })).toBeVisible();
    await expect(adminPage.getByText("Read-only").first()).toBeVisible();
    await expect(adminPage.getByText("Create Class", { exact: true })).toHaveCount(0);
    await adminContext.close();
  });
});
