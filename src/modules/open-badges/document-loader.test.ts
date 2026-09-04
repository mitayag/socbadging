import { describe, expect, it } from "vitest";

import { loadAllowlistedDocument } from "./document-loader";

describe("loadAllowlistedDocument", () => {
  it("rejects a JSON-LD context URL outside the reviewed allowlist", async () => {
    await expect(loadAllowlistedDocument("https://attacker.invalid/context")).rejects.toThrow(
      "JSON-LD context is not allowlisted",
    );
  });

  it("resolves every reviewed standards context from a local fixture", async () => {
    const reviewedUrls = [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json",
      "https://w3id.org/security/data-integrity/v2",
      "https://w3id.org/security/multikey/v1",
      "https://www.w3.org/ns/credentials/status/v1",
    ];

    for (const url of reviewedUrls) {
      await expect(loadAllowlistedDocument(url)).resolves.toMatchObject({
        documentUrl: url,
        document: expect.objectContaining({ "@context": expect.any(Object) }),
      });
    }
  });
});
