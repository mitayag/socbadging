import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportWizard } from "./import-wizard";

describe("ImportWizard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers accessible CSV and XLSX templates before uploading a roster", () => {
    render(<ImportWizard classId="class-123" commitAction={vi.fn()} />);

    expect(
      screen.getByText(
        "Start with a template, replace the example row with your students, then upload the completed file.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download CSV Template" })).toHaveAttribute(
      "href",
      "/api/classes/class-123/roster/import/template.csv",
    );
    expect(screen.getByRole("link", { name: "Download XLSX Template" })).toHaveAttribute(
      "href",
      "/api/classes/class-123/roster/import/template.xlsx",
    );
  });

  it("preserves the in-progress mapping and validated preview when templates are downloaded", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          headers: ["Email", "Last Name", "Student Number", "First Name"],
          rows: [["ada@example.edu", "Lovelace", "2026-0001", "Ada"]],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
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
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ImportWizard classId="class-123" commitAction={vi.fn()} />);

    const file = new File(
      ["Student Number,First Name,Last Name,Email\n2026-0001,Ada,Lovelace,ada@example.edu"],
      "roster.csv",
      { type: "text/csv" },
    );
    const fileInput = screen.getByLabelText("Roster CSV or XLSX");
    await user.upload(fileInput, file);
    expect(Array.from((fileInput as HTMLInputElement).files ?? [])).toEqual([file]);

    await user.click(screen.getByRole("button", { name: "Upload and Map" }));

    const mapping = {
      studentNumber: screen.getByLabelText("studentNumber"),
      firstName: screen.getByLabelText("firstName"),
      lastName: screen.getByLabelText("lastName"),
      email: screen.getByLabelText("email"),
    };
    expect(mapping.studentNumber).toHaveValue("2");
    expect(mapping.firstName).toHaveValue("3");
    expect(mapping.lastName).toHaveValue("1");
    expect(mapping.email).toHaveValue("0");
    expect(screen.queryByRole("button", { name: "Commit 1 Students" })).not.toBeInTheDocument();

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

    expect(Array.from((fileInput as HTMLInputElement).files ?? [])).toEqual([file]);
    expect(mapping.studentNumber).toHaveValue("2");
    expect(mapping.firstName).toHaveValue("3");
    expect(mapping.lastName).toHaveValue("1");
    expect(mapping.email).toHaveValue("0");
    expect(screen.queryByRole("button", { name: "Commit 1 Students" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Validate Preview" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/classes/class-123/roster/import/preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          filename: "roster.csv",
          rows: [["ada@example.edu", "Lovelace", "2026-0001", "Ada"]],
          mapping: { studentNumber: 2, firstName: 3, lastName: 1, email: 0 },
        }),
      }),
    );
    expect(screen.getByText("Validation Preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit 1 Students" })).toBeInTheDocument();

    await user.click(csvTemplate);
    await user.click(xlsxTemplate);

    expect(interceptedDownloads).toEqual([
      "/api/classes/class-123/roster/import/template.csv",
      "/api/classes/class-123/roster/import/template.xlsx",
      "/api/classes/class-123/roster/import/template.csv",
      "/api/classes/class-123/roster/import/template.xlsx",
    ]);
    expect(Array.from((fileInput as HTMLInputElement).files ?? [])).toEqual([file]);
    expect(screen.getByText("Validation Preview")).toBeInTheDocument();
    expect(
      screen.getByText(/Row 2: 2026-0001 · Ada Lovelace · ada@example.edu/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit 1 Students" })).toBeInTheDocument();
    expect(document.querySelector('input[name="previewId"]')).toHaveValue("preview-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
