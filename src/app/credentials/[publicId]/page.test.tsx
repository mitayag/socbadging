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

import PublicCredentialPage from "./page";

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
