import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicCredential } from "@/modules/verification/types";

const state = vi.hoisted(() => ({
  getPublicCredential: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/modules/verification/services/public-credential-service", () => ({
  PublicCredentialNotFoundError: class PublicCredentialNotFoundError extends Error {},
  getPublicCredential: state.getPublicCredential,
}));
vi.mock("@/components/verification/public-credential", () => ({
  PublicCredentialCard: () => null,
}));
vi.mock("next/navigation", () => ({ notFound: state.notFound }));

import PublicCredentialPage, { generateMetadata } from "./page";

const publicId = "abcdefghijklmnopqrstuvwxyzABCDEF";
function pageParams(value: unknown) {
  return { params: Promise.resolve(value) } as { params: Promise<{ publicId: string }> };
}

describe("PublicCredentialPage boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.getPublicCredential.mockResolvedValue({ publicId } as PublicCredential);
  });

  it("renders a valid credential after proxy-level rate limiting", async () => {
    await PublicCredentialPage(pageParams({ publicId }));

    expect(state.getPublicCredential).toHaveBeenCalledWith(publicId);
  });

  it("publishes safe social metadata without recipient identity", async () => {
    state.getPublicCredential.mockResolvedValueOnce({
      publicId,
      status: "ACTIVE",
      achievement: {
        name: "Secure Systems",
        image: { id: "https://badges.example.test/badge.png" },
      },
      issuer: { name: "HAU SOC" },
      credential: {
        id: "https://badges.example.test/credentials/abcdefghijklmnopqrstuvwxyzABCDEF",
      },
      recipientDisplayName: "Maria D.",
    } as unknown as PublicCredential);
    const metadata = await generateMetadata(pageParams({ publicId }));
    expect(metadata.title).toBe("Secure Systems — HAU SOC");
    expect(metadata.description).not.toContain("Maria");
    expect(metadata.openGraph?.images).toEqual([
      { url: "https://badges.example.test/badge.png", alt: "Secure Systems badge artwork" },
    ]);
  });

  it.each([
    ["malformed", "not-a-public-id"],
    ["missing", publicId],
    ["corrupt", publicId],
  ])("uses the same not-found outcome for %s credentials", async (_name, value) => {
    if (_name !== "malformed") state.getPublicCredential.mockRejectedValueOnce(new Error("hidden"));

    await expect(PublicCredentialPage(pageParams({ publicId: value }))).rejects.toThrow(
      "NOT_FOUND",
    );
  });
});
