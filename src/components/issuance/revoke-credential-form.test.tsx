import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/app/issued/[issuanceId]/revocation-actions", () => ({
  revokeCredentialAction: state.action,
}));

import { RevokeCredentialForm } from "./revoke-credential-form";

describe("RevokeCredentialForm", () => {
  afterEach(cleanup);
  beforeEach(() => vi.resetAllMocks());

  it("explains that revocation publishes through the signed status list without rewriting the credential", () => {
    render(<RevokeCredentialForm issuanceId="issuance-1" />);

    expect(screen.getByText(/signed status list/i)).toBeVisible();
    expect(screen.getByText(/preserves the credential record/i)).toBeVisible();
  });

  it("requires a visible reason and destructive confirmation before enabling revocation", async () => {
    const user = userEvent.setup();
    render(<RevokeCredentialForm issuanceId="issuance-1" />);

    const button = screen.getByRole("button", { name: "Revoke Credential" });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText(/revocation reason/i)).toBeRequired();

    await user.type(screen.getByLabelText(/revocation reason/i), "Academic review");
    await user.click(screen.getByLabelText("I understand this revocation cannot be undone"));
    expect(button).toBeEnabled();

    await user.click(button);
    expect(state.action).toHaveBeenCalledWith(
      expect.objectContaining({
        get: expect.any(Function),
      }),
    );
  });

  it("disables the destructive submit control while revocation is pending", async () => {
    const user = userEvent.setup();
    let resolveAction: () => void;
    state.action.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<RevokeCredentialForm issuanceId="issuance-1" />);

    await user.type(screen.getByLabelText(/revocation reason/i), "Academic review");
    await user.click(screen.getByLabelText(/cannot be undone/i));
    const click = user.click(screen.getByRole("button", { name: "Revoke Credential" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Revoking Credential…" })).toBeDisabled(),
    );
    resolveAction!();
    await click;
  });

  it("reports a generic accessible failure when the secure action rejects", async () => {
    const user = userEvent.setup();
    state.action.mockRejectedValueOnce(new Error("Credential is unavailable"));
    render(<RevokeCredentialForm issuanceId="issuance-1" />);

    await user.type(screen.getByLabelText(/revocation reason/i), "Academic review");
    await user.click(screen.getByLabelText(/cannot be undone/i));
    await user.click(screen.getByRole("button", { name: "Revoke Credential" }));

    expect(screen.getByRole("alert")).toHaveTextContent("could not be revoked");
    expect(screen.getByRole("alert")).not.toHaveTextContent("unavailable");
  });
});
