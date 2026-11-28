import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const originalMediaRoot = process.env.MEDIA_ROOT;

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.MEDIA_ROOT;
  else process.env.MEDIA_ROOT = originalMediaRoot;
  vi.resetModules();
});

describe("local storage core", () => {
  it("writes and reads badge files without the server-only guard", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hau-local-storage-"));
    process.env.MEDIA_ROOT = directory;
    vi.resetModules();

    try {
      const { putBadgeImage, readStoredFile } = await import("./local-storage-core");
      const key = await putBadgeImage(Buffer.from("badge-bytes"), "png");
      expect(key).toMatch(/^badges\/[0-9a-f-]+\.png$/);
      await expect(readStoredFile(key)).resolves.toEqual(Buffer.from("badge-bytes"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects traversal and non-badge storage keys", async () => {
    const { readStoredFile } = await import("./local-storage-core");
    await expect(readStoredFile("../secret")).rejects.toThrow("Invalid storage key");
    await expect(readStoredFile("/etc/passwd")).rejects.toThrow("Invalid storage key");
    await expect(readStoredFile("other/file.png")).rejects.toThrow("Invalid storage key");
  });
});
