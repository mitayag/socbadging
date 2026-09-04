import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteFacultyControl } from "./delete-faculty-control";

describe("DeleteFacultyControl", () => {
  it("requires an explicit confirmation and explains record preservation", () => {
    render(<DeleteFacultyControl userId="faculty-1" facultyName="Marlon Tayag" action={vi.fn()} />);

    expect(screen.getByText("Delete Faculty")).toBeInTheDocument();
    expect(screen.getByText(/Delete Marlon Tayag\?/)).toBeInTheDocument();
    expect(screen.getByText(/historical records will remain preserved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Delete Faculty" })).toBeInTheDocument();
    expect(document.querySelector('input[name="userId"]')).toHaveValue("faculty-1");
  });
});
