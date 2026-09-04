import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DepartmentSelect } from "./department-select";
const departments = [
  { id: "active", name: "Computing", status: "ACTIVE" as const },
  { id: "archived", name: "Legacy", status: "ARCHIVED" as const },
];
describe("DepartmentSelect", () => {
  it("shows active departments and a Title Case empty option", () => {
    render(<DepartmentSelect departments={departments} />);
    expect(screen.getByRole("option", { name: "No Department" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Computing" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Legacy/ })).not.toBeInTheDocument();
  });
  it("retains an archived current assignment", () => {
    render(<DepartmentSelect departments={departments} currentDepartmentId="archived" />);
    expect(screen.getByRole("option", { name: "Legacy (Archived)" })).toBeInTheDocument();
  });
});
