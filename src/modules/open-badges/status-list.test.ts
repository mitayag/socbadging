import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildStatusListEntry, encodeRevocationList, readRevocationStatus } from "./status-list";

describe("Bitstring Status List", () => {
  it("builds a canonical revocation entry from a persisted allocation", () => {
    expect(
      buildStatusListEntry({
        listId: "internal-list-id",
        index: 8,
        statusUrl: "https://badges.example.test/api/status-lists/list-1",
      }),
    ).toEqual({
      id: "https://badges.example.test/api/status-lists/list-1#8",
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: "8",
      statusListCredential: "https://badges.example.test/api/status-lists/list-1",
    });
  });

  it("uses left-to-right bits across byte boundaries and at the capacity boundary", () => {
    const encoded = encodeRevocationList([0, 7, 8, 15], 16);

    expect(readRevocationStatus(encoded, 0)).toBe(true);
    expect(readRevocationStatus(encoded, 1)).toBe(false);
    expect(readRevocationStatus(encoded, 7)).toBe(true);
    expect(readRevocationStatus(encoded, 8)).toBe(true);
    expect(readRevocationStatus(encoded, 14)).toBe(false);
    expect(readRevocationStatus(encoded, 15)).toBe(true);
  });

  it("produces deterministic multibase base64url GZIP output", () => {
    expect(encodeRevocationList([15, 0, 8, 7, 8], 16)).toBe("uH4sIAAAAAAAAA2tsBABDCP75AgAAAA");
    expect(encodeRevocationList([0, 7, 8, 15], 16)).toBe("uH4sIAAAAAAAAA2tsBABDCP75AgAAAA");
  });

  it.each([
    [[-1], 16],
    [[16], 16],
    [[1.5], 16],
    [[0], 0],
  ])("rejects invalid indices or capacity: %j / %s", (indices, capacity) => {
    expect(() => encodeRevocationList(indices, capacity)).toThrow();
  });

  it("rejects malformed or out-of-range status lookups", () => {
    expect(() => readRevocationStatus("unotgzip", 0)).toThrow("invalid");
    expect(() => readRevocationStatus("not-multibase", 0)).toThrow();
    expect(() => readRevocationStatus(encodeRevocationList([], 16), 16)).toThrow();
  });

  it("rejects encoded input before allocating an unbounded decoded buffer", () => {
    expect(() => readRevocationStatus(`u${"A".repeat(180_001)}`, 0)).toThrow("too large");
  });

  it("rejects a compressed list that expands beyond the supported capacity", () => {
    const oversized = `u${gzipSync(Buffer.alloc(128 * 1024 + 1)).toString("base64url")}`;

    expect(() => readRevocationStatus(oversized, 0)).toThrow("invalid");
  });
});
