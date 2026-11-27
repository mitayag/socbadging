import type { Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  cleanupImportedRoster,
  countImportedRosterStudents,
  countNotificationDeliveries,
} from "./db";
import { expect, test } from "./test-base";

type Fixture = Record<
  | "E2E_ADMIN_EMAIL"
  | "E2E_ADMIN_PASSWORD"
  | "E2E_FACULTY_EMAIL"
  | "E2E_FACULTY_PASSWORD"
  | "E2E_NON_OWNER_EMAIL"
  | "E2E_NON_OWNER_PASSWORD"
  | "E2E_CLASS_ID",
  string
>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), ".playwright-e2e-fixture.json"), "utf8"),
) as Fixture;

const headers = ["Student Number", "First Name", "Last Name", "Email", "Program"];

function prefixFor(testInfo: { project: { name: string } }, label = "csv") {
  return `e2e-import-${testInfo.project.name}-${label}-`;
}

function quote(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(rows: string[][]) {
  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}

async function xlsx(rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Roster");
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function importedRows(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const number = `${prefix}${String(index + 1).padStart(2, "0")}`;
    return [
      number,
      "Synthetic",
      `Student ${String(index + 1).padStart(2, "0")}`,
      `${number}@example.test`,
      "BS Computer Science",
    ];
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Institutional Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In Securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

async function openImport(page: Page) {
  await page.goto(`/classes/${fixture.E2E_CLASS_ID}/students?sort=studentNumber&pageSize=50`);
  await page.getByText("Import CSV or XLSX", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upload roster file" })).toBeVisible();
}

async function selectFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByLabel("Roster CSV or XLSX").setInputFiles({ name, mimeType, buffer });
}

async function goToReview(page: Page) {
  await page.getByRole("button", { name: "Inspect file" }).click();
  await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
  await page.getByRole("button", { name: "Review students" }).click();
  await expect(page.getByRole("heading", { name: "Review students" })).toBeVisible();
}

async function confirmImport(page: Page, count: number) {
  const button = page.getByRole("button", {
    name: `Import ${count} ${count === 1 ? "Student" : "Students"}`,
  });
  await expect(button).toBeDisabled();
  await page
    .getByLabel("I reviewed these students and want to add them to this class roster.")
    .check();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
}

async function downloadText(page: Page, name: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error(`Download for ${name} did not produce a local file`);
  return { name: download.suggestedFilename(), content: readFileSync(path, "utf8") };
}

test.describe.serial("Student import acceptance", () => {
  test("downloads templates, validates files, imports CSV, and refreshes the roster", async ({
    page,
  }, testInfo) => {
    const prefix = prefixFor(testInfo, "csv");
    await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
    const notificationsBefore = await countNotificationDeliveries();
    try {
      await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
      await openImport(page);

      const csvTemplate = await downloadText(page, "Download CSV Template");
      expect(csvTemplate.name).toBe("roster-import-template.csv");
      expect(csvTemplate.content).toContain("Student Number");

      const xlsxDownloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download XLSX Template" }).click();
      const xlsxDownload = await xlsxDownloadPromise;
      expect(xlsxDownload.suggestedFilename()).toBe("roster-import-template.xlsx");
      const xlsxPath = await xlsxDownload.path();
      expect(xlsxPath).not.toBeNull();
      expect(readFileSync(xlsxPath!).byteLength).toBeGreaterThan(0);

      await expect(page.getByRole("button", { name: "Inspect file" })).toBeDisabled();
      await selectFile(
        page,
        "unsupported.txt",
        "text/plain",
        Buffer.from("Student Number,First Name"),
      );
      await expect(page.locator(".import-alert")).toContainText("Choose a .csv or .xlsx file.");

      await selectFile(page, "empty.csv", "text/csv", Buffer.from(""));
      await expect(page.locator(".import-alert")).toContainText("The selected file is empty.");

      await selectFile(page, "header-only.csv", "text/csv", Buffer.from(headers.join(",")));
      await page.getByRole("button", { name: "Inspect file" }).click();
      await expect(page.locator(".import-alert")).toContainText(
        "Roster file must contain a header and at least one row",
      );

      await selectFile(
        page,
        "replace-a.csv",
        "text/csv",
        Buffer.from(csv([headers, ["2026-9001", "Replace", "Me", "replace@example.test", "A"]])),
      );
      await expect(page.locator(".import-file-card")).toContainText("replace-a.csv");
      await expect(page.locator(".import-file-card")).toContainText(/\d+(\.\d+)? (B|KB|MB)/);
      await page.getByRole("button", { name: "Remove replace-a.csv" }).click();
      await expect(page.locator(".import-file-card")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Inspect file" })).toBeDisabled();

      const rows = importedRows(prefix, 12);
      await selectFile(
        page,
        `${prefix}valid.csv`,
        "text/csv",
        Buffer.from(csv([headers, ...rows])),
      );
      await expect(page.locator(".import-file-card")).toContainText(`${prefix}valid.csv`);
      await page.getByRole("button", { name: "Inspect file" }).click();
      await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();

      const mapping = page.locator(".import-mapping-grid");
      await expect(mapping.getByLabel("Student Number")).toHaveValue("0");
      await expect(mapping.getByLabel("First Name")).toHaveValue("1");
      await expect(mapping.getByLabel("Last Name")).toHaveValue("2");
      await expect(mapping.getByLabel("Email")).toHaveValue("3");

      await mapping.getByLabel("Student Number").selectOption("4");
      await expect(mapping.getByLabel("Student Number")).toHaveValue("4");
      await mapping.getByLabel("Student Number").selectOption("0");

      await mapping.getByLabel("First Name").selectOption("0");
      await expect(page.locator(".import-inline-alert")).toContainText(
        "Each student field must use a different column.",
      );
      await expect(page.getByRole("button", { name: "Review students" })).toBeDisabled();
      await mapping.getByLabel("First Name").selectOption("1");

      await page.getByRole("button", { name: "Review students" }).click();
      await expect(page.getByRole("heading", { name: "Review students" })).toBeVisible();
      await expect(page.locator(".import-preview-result-count")).toContainText(
        "Showing 10 of 12 filtered rows (12 total)",
      );
      const preview = page.locator(".import-preview-controls");
      const tableRows = preview.locator(".import-review-table tbody tr");
      await expect(tableRows).toHaveCount(10);

      await page.getByLabel("Search preview rows").fill(`${prefix}12`);
      await expect(tableRows).toHaveCount(1);
      await expect(tableRows.first()).toContainText(`${prefix}12`);
      await page.getByLabel("Search preview rows").clear();

      await page.getByLabel("Filter preview rows by status").selectOption("attention");
      await expect(page.getByText("No rows match the current search and filter.")).toBeVisible();
      await page.getByLabel("Filter preview rows by status").selectOption("all");

      await page.getByLabel("Sort preview rows").selectOption("email");
      await page.getByLabel("Sort direction").selectOption("desc");
      await expect(tableRows.first()).toContainText(`${prefix}12@example.test`);

      await page.getByLabel("Preview rows per page").selectOption("25");
      await expect(tableRows).toHaveCount(12);
      await page.getByLabel("Preview rows per page").selectOption("10");
      await page.getByRole("button", { name: "Next preview page" }).click();
      await expect(tableRows).toHaveCount(2);

      await confirmImport(page, 12);
      await expect(page.getByText("Students imported")).toBeVisible();
      await expect(page.locator(".import-complete-facts")).toContainText("12");
      await expect(page.locator(".import-complete-facts")).toContainText(`${prefix}valid.csv`);
      await expect(page.getByRole("button", { name: "Import 12 Students" })).toHaveCount(0);

      await expect.poll(() => countImportedRosterStudents(fixture.E2E_CLASS_ID, prefix)).toBe(12);
      expect(await countNotificationDeliveries()).toBe(notificationsBefore);

      const roster = page.getByRole("region", { name: "Class roster table" });
      await expect(roster).toContainText(`${prefix}01`);
      await page.getByRole("link", { name: "View updated roster" }).click();
      await expect(roster).toContainText(`${prefix}12`);
      await page.getByRole("button", { name: "Import another file" }).click();
      await expect(page.getByRole("heading", { name: "Upload roster file" })).toBeVisible();
    } finally {
      await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
    }
  });

  test("imports a valid XLSX file through drag-and-drop", async ({ page }, testInfo) => {
    const prefix = prefixFor(testInfo, "xlsx");
    await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
    const notificationsBefore = await countNotificationDeliveries();
    try {
      await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
      await openImport(page);

      const rows = importedRows(prefix, 2);
      const workbook = await xlsx([headers, ...rows]);
      const dataTransfer = await page.evaluateHandle(
        ({ base64, name, type }) => {
          const transfer = new DataTransfer();
          const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
          transfer.items.add(new File([bytes], name, { type }));
          return transfer;
        },
        {
          base64: workbook.toString("base64"),
          name: `${prefix}valid.xlsx`,
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      );
      await page.dispatchEvent(".import-dropzone", "drop", { dataTransfer });
      await expect(page.locator(".import-file-card")).toContainText(`${prefix}valid.xlsx`);

      await goToReview(page);
      await confirmImport(page, 2);
      await expect.poll(() => countImportedRosterStudents(fixture.E2E_CLASS_ID, prefix)).toBe(2);
      expect(await countNotificationDeliveries()).toBe(notificationsBefore);

      const roster = page.getByRole("region", { name: "Class roster table" });
      await expect(roster).toContainText(`${prefix}01`);
      await expect(roster).toContainText(`${prefix}02`);
    } finally {
      await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
    }
  });

  test("shows duplicate and invalid feedback, downloads the error report, and cancels before commit", async ({
    page,
  }, testInfo) => {
    const prefix = prefixFor(testInfo, "invalid");
    await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
    try {
      await login(page, fixture.E2E_FACULTY_EMAIL, fixture.E2E_FACULTY_PASSWORD);
      await openImport(page);

      const invalidRows = [
        importedRows(prefix, 1)[0]!,
        ["e2e-internal-student", "E2E", "Recipient", "e2e-recipient@example.test", "BS Computing"],
        ["e2e-other-student", "Wrong", "Identity", "wrong.identity@example.test", "BS Computing"],
      ];
      await selectFile(
        page,
        `${prefix}invalid.csv`,
        "text/csv",
        Buffer.from(csv([headers, ...invalidRows])),
      );
      await goToReview(page);

      await expect(page.getByText("Some rows cannot be imported.")).toBeVisible();
      await expect(page.locator(".import-summary-grid")).toContainText("1");
      await expect(page.locator(".import-summary-grid")).toContainText("2");
      await expect(page.getByText("Already enrolled in this class")).toBeVisible();
      await expect(
        page.getByText("Student number exists with different identity details"),
      ).toBeVisible();
      await expect(page.locator(".import-commit-panel")).toHaveCount(0);

      const report = await downloadText(page, "Download Error Report");
      expect(report.name).toBe("roster-import-errors.csv");
      expect(report.content).toContain("Already enrolled in this class");
      expect(report.content).toContain("Student number exists with different identity details");

      await page.getByRole("button", { name: "Back to mapping" }).click();
      await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
      await page.getByRole("button", { name: "Back to upload" }).click();
      await expect(page.getByRole("heading", { name: "Upload roster file" })).toBeVisible();
      expect(await countImportedRosterStudents(fixture.E2E_CLASS_ID, prefix)).toBe(0);

      const corrected = importedRows(prefix, 1);
      await selectFile(
        page,
        `${prefix}corrected.csv`,
        "text/csv",
        Buffer.from(csv([headers, ...corrected])),
      );
      await goToReview(page);
      await confirmImport(page, 1);
      await expect.poll(() => countImportedRosterStudents(fixture.E2E_CLASS_ID, prefix)).toBe(1);
    } finally {
      await cleanupImportedRoster(fixture.E2E_CLASS_ID, prefix);
    }
  });

  test("denies import access to Administrators, non-owners, and unauthenticated callers", async ({
    page,
    request,
  }) => {
    const file = {
      name: "unauthorized.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv([headers, ["2026-9999", "No", "Access", "no@example.test", "A"]])),
    };

    const anonymous = await request.post(
      `/api/classes/${fixture.E2E_CLASS_ID}/roster/import/inspect`,
      { multipart: { file } },
    );
    expect(anonymous.status()).not.toBe(200);

    await login(page, fixture.E2E_ADMIN_EMAIL, fixture.E2E_ADMIN_PASSWORD);
    await page.goto(`/classes/${fixture.E2E_CLASS_ID}/students`);
    await expect(page.getByText("Import CSV or XLSX", { exact: true })).toHaveCount(0);
    const adminInspect = await page.request.post(
      `/api/classes/${fixture.E2E_CLASS_ID}/roster/import/inspect`,
      { multipart: { file } },
    );
    expect(adminInspect.status()).not.toBe(200);
    const adminTemplate = await page.request.get(
      `/api/classes/${fixture.E2E_CLASS_ID}/roster/import/template.csv`,
    );
    expect(adminTemplate.status()).toBe(403);

    await login(page, fixture.E2E_NON_OWNER_EMAIL, fixture.E2E_NON_OWNER_PASSWORD);
    const nonOwnerInspect = await page.request.post(
      `/api/classes/${fixture.E2E_CLASS_ID}/roster/import/inspect`,
      { multipart: { file } },
    );
    expect(nonOwnerInspect.status()).not.toBe(200);
    const nonOwnerPreview = await page.request.post(
      `/api/classes/${fixture.E2E_CLASS_ID}/roster/import/preview`,
      {
        data: {
          filename: "unauthorized.csv",
          rows: [["2026-9999", "No", "Access", "no@example.test", "A"]],
          mapping: { studentNumber: 0, firstName: 1, lastName: 2, email: 3 },
        },
      },
    );
    expect(nonOwnerPreview.status()).not.toBe(200);
    expect(await countImportedRosterStudents(fixture.E2E_CLASS_ID, "e2e-import-")).toBe(0);
  });
});
