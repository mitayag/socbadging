import { describe, expect, it } from "vitest";
import { validateBadgeImage } from "./image-validation";

describe("badge image validation", () => {
  it("rejects content that is not a supported image regardless of filename", async () => {
    await expect(validateBadgeImage(Buffer.from("not an image"), "badge.png")).rejects.toThrow("valid PNG, JPEG, or WebP");
  });

  it("rejects images larger than the configured limit before decoding", async () => {
    await expect(validateBadgeImage(Buffer.alloc(2 * 1024 * 1024 + 1), "badge.png")).rejects.toThrow("2 MiB");
  });
});
