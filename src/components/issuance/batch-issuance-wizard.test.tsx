import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BatchIssuanceWizard } from "./batch-issuance-wizard";

const badgeOptions = [
  { id: "badge-1", name: "Academic Excellence" },
  { id: "badge-2", name: "Community Leadership" },
];

describe("BatchIssuanceWizard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts with accessible choices and disables inspection until a badge and file are selected", () => {
    render(
      <BatchIssuanceWizard badgeOptions={badgeOptions} classId="class-1" commitAction={vi.fn()} />,
    );

    expect(screen.getByLabelText("Badge Template")).toBeInTheDocument();
    expect(screen.getByLabelText("Student Batch File")).toHaveAttribute("accept", ".csv,.xlsx");
    expect(screen.getByRole("button", { name: "Inspect File" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Download CSV Template" })).toHaveAttribute(
      "href",
      "/api/classes/class-1/issued/batch/template.csv",
    );
  });

  it("maps required Student Number, offers Do Not Map for Email, and previews mixed rows", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          headers: ["Email", "Student Number"],
          rows: [
            ["ada@example.edu", "2026-0001"],
            ["", "2026-0002"],
            ["", "missing"],
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "batch-1",
          classId: "class-1",
          badgeTemplateId: "badge-1",
          facultyUserId: "faculty-1",
          sourceFilename: "students.csv",
          mapping: { studentNumber: 1, email: null },
          previewFingerprint: "a".repeat(64),
          totalRows: 3,
          readyCount: 1,
          alreadyIssuedCount: 1,
          invalidCount: 1,
          issuedCount: 0,
          status: "READY",
          expiresAt: "2026-08-14T12:00:00.000Z",
          committedAt: null,
          createdAt: "2026-08-14T11:30:00.000Z",
          updatedAt: "2026-08-14T11:30:00.000Z",
          rows: [
            {
              rowNumber: 2,
              studentNumber: "2026-0001",
              emailSupplied: null,
              disposition: "READY",
              message: "Ready to issue",
              studentId: "student-1",
              issuanceId: null,
              publicId: null,
            },
            {
              rowNumber: 3,
              studentNumber: "2026-0002",
              emailSupplied: null,
              disposition: "ALREADY_ISSUED",
              message: "Already issued",
              studentId: "student-2",
              issuanceId: "issuance-2",
              publicId: "public-2",
            },
            {
              rowNumber: 4,
              studentNumber: "missing",
              emailSupplied: null,
              disposition: "STUDENT_NOT_FOUND",
              message: "Student not found",
              studentId: null,
              issuanceId: null,
              publicId: null,
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BatchIssuanceWizard badgeOptions={badgeOptions} classId="class-1" commitAction={vi.fn()} />,
    );

    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.upload(
      screen.getByLabelText("Student Batch File"),
      new File(["student"], "students.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Inspect File" }));

    expect(screen.getByRole("heading", { name: "Map Columns" })).toBeInTheDocument();
    expect(screen.getByLabelText("Student Number Column")).toHaveValue("1");
    expect(screen.getByLabelText("Email Column")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Do Not Map" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Validate Preview" }));

    expect(await screen.findByRole("heading", { name: "Validation Preview" })).toBeInTheDocument();
    expect(screen.getByText("1 Ready")).toBeInTheDocument();
    expect(screen.getByText("1 Already Issued")).toBeInTheDocument();
    expect(screen.getByText("1 Invalid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Validation Report" })).toHaveAttribute(
      "href",
      "/api/issuance-batches/batch-1/report",
    );
    expect(screen.getByText("Student Not Found")).toBeInTheDocument();
    expect(screen.getByLabelText("Issue Only 1 Ready Credential")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Issue 1 Credential" })).toBeDisabled();
    await user.click(screen.getByLabelText("Issue Only 1 Ready Credential"));
    expect(screen.getByRole("button", { name: "Issue 1 Credential" })).toBeEnabled();
    expect(document.querySelector('input[name="batchId"]')).toHaveValue("batch-1");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Row",
      "Student Number",
      "Email Supplied",
      "Disposition",
      "Message",
    ]);
    expect(screen.getAllByRole("cell").length).toBeGreaterThan(0);
  });

  it("shows safe pending and error states and resets a preview when the badge changes", async () => {
    const user = userEvent.setup();
    let resolveInspect: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInspect = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BatchIssuanceWizard badgeOptions={badgeOptions} classId="class-1" commitAction={vi.fn()} />,
    );
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.upload(
      screen.getByLabelText("Student Batch File"),
      new File(["student"], "students.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Inspect File" }));
    expect(screen.getByRole("status")).toHaveTextContent("Inspecting File");
    resolveInspect?.({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Unable to inspect" }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to inspect");

    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-2");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Map Columns" })).not.toBeInTheDocument();
  });

  it("ignores an inspection response when the badge changes while the request is pending", async () => {
    const user = userEvent.setup();
    let resolveInspect: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveInspect = resolve;
          }),
      ),
    );
    render(
      <BatchIssuanceWizard badgeOptions={badgeOptions} classId="class-1" commitAction={vi.fn()} />,
    );
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.upload(
      screen.getByLabelText("Student Batch File"),
      new File(["student"], "students.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Inspect File" }));
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-2");
    resolveInspect?.({
      ok: true,
      json: vi.fn().mockResolvedValue({ headers: ["Student Number"], rows: [["2026-1"]] }),
    });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Map Columns" })).not.toBeInTheDocument();
  });

  it("ignores an in-flight preview and resets mapping when the selected file changes", async () => {
    const user = userEvent.setup();
    let resolvePreview: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            headers: ["Student Number"],
            rows: [["2026-1"]],
          }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolvePreview = resolve;
            }),
        ),
    );
    render(
      <BatchIssuanceWizard badgeOptions={badgeOptions} classId="class-1" commitAction={vi.fn()} />,
    );
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    const fileInput = screen.getByLabelText("Student Batch File");
    await user.upload(fileInput, new File(["first"], "first.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Inspect File" }));
    await user.click(screen.getByRole("button", { name: "Validate Preview" }));
    expect(screen.getByRole("status")).toHaveTextContent("Validating Preview");

    await user.upload(fileInput, new File(["second"], "second.csv", { type: "text/csv" }));
    resolvePreview?.({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "stale-batch" }),
    });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Map Columns" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Validation Preview" })).not.toBeInTheDocument();
  });

  it("shows a disabled commit control when a validated preview has no ready rows", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            headers: ["Student Number"],
            rows: [["missing"]],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            id: "batch-zero",
            classId: "class-1",
            badgeTemplateId: "badge-1",
            facultyUserId: "faculty-1",
            sourceFilename: "students.csv",
            mapping: { studentNumber: 0, email: null },
            previewFingerprint: "a".repeat(64),
            totalRows: 1,
            readyCount: 0,
            alreadyIssuedCount: 0,
            invalidCount: 1,
            issuedCount: 0,
            status: "READY",
            expiresAt: "2026-08-14T12:00:00.000Z",
            committedAt: null,
            createdAt: "2026-08-14T11:30:00.000Z",
            updatedAt: "2026-08-14T11:30:00.000Z",
            rows: [
              {
                rowNumber: 2,
                studentNumber: "missing",
                emailSupplied: null,
                disposition: "STUDENT_NOT_FOUND",
                message: "Student not found",
                studentId: null,
                issuanceId: null,
                publicId: null,
              },
            ],
          }),
        }),
    );
    render(
      <BatchIssuanceWizard badgeOptions={badgeOptions} classId="class-1" commitAction={vi.fn()} />,
    );
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.upload(
      screen.getByLabelText("Student Batch File"),
      new File(["student"], "students.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Inspect File" }));
    await user.click(screen.getByRole("button", { name: "Validate Preview" }));
    expect(await screen.findByRole("button", { name: "Issue 0 Credentials" })).toBeDisabled();
    expect(screen.getByText("No ready rows are available to issue.")).toBeInTheDocument();
  });

  it("announces the exact safe signing failure separately from validation errors", async () => {
    const user = userEvent.setup();
    const commitAction = vi.fn().mockResolvedValue({
      status: "signing-error",
      message: "Signing unavailable; no credentials were issued.",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            headers: ["Student Number"],
            rows: [["2026-0001"]],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            id: "batch-signing-failure",
            classId: "class-1",
            badgeTemplateId: "badge-1",
            facultyUserId: "faculty-1",
            sourceFilename: "students.csv",
            mapping: { studentNumber: 0, email: null },
            previewFingerprint: "a".repeat(64),
            totalRows: 1,
            readyCount: 1,
            alreadyIssuedCount: 0,
            invalidCount: 0,
            issuedCount: 0,
            status: "READY",
            expiresAt: "2026-08-14T12:00:00.000Z",
            committedAt: null,
            createdAt: "2026-08-14T11:30:00.000Z",
            updatedAt: "2026-08-14T11:30:00.000Z",
            rows: [
              {
                rowNumber: 2,
                studentNumber: "2026-0001",
                emailSupplied: null,
                disposition: "READY",
                message: "Ready to issue.",
                studentId: "student-1",
                issuanceId: null,
                publicId: null,
              },
            ],
          }),
        }),
    );
    render(
      <BatchIssuanceWizard
        badgeOptions={badgeOptions}
        classId="class-1"
        commitAction={commitAction}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Badge Template"), "badge-1");
    await user.upload(
      screen.getByLabelText("Student Batch File"),
      new File(["student"], "students.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Inspect File" }));
    await user.click(screen.getByRole("button", { name: "Validate Preview" }));
    await screen.findByRole("heading", { name: "Validation Preview" });
    await user.click(screen.getByLabelText("Issue Only 1 Ready Credential"));
    const submit = screen.getByRole("button", { name: "Issue 1 Credential" });
    await user.click(submit);

    const feedback = await screen.findByRole("status");
    expect(feedback).toHaveTextContent("Signing unavailable; no credentials were issued.");
    expect(feedback).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
  });
});
