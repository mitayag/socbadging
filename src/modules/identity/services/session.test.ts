import { describe, expect, it } from "vitest";
import { createSessionToken, hashSessionToken } from "./session";

describe("session tokens", () => {
  it("creates opaque high-entropy tokens and stores only a deterministic hash", () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });
});
