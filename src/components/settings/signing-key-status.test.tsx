import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SigningKeyStatus } from "./signing-key-status";

describe("SigningKeyStatus", () => {
  afterEach(cleanup);

  it("shows only public signing metadata and the current signer health", () => {
    render(
      <SigningKeyStatus
        signerHealth="healthy"
        action={async () => ({ ok: true })}
        keys={[
          {
            id: "key-1",
            fingerprint: "z6MkhExampleFingerprint",
            cryptosuite: "eddsa-rdfc-2022",
            status: "ACTIVE",
          },
        ]}
      />,
    );

    expect(screen.getByText("z6MkhExampleFingerprint")).toBeInTheDocument();
    expect(screen.getByText("eddsa-rdfc-2022")).toBeInTheDocument();
    expect(screen.getByText(/signer health: healthy/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/private key/i)).not.toBeInTheDocument();
  });

  it("does not render lifecycle controls for a compromised key", () => {
    render(
      <SigningKeyStatus
        signerHealth="unavailable"
        action={async () => ({ ok: true })}
        keys={[
          {
            id: "key-1",
            fingerprint: "z6MkhCompromised",
            cryptosuite: "eddsa-rdfc-2022",
            status: "COMPROMISED",
          },
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /activate|retire|mark compromised/i })).toBeNull();
  });

  it("announces successful lifecycle feedback", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(
      <SigningKeyStatus
        signerHealth="healthy"
        action={action}
        keys={[
          {
            id: "key-1",
            fingerprint: "z6MkhActive",
            cryptosuite: "eddsa-rdfc-2022",
            status: "ACTIVE",
          },
        ]}
      />,
    );

    await user.click(screen.getAllByLabelText("Confirm")[0]!);
    await user.click(screen.getByRole("button", { name: "Retire" }));

    expect(screen.getByRole("status")).toHaveTextContent("Signing key action completed.");
  });

  it("announces field-safe action failures", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: "Confirm the requested key lifecycle action.",
    });
    render(
      <SigningKeyStatus
        signerHealth="healthy"
        action={action}
        keys={[
          {
            id: "key-1",
            fingerprint: "z6MkhActive",
            cryptosuite: "eddsa-rdfc-2022",
            status: "ACTIVE",
          },
        ]}
      />,
    );

    await user.click(screen.getAllByLabelText("Confirm")[0]!);
    await user.click(screen.getByRole("button", { name: "Retire" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Confirm the requested key lifecycle action.",
    );
  });

  it("catches rejected actions and announces a generic failure", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockRejectedValue(new Error("private database diagnostic"));
    render(
      <SigningKeyStatus
        signerHealth="healthy"
        action={action}
        keys={[
          {
            id: "key-1",
            fingerprint: "z6MkhActive",
            cryptosuite: "eddsa-rdfc-2022",
            status: "ACTIVE",
          },
        ]}
      />,
    );

    await user.click(screen.getAllByLabelText("Confirm")[0]!);
    await user.click(screen.getByRole("button", { name: "Retire" }));

    expect(screen.getByRole("status")).toHaveTextContent("Signing key action failed.");
    expect(screen.queryByText(/private database diagnostic/i)).toBeNull();
  });
});
