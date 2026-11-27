import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { ImportPreviewRow } from "./import-types";
import { ImportPreviewTable } from "./import-preview-table";

const rows: ImportPreviewRow[] = Array.from({ length: 12 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    rowNumber: index + 2,
    studentNumber: `2026-${number}`,
    firstName: `Student ${number}`,
    lastName: "Example",
    email: `student${number}@example.test`,
    errors: index === 2 ? ["Already enrolled in this class"] : [],
  };
});

function dataRows() {
  return screen.getAllByRole("row").slice(1);
}

describe("ImportPreviewTable", () => {
  afterEach(cleanup);

  it("paginates with the required page sizes", async () => {
    const user = userEvent.setup();
    render(<ImportPreviewTable rows={rows} />);

    expect(dataRows()).toHaveLength(10);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous preview page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next preview page" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(dataRows()).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText("Preview rows per page"), "25");
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next preview page" })).toBeDisabled();

    expect(screen.getByRole("option", { name: "10" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "25" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "100" })).toBeInTheDocument();
  });

  it("searches across student fields and validation messages", async () => {
    const user = userEvent.setup();
    render(<ImportPreviewTable rows={rows} />);

    await user.type(screen.getByLabelText("Search preview rows"), "student12");
    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("student12@example.test")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 1 filtered rows (12 total)");

    await user.clear(screen.getByLabelText("Search preview rows"));
    await user.type(screen.getByLabelText("Search preview rows"), "already enrolled");
    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("Already enrolled in this class")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search preview rows"));
    await user.type(screen.getByLabelText("Search preview rows"), "no such student");
    expect(screen.getByText("No rows match the current search and filter.")).toBeInTheDocument();
  });

  it("filters by validation status", async () => {
    const user = userEvent.setup();
    render(<ImportPreviewTable rows={rows} />);

    await user.selectOptions(screen.getByLabelText("Filter preview rows by status"), "attention");
    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("Already enrolled in this class")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter preview rows by status"), "ready");
    expect(dataRows()).toHaveLength(10);
    expect(screen.queryByText("Already enrolled in this class")).not.toBeInTheDocument();
  });

  it("provides sort controls that work without the column-header buttons", async () => {
    const user = userEvent.setup();
    render(<ImportPreviewTable rows={rows} />);

    await user.selectOptions(screen.getByLabelText("Sort preview rows"), "email");
    await user.selectOptions(screen.getByLabelText("Sort direction"), "desc");

    const table = screen.getByRole("table", { name: "Validated roster import rows" });
    const firstBodyRow = within(table).getAllByRole("row")[1];
    expect(firstBodyRow).toHaveTextContent("student12@example.test");
  });

  it("sorts columns and exposes the sort state to assistive technology", async () => {
    const user = userEvent.setup();
    render(<ImportPreviewTable rows={rows} />);

    const emailHeader = screen.getByRole("columnheader", { name: /Email/ });
    expect(emailHeader).toHaveAttribute("aria-sort", "none");
    await user.click(within(emailHeader).getByRole("button", { name: /Email/ }));
    expect(emailHeader).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(emailHeader).getByRole("button", { name: /Email/ }));
    expect(emailHeader).toHaveAttribute("aria-sort", "descending");

    const table = screen.getByRole("table", { name: "Validated roster import rows" });
    const firstBodyRow = within(table).getAllByRole("row")[1];
    expect(firstBodyRow).toHaveTextContent("student12@example.test");
  });
});
