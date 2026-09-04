import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BatchIssuanceSection } from "./batch-issuance-section";

describe("BatchIssuanceSection", () => {
  afterEach(cleanup);
  it("renders mutation controls for Faculty", () => {
    render(
      <BatchIssuanceSection
        badgeOptions={[{ id: "badge-1", name: "Academic Excellence" }]}
        classId="class-1"
        commitAction={vi.fn()}
        role="FACULTY"
      />,
    );
    expect(screen.getByRole("heading", { name: "Batch Issue" })).toBeInTheDocument();
  });

  it("never renders mutation controls for Administrator", () => {
    const { container } = render(
      <BatchIssuanceSection
        badgeOptions={[]}
        classId="class-1"
        commitAction={vi.fn()}
        role="ADMIN"
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
