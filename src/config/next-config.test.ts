import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("nextConfig public credential headers", () => {
  it("allows the loopback host used by the checked-in development E2E server", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });

  it("sets private verification-page browser safety headers", async () => {
    const rules = await nextConfig.headers?.();
    const rule = rules?.find((item) => item.source === "/credentials/:publicId");

    expect(rule?.headers).toEqual(
      expect.arrayContaining([
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cache-Control", value: "private, no-store" },
      ]),
    );
  });

  it("sets global clickjacking, MIME, referrer, and browser-feature protections", async () => {
    const rules = await nextConfig.headers?.();
    const global = rules?.find((item) => item.source === "/:path*");

    expect(global?.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
        },
      ]),
    );
  });
});
