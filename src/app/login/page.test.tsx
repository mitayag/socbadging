import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  afterEach(cleanup);

  it("shows the HAU School of Computing logo in the brand panel", () => {
    render(<LoginPage />);

    const logo = screen.getByRole("img", { name: "HAU School of Computing logo" });

    expect(decodeURIComponent(logo.getAttribute("src") ?? "")).toContain("/images/hausoclogo.png");
  });

  it("uses the shared two-line brand lockup", () => {
    const { container } = render(<LoginPage />);

    expect(container.querySelectorAll('[data-brand-line="institution"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-brand-line="product"]')).toHaveLength(1);
  });
});
