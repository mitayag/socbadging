import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { ShareControls } from "./share-controls";

const props = {
  canonicalUrl: "https://hau.edu.ph/credentials/abc_DEF-123",
  title: "Verify Dean's List",
  text: "Verify Dean's List from HAU SOC.",
  sharingEnabled: true,
};
let writeText: ReturnType<typeof vi.fn>;

describe("ShareControls", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.restoreAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, share: undefined });
  });

  it("creates exactly encoded protected provider and email links without recipient identity", () => {
    render(<ShareControls {...props} />);

    expect(screen.getByRole("link", { name: "Share on LinkedIn" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fhau.edu.ph%2Fcredentials%2Fabc_DEF-123",
    );
    expect(screen.getByRole("link", { name: "Share on Facebook" })).toHaveAttribute(
      "href",
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fhau.edu.ph%2Fcredentials%2Fabc_DEF-123",
    );
    expect(screen.getByRole("link", { name: "Share on X" })).toHaveAttribute(
      "href",
      "https://x.com/intent/post?text=Verify+Dean%27s+List+from+HAU+SOC.&url=https%3A%2F%2Fhau.edu.ph%2Fcredentials%2Fabc_DEF-123",
    );
    expect(screen.getByRole("link", { name: "Share by email" })).toHaveAttribute(
      "href",
      "mailto:?subject=Verify+Dean%27s+List&body=Verify+Dean%27s+List+from+HAU+SOC.%0A%0Ahttps%3A%2F%2Fhau.edu.ph%2Fcredentials%2Fabc_DEF-123",
    );
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    }
    expect(document.body.textContent).not.toContain("Maria");
  });

  it("announces clipboard success", async () => {
    const user = userEvent.setup();
    render(<ShareControls {...props} />);

    await user.click(screen.getByRole("button", { name: /copy verification link/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Verification link copied");
  });

  it("announces a clipboard failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { clipboard: undefined, share: undefined });
    render(<ShareControls {...props} />);

    await user.click(screen.getByRole("button", { name: /copy verification link/i }));
    expect(screen.getByRole("status")).toHaveTextContent("could not be copied");
    expect(screen.getByLabelText("Verification URL")).toHaveValue(props.canonicalUrl);
  });

  it("defers native sharing capability detection until after hydration", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText }, share: vi.fn() });

    expect(renderToString(<ShareControls {...props} />)).not.toContain("Share Verification Link");
  });

  it("uses native sharing and announces a declined share", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, share });
    render(<ShareControls {...props} />);

    await user.click(await screen.findByRole("button", { name: /share verification link/i }));
    expect(share).toHaveBeenCalledWith({
      title: props.title,
      text: props.text,
      url: props.canonicalUrl,
    });

    share.mockRejectedValueOnce(new Error("cancelled"));
    await user.click(await screen.findByRole("button", { name: /share verification link/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Sharing was not completed");
  });

  it("removes sharing controls when settings disable sharing", () => {
    render(<ShareControls {...props} sharingEnabled={false} />);

    expect(
      screen.queryByRole("button", { name: /copy verification link/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Share on LinkedIn" })).not.toBeInTheDocument();
    expect(screen.getByText(/sharing is disabled/i)).toBeInTheDocument();
  });
});
