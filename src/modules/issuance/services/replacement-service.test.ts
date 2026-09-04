import { describe, expect, it } from "vitest";

import { createSignedReplacement } from "./replacement-service";

describe("createSignedReplacement", () => {
  it("rejects malformed replacement identifiers before database work", async () => {
    await expect(
      createSignedReplacement({
        originalIssuanceId: "issuance-1",
        actorId: "../../administrator",
      }),
    ).rejects.toThrow();
  });
});
