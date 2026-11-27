import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportCommitState, ImportPreview } from "./import-types";
import { ImportWizard } from "./import-wizard";

const successfulInspection = {
  headers: ["Email", "Last Name", "Student Number", "First Name"],
  rows: [["ada@example.edu", "Lovelace", "2026-0001", "Ada"]],
};

const successfulPreview: ImportPreview = {
  id: "preview-123",
  validCount: 1,
  errorCount: 0,
  rows: [
    {
      rowNumber: 2,
      studentNumber: "2026-0001",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.edu",
      errors: [],
    },
  ],
};

const rosterFile = () =>
  new File(
    ["Student Number,First Name,Last Name,Email\n2026-0001,Ada,Lovelace,ada@example.edu"],
    "roster.csv",
    { type: "text/csv" },
  );

function mockInspectAndPreview(preview: ImportPreview = successfulPreview) {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(successfulInspection),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(preview),
    });
}

async function goToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText("Roster CSV or XLSX"), rosterFile());
  await user.click(screen.getByRole("button", { name: "Inspect file" }));
  await screen.findByRole("heading", { name: "Map columns" });
  await user.click(screen.getByRole("button", { name: "Review students" }));
  await screen.findByRole("heading", { name: "Review students" });
}

describe("ImportWizard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers accessible templates and a four-step progress indicator before upload", () => {
    render(<ImportWizard classId="class-123" commitAction={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Upload roster file" })).toBeInTheDocument();
    expect(screen.getByText("Need a starting point?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download CSV Template" })).toHaveAttribute(
      "href",
      "/api/classes/class-123/roster/import/template.csv",
    );
    expect(screen.getByRole("link", { name: "Download XLSX Template" })).toHaveAttribute(
      "href",
      "/api/classes/class-123/roster/import/template.xlsx",
    );
    const progress = screen.getByRole("list", { name: "Import progress" });
    expect(within(progress).getByText("Upload")).toBeInTheDocument();
    expect(within(progress).getByText("Map columns")).toBeInTheDocument();
    expect(within(progress).getByText("Review")).toBeInTheDocument();
    expect(within(progress).getByText("Complete")).toBeInTheDocument();
  });

  it("rejects unsupported and oversized files before contacting the server", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportWizard classId="class-123" commitAction={vi.fn()} />);

    const input = screen.getByLabelText("Roster CSV or XLSX");
    fireEvent.change(input, {
      target: { files: [new File(["not a roster"], "roster.txt", { type: "text/plain" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a .csv or .xlsx file.");

    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array(2 * 1024 * 1024 + 1)], "roster.csv", { type: "text/csv" }),
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The selected file is larger than 2 MiB.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auto-maps columns, preserves state during template downloads, and imports after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = mockInspectAndPreview();
    vi.stubGlobal("fetch", fetchMock);
    const commitAction = vi
      .fn<(previous: ImportCommitState, form: FormData) => Promise<ImportCommitState>>()
      .mockResolvedValue({
        status: "success",
        message: "Imported 1 student into the class roster.",
        importedCount: 1,
      });

    render(<ImportWizard classId="class-123" commitAction={commitAction} />);

    const input = screen.getByLabelText("Roster CSV or XLSX");
    const file = rosterFile();
    await user.upload(input, file);
    expect(Array.from((input as HTMLInputElement).files ?? [])).toEqual([file]);
    await user.click(screen.getByRole("button", { name: "Inspect file" }));

    expect(await screen.findByRole("heading", { name: "Map columns" })).toBeInTheDocument();
    expect(screen.getByLabelText("Student Number")).toHaveValue("2");
    expect(screen.getByLabelText("First Name")).toHaveValue("3");
    expect(screen.getByLabelText("Last Name")).toHaveValue("1");
    expect(screen.getByLabelText("Email")).toHaveValue("0");
    expect(screen.queryByRole("button", { name: /^Import/ })).not.toBeInTheDocument();

    const csvTemplate = screen.getByRole("link", { name: "Download CSV Template" });
    const xlsxTemplate = screen.getByRole("link", { name: "Download XLSX Template" });
    const interceptedDownloads: string[] = [];
    for (const link of [csvTemplate, xlsxTemplate]) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        interceptedDownloads.push(link.getAttribute("href") ?? "");
      });
      await user.click(link);
    }

    expect(Array.from((input as HTMLInputElement).files ?? [])).toEqual([file]);
    expect(screen.getByLabelText("Student Number")).toHaveValue("2");
    expect(screen.getByLabelText("Email")).toHaveValue("0");
    expect(interceptedDownloads).toEqual([
      "/api/classes/class-123/roster/import/template.csv",
      "/api/classes/class-123/roster/import/template.xlsx",
    ]);

    await user.click(screen.getByRole("button", { name: "Review students" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/classes/class-123/roster/import/preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          filename: "roster.csv",
          rows: successfulInspection.rows,
          mapping: { studentNumber: 2, firstName: 3, lastName: 1, email: 0 },
        }),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Review students" })).toBeInTheDocument();
    const summary = screen.getByRole("group", { name: "Validation summary" });
    expect(summary).toHaveTextContent("Ready to import");
    expect(summary).toHaveTextContent("Need attention");
    expect(summary).toHaveTextContent("Total rows");
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.edu")).toBeInTheDocument();
    expect(screen.getByText("Validated")).toBeInTheDocument();
    expect(screen.getByText("Confirm roster import")).toBeInTheDocument();

    const importButton = screen.getByRole("button", { name: "Import 1 Student" });
    expect(importButton).toBeDisabled();
    await user.click(
      screen.getByLabelText("I reviewed these students and want to add them to this class roster."),
    );
    expect(importButton).toBeEnabled();
    await user.click(importButton);

    expect(await screen.findByRole("heading", { name: "Import complete" })).toBeInTheDocument();
    expect(screen.getByText("Roster imported successfully")).toBeInTheDocument();
    expect(screen.getByText("Imported 1 student into the class roster.")).toBeInTheDocument();
    expect(commitAction).toHaveBeenCalledTimes(1);
    const submitted = commitAction.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("previewId")).toBe("preview-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves the selected file and manual mapping across backward navigation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(successfulInspection),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(successfulInspection),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportWizard classId="class-123" commitAction={vi.fn()} />);

    await user.upload(screen.getByLabelText("Roster CSV or XLSX"), rosterFile());
    await user.click(screen.getByRole("button", { name: "Inspect file" }));
    await screen.findByRole("heading", { name: "Map columns" });
    await user.selectOptions(screen.getByLabelText("First Name"), "0");

    await user.click(screen.getByRole("button", { name: "Back to upload" }));
    expect(screen.getByRole("heading", { name: "Upload roster file" })).toBeInTheDocument();
    expect(screen.getByText("roster.csv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Inspect file" }));
    await screen.findByRole("heading", { name: "Map columns" });
    expect(screen.getByLabelText("Student Number")).toHaveValue("2");
    expect(screen.getByLabelText("First Name")).toHaveValue("0");
    expect(screen.getByLabelText("Email")).toHaveValue("0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks review when two fields use the same column", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", mockInspectAndPreview());
    render(<ImportWizard classId="class-123" commitAction={vi.fn()} />);

    await user.upload(screen.getByLabelText("Roster CSV or XLSX"), rosterFile());
    await user.click(screen.getByRole("button", { name: "Inspect file" }));
    await screen.findByRole("heading", { name: "Map columns" });

    await user.selectOptions(screen.getByLabelText("First Name"), "2");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Each student field must use a different column.",
    );
    expect(screen.getByRole("button", { name: "Review students" })).toBeDisabled();
  });

  it("shows validation errors and prevents commit until the file is corrected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockInspectAndPreview({
        ...successfulPreview,
        validCount: 0,
        errorCount: 1,
        rows: [
          {
            rowNumber: 2,
            studentNumber: "2026-0001",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.edu",
            errors: ["Already enrolled in this class"],
          },
        ],
      }),
    );
    render(<ImportWizard classId="class-123" commitAction={vi.fn()} />);

    await goToReview(user);

    expect(screen.getByText("Some rows cannot be imported.")).toBeInTheDocument();
    expect(screen.getByText("Already enrolled in this class")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Error Report" })).toHaveAttribute(
      "href",
      "/api/roster-imports/preview-123/errors",
    );
    expect(screen.queryByText("Confirm roster import")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import / })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upload a corrected file" }));
    expect(screen.getByRole("heading", { name: "Upload roster file" })).toBeInTheDocument();
    expect(screen.queryByText("roster.csv")).not.toBeInTheDocument();
  });

  it("keeps the reviewed rows visible when the server rejects the import", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", mockInspectAndPreview());
    const commitAction = vi
      .fn<(previous: ImportCommitState, form: FormData) => Promise<ImportCommitState>>()
      .mockResolvedValue({
        status: "error",
        message: "Import preview is no longer available",
        importedCount: 0,
      });
    render(<ImportWizard classId="class-123" commitAction={commitAction} />);

    await goToReview(user);
    await user.click(
      screen.getByLabelText("I reviewed these students and want to add them to this class roster."),
    );
    await user.click(screen.getByRole("button", { name: "Import 1 Student" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Import preview is no longer available",
    );
    expect(screen.getByRole("heading", { name: "Review students" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Import complete" })).not.toBeInTheDocument();
    await waitFor(() => expect(commitAction).toHaveBeenCalledTimes(1));
  });
});
