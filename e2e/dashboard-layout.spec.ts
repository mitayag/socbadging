import type { Page } from "@playwright/test";

import { expect, test } from "./test-base";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Fixture = Record<
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_STUDENT_EMAIL"
  | "E2E_STUDENT_PASSWORD",
  string
>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;

async function login(page: Page, email: string, password: string, destination: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(destination, { timeout: 20_000 });
}

const widths = [1920, 1440, 1280, 1024, 768, 390] as const;

function expectedColumns(role: string, width: number) {
  if (role === "student") return width >= 1024 ? 4 : 2;
  if (width >= 1440) return 8;
  if (width >= 1024) return 4;
  return width > 480 ? 2 : 1;
}

test.describe("Dashboard responsive layout matrix", () => {
  test("captures Admin, Faculty, and Student dashboards without horizontal overflow", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Width matrix runs once");
    await page.emulateMedia({ reducedMotion: "reduce" });

    const roles = [
      {
        name: "admin",
        email: fixture.E2E_ADMIN_EMAIL,
        password: fixture.E2E_ADMIN_PASSWORD,
        destination: /\/dashboard$/,
      },
      {
        name: "faculty",
        email: fixture.E2E_FACULTY_EMAIL,
        password: fixture.E2E_FACULTY_PASSWORD,
        destination: /\/dashboard$/,
      },
      {
        name: "student",
        email: fixture.E2E_STUDENT_EMAIL,
        password: fixture.E2E_STUDENT_PASSWORD,
        destination: /\/student$/,
      },
    ];

    for (const role of roles) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await login(page, role.email, role.password, role.destination);
      for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        await page.waitForTimeout(150);
        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(hasOverflow, `${role.name} overflow at ${width}px`).toBe(false);
        await expect(page.locator("main")).toBeVisible();
        const summaryColumns = await page.locator(".stat-grid").evaluate((element) => {
          const columns = getComputedStyle(element).gridTemplateColumns;
          return columns.split(" ").filter(Boolean).length;
        });
        expect(summaryColumns, `${role.name} KPI columns at ${width}px`).toBe(
          expectedColumns(role.name, width),
        );
        if (role.name !== "student" && width >= 1024) {
          const panelHeights = await page
            .locator(".dashboard-split > .panel")
            .evaluateAll((panels) => panels.map((panel) => panel.getBoundingClientRect().height));
          expect(panelHeights).toHaveLength(2);
          const [firstHeight = 0, secondHeight = 0] = panelHeights;
          expect(Math.abs(firstHeight - secondHeight)).toBeLessThanOrEqual(1);
        }
        await page.screenshot({
          path: `docs/screenshots/after-${role.name}-${width}.png`,
          fullPage: true,
        });
      }
    }
  });
});
