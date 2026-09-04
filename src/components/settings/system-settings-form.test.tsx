import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/app/settings/actions", () => ({ updateSystemSettingsFormAction: state.action }));

import { SystemSettingsForm } from "./system-settings-form";

const settings = {
  issuerName: "HAU School of Computing",
  issuerUrl: "https://hau.edu.ph",
  issuerLogoPath: "/images/logo.png",
  supportContact: "support@hau.edu.ph",
  sharingEnabled: true,
};

describe("SystemSettingsForm", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.resetAllMocks();
    state.action.mockResolvedValue({ ok: true });
  });

  it("renders title-case labels and current Administrator settings", () => {
    render(<SystemSettingsForm settings={settings} />);

    expect(screen.getByLabelText(/issuer name/i)).toHaveValue(settings.issuerName);
    expect(screen.getByLabelText(/canonical url/i)).toHaveValue(settings.issuerUrl);
    expect(screen.getByLabelText(/issuer logo path/i)).toHaveValue(settings.issuerLogoPath);
    expect(screen.getByLabelText(/support contact/i)).toHaveValue(settings.supportContact);
    expect(screen.getByLabelText(/enable public sharing/i)).toBeChecked();
  });

  it("renders accessible success feedback after the action resolves", async () => {
    const user = userEvent.setup();
    render(<SystemSettingsForm settings={settings} />);

    await user.click(screen.getByRole("button", { name: "Save Issuer Settings" }));
    expect(screen.getByRole("status")).toHaveTextContent("Issuer settings saved");
  });

  it("renders field-safe action errors", async () => {
    const user = userEvent.setup();
    state.action.mockResolvedValueOnce({
      ok: false,
      message: "Review the highlighted settings fields.",
    });
    render(<SystemSettingsForm settings={settings} />);

    await user.click(screen.getByRole("button", { name: "Save Issuer Settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Review the highlighted settings fields.");
  });

  it("disables its submit control while the action is pending", async () => {
    const user = userEvent.setup();
    let resolveAction: (state: { ok: true }) => void;
    state.action.mockImplementationOnce(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<SystemSettingsForm settings={settings} />);

    const click = user.click(screen.getByRole("button", { name: "Save Issuer Settings" }));
    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled());
    resolveAction!({ ok: true });
    await click;
  });
});
