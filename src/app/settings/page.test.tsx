import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  getSettings: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  keys: vi.fn(),
  signer: vi.fn(),
  signingKeyProps: null as null | { signerHealth: "healthy" | "unavailable" },
}));
vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/settings/services/system-settings-service", () => ({
  getAdminSystemSettings: state.getSettings,
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/settings/system-settings-form", () => ({
  SystemSettingsForm: () => <p>Settings Form</p>,
}));
vi.mock("@/components/settings/signing-key-status", () => ({
  SigningKeyStatus: (props: { signerHealth: "healthy" | "unavailable" }) => {
    state.signingKeyProps = props;
    return <p>Signing keys</p>;
  },
}));
vi.mock("@/platform/db/prisma", () => ({ prisma: { signingKey: { findMany: state.keys } } }));
vi.mock("@/modules/signing/signer-client", () => ({ getSignerHealth: state.signer }));
vi.mock("next/navigation", () => ({ notFound: state.notFound, redirect: state.redirect }));

import SettingsPage from "./page";

const administrator: Actor = {
  id: "admin-1",
  name: "Admin",
  email: "admin@hau.edu.ph",
  role: "ADMIN",
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = administrator;
    state.getSettings.mockResolvedValue({
      issuerName: "HAU",
      issuerUrl: "https://hau.edu.ph",
      issuerLogoPath: "/images/logo.png",
      supportContact: null,
      sharingEnabled: true,
    });
    state.keys.mockResolvedValue([]);
    state.signer.mockResolvedValue(null);
    state.signingKeyProps = null;
  });

  it("renders the Administrator-only settings surface", async () => {
    render(await SettingsPage());
    expect(screen.getByRole("heading", { name: "Issuer Settings" })).toBeInTheDocument();
    expect(screen.getByText("Settings Form")).toBeInTheDocument();
    expect(screen.getByText("Signing keys")).toBeInTheDocument();
    expect(state.getSettings).toHaveBeenCalledWith(administrator);
  });

  it("uses a uniform not-found outcome when the Administrator read is denied", async () => {
    state.getSettings.mockRejectedValueOnce(
      new AuthorizationError("Administrator access required"),
    );
    await expect(SettingsPage()).rejects.toThrow("NOT_FOUND");
  });

  it("reports healthy only when the active key ID and cryptosuite match signer health", async () => {
    state.keys.mockResolvedValue([
      {
        id: "key-1",
        fingerprint: "fingerprint",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethodUrl: "https://badges.example.test/keys/key-1",
        status: "ACTIVE",
      },
    ]);
    state.signer.mockResolvedValue({
      status: "ready",
      keyId: "https://badges.example.test/keys/key-1",
      cryptosuite: "eddsa-rdfc-2022",
    });

    render(await SettingsPage());

    expect(state.signingKeyProps?.signerHealth).toBe("healthy");
  });

  it.each([
    ["key ID", "https://badges.example.test/keys/other", "eddsa-rdfc-2022"],
    ["cryptosuite", "https://badges.example.test/keys/key-1", "other-suite"],
  ])("reports unavailable for a signer %s mismatch", async (_caseName, keyId, cryptosuite) => {
    state.keys.mockResolvedValue([
      {
        id: "key-1",
        fingerprint: "fingerprint",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethodUrl: "https://badges.example.test/keys/key-1",
        status: "ACTIVE",
      },
    ]);
    state.signer.mockResolvedValue({ status: "ready", keyId, cryptosuite });

    render(await SettingsPage());

    expect(state.signingKeyProps?.signerHealth).toBe("unavailable");
  });

  it("reports unavailable when signer health cannot be loaded", async () => {
    state.keys.mockResolvedValue([
      {
        id: "key-1",
        fingerprint: "fingerprint",
        cryptosuite: "eddsa-rdfc-2022",
        verificationMethodUrl: "https://badges.example.test/keys/key-1",
        status: "ACTIVE",
      },
    ]);

    render(await SettingsPage());

    expect(state.signingKeyProps?.signerHealth).toBe("unavailable");
  });
});
