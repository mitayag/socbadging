import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanupImportedRoster } from "./db";
import { expect, test } from "./test-base";

type Fixture = Record<"E2E_FACULTY_EMAIL" | "E2E_FACULTY_PASSWORD" | "E2E_CLASS_ID", string>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;
const prefix = "e2e-import-evidence-";
const headers = ["Student Number", "First Name", "Last Name", "Email", "Program"];
const evidenceDirectory = "docs/evidence/student-import-uiux";

function csv(rows: string[][]) {
  return rows.map((row) => row.join(",")).join("\r\n");
}

function rows(count: number, group: string) {
  return Array.from({ length: count }, (_, index) => {
    const number = `${prefix}${group}-${String(index + 1).padStart(2, "0")}`;
    return [
      number,
      "Synthetic",
      `Student ${String(index + 1).padStart(2, "0")}`,
      `${number}@example.test`,
      "BS Computer Science",
    ];
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(fixture.E2E_FACULTY_EMAIL);
  await page.getByLabel("Password").fill(fixture.E2E_FACULTY_PASSWORD);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

async function openImport(page: Page) {
  await page.goto(`/classes/${fixture.E2E_CLASS_ID}/students`);
  await page.getByText("Import CSV or XLSX", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upload roster file" })).toBeVisible();
}

async function selectCsv(page: Page, name: string, contents: string) {
  await page.getByLabel("Roster CSV or XLSX").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(contents),
  });
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

async function screenshotWizard(page: Page, name: string) {
  await page.locator(".student-import").screenshot({
    path: `${evidenceDirectory}/${name}.png`,
  });
}

async function reviewCurrentFile(page: Page) {
  await page.getByRole("button", { name: "Inspect file" }).click();
  await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
  await page.getByRole("button", { name: "Review students" }).click();
  await expect(page.getByRole("heading", { name: "Review students" })).toBeVisible();
}

async function confirm(page: Page, count: number) {
  await page
    .getByLabel("I reviewed these students and want to add them to this class roster.")
    .check();
  await page
    .getByRole("button", { name: `Import ${count} ${count === 1 ? "Student" : "Students"}` })
    .click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
}

test("captures final Student Import evidence from the production build", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Evidence is captured once from the desktop project",
  );
  await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
  try {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openImport(page);
    await screenshotWizard(page, "01-upload-initial-desktop");

    const validRows = rows(12, "desktop");
    await selectCsv(page, `${prefix}valid.csv`, csv([headers, ...validRows]));
    await expect(page.locator(".import-file-card")).toContainText(`${prefix}valid.csv`);
    await screenshotWizard(page, "02-upload-selected-desktop");

    await page.getByRole("button", { name: "Inspect file" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
    await screenshotWizard(page, "03-column-mapping-desktop");

    const mapping = page.locator(".import-mapping-grid");
    await mapping.getByLabel("First Name").selectOption("0");
    await expect(page.locator(".import-inline-alert")).toContainText(
      "Each student field must use a different column.",
    );
    await screenshotWizard(page, "04-mapping-validation-error-desktop");
    await mapping.getByLabel("First Name").selectOption("1");

    await page.getByRole("button", { name: "Review students" }).click();
    await expect(page.getByRole("heading", { name: "Review students" })).toBeVisible();
    await screenshotWizard(page, "05-review-valid-desktop");

    await page.getByRole("button", { name: "Back to mapping" }).click();
    await page.getByRole("button", { name: "Back to upload" }).click();
    await expect(page.getByRole("heading", { name: "Upload roster file" })).toBeVisible();

    const invalidRows = [
      rows(1, "invalid")[0]!,
      ["e2e-internal-student", "E2E", "Recipient", "e2e-recipient@example.test", "BS Computing"],
      ["e2e-other-student", "Wrong", "Identity", "wrong.identity@example.test", "BS Computing"],
    ];
    await selectCsv(page, `${prefix}invalid.csv`, csv([headers, ...invalidRows]));
    await reviewCurrentFile(page);
    await expect(page.getByText("Some rows cannot be imported.")).toBeVisible();
    await screenshotWizard(page, "06-review-invalid-duplicates-desktop");

    await page.getByRole("button", { name: "Back to mapping" }).click();
    await page.getByRole("button", { name: "Back to upload" }).click();
    await expect(page.getByRole("heading", { name: "Upload roster file" })).toBeVisible();

    await selectCsv(page, `${prefix}valid.csv`, csv([headers, ...validRows]));
    await reviewCurrentFile(page);
    await page
      .getByLabel("I reviewed these students and want to add them to this class roster.")
      .check();
    await page.locator(".import-commit-panel").screenshot({
      path: `${evidenceDirectory}/07-import-confirmation-desktop.png`,
    });

    await page.getByRole("button", { name: "Import 12 Students" }).click();
    await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
    await screenshotWizard(page, "08-import-complete-desktop");

    await page.getByRole("link", { name: "View updated roster" }).click();
    await page.getByLabel("Search roster").fill(prefix);
    await page.getByLabel("Rows per page").selectOption("50");
    await page.getByRole("button", { name: "Apply" }).click();
    const roster = page.getByRole("region", { name: "Class roster table" });
    await expect(roster).toContainText(`${prefix}desktop-12`);
    await page.screenshot({
      path: `${evidenceDirectory}/09-updated-roster-desktop.png`,
      fullPage: true,
    });

    await page.setViewportSize({ width: 768, height: 1024 });
    await openImport(page);
    await expectNoPageOverflow(page);
    await selectCsv(page, `${prefix}mapping-tablet.csv`, csv([headers, ...rows(3, "tablet")]));
    await page.getByRole("button", { name: "Inspect file" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
    await screenshotWizard(page, "15-column-mapping-tablet");

    await page.setViewportSize({ width: 390, height: 844 });
    await openImport(page);
    await expectNoPageOverflow(page);
    await screenshotWizard(page, "10-upload-mobile");

    await selectCsv(page, `${prefix}mobile.csv`, csv([headers, ...rows(3, "mobile")]));
    await page.getByRole("button", { name: "Inspect file" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
    await screenshotWizard(page, "11-column-mapping-mobile");

    await page.getByRole("button", { name: "Review students" }).click();
    await expect(page.getByRole("heading", { name: "Review students" })).toBeVisible();
    await expectNoPageOverflow(page);
    await screenshotWizard(page, "12-review-mobile");

    await confirm(page, 3);
    await screenshotWizard(page, "13-import-summary-mobile");
  } finally {
    await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
  }
});
