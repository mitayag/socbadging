import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandLockup } from "./brand-lockup";

describe("BrandLockup", () => {
  afterEach(cleanup);

  it("keeps HAU SOC and Badging System on separate semantic lines", () => {
    render(<BrandLockup variant="sidebar" />);

    const institutionLine = screen.getByText("HAU SOC");
    const productLine = screen.getByText("Badging System");

    expect(institutionLine).toHaveAttribute("data-brand-line", "institution");
    expect(productLine).toHaveAttribute("data-brand-line", "product");
    expect(institutionLine.parentElement).toBe(productLine.parentElement);
    expect(institutionLine.tagName).toBe("SPAN");
    expect(productLine.tagName).toBe("SPAN");
  });

  it("renders the logo beside the complete two-line wordmark", () => {
    const { container } = render(<BrandLockup priority variant="login" />);

    const lockup = container.querySelector<HTMLElement>(".brand-lockup");
    const wordmark = container.querySelector<HTMLElement>(".brand-wordmark");
    const logo = screen.getByRole("img", { name: "HAU School of Computing logo" });

    expect(lockup).toContainElement(wordmark);
    expect(lockup).toContainElement(logo);
    expect(wordmark).toHaveTextContent("HAU SOCBadging System");
  });
});
