import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CryptographicVerification } from "./cryptographic-verification";

afterEach(cleanup);

describe("CryptographicVerification", () => {
  it("uses an accessible textual verified result and only public key metadata", () => {
    render(
      <CryptographicVerification
        result={{
          outcome: "VERIFIED",
          keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
          checkedAt: "2026-08-26T00:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Cryptographically verified");
    expect(screen.getByText(/key-1/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("privateKey");
  });

  it("does not overstate legacy or unavailable credential verification", () => {
    render(
      <CryptographicVerification
        result={{ outcome: "VERIFICATION_UNAVAILABLE", checkedAt: "2026-08-26T00:00:00.000Z" }}
        legacy
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /cryptographic verification is unavailable/i,
    );
    expect(screen.queryByText(/cryptographically verified/i)).not.toBeInTheDocument();
  });
});
