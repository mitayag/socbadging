import { describe, expect, it } from "vitest";

import { getClientRateLimitKey } from "./public-rate-limit";

function request(headers?: HeadersInit): Request {
  return new Request("http://localhost/api/credentials/abcdefghijklmnopqrstuvwxyzABCDEF", {
    headers,
  });
}

describe("getClientRateLimitKey", () => {
  it("ignores caller-controlled forwarding headers unless trusted-proxy mode is enabled", () => {
    const untrusted = getClientRateLimitKey(
      request({
        "x-forwarded-for": "203.0.113.42, 10.0.0.2",
        "x-real-ip": "198.51.100.9",
      }),
      { trustProxy: false },
    );
    const trusted = getClientRateLimitKey(
      request({ "x-forwarded-for": "203.0.113.42, 10.0.0.2" }),
      { trustProxy: true },
    );

    expect(untrusted).toBe("anonymous");
    expect(trusted).toBe("203.0.113.42");
  });

  it("falls back to the anonymous bucket for malformed trusted-proxy input", () => {
    expect(
      getClientRateLimitKey(request({ "x-forwarded-for": "not-an-ip, 203.0.113.42" }), {
        trustProxy: true,
      }),
    ).toBe("anonymous");
  });
});
