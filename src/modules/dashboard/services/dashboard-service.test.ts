import { describe, expect, it } from "vitest";

import {
  buildTrendSeries,
  dashboardActivityLabel,
  effectiveCredentialStatus,
  privacySafeRecipientName,
} from "./dashboard-service";

describe("dashboard presentation helpers", () => {
  it("minimizes recipient identity to a first name and last initial", () => {
    expect(
      privacySafeRecipientName({
        firstName: "Maria",
        lastName: "Santos",
        displayName: "Maria Santos",
        email: "private@example.test",
        studentNumber: "private-student-number",
      } as never),
    ).toBe("Maria S.");
    expect(privacySafeRecipientName({ displayName: "Juan Dela Cruz" } as never)).toBe("Juan C.");
    expect(privacySafeRecipientName(null)).toBe("Recipient");
  });

  it("does not count revoked or expired credentials as active", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    expect(effectiveCredentialStatus("REVOKED", null, now)).toBe("REVOKED");
    expect(effectiveCredentialStatus("ACTIVE", new Date("2026-10-31T23:59:59.000Z"), now)).toBe(
      "EXPIRED",
    );
    expect(effectiveCredentialStatus("EXPIRED", null, now)).toBe("EXPIRED");
    expect(effectiveCredentialStatus("ACTIVE", null, now)).toBe("ACTIVE");
    expect(effectiveCredentialStatus("ACTIVE", new Date("2026-11-02T00:00:00.000Z"), now)).toBe(
      "ACTIVE",
    );
  });

  it("fills a deterministic fourteen-day trend with zero-value days", () => {
    const start = new Date("2026-10-19T00:00:00.000Z");
    const series = buildTrendSeries(
      [
        { day: "2026-10-19", count: 2n },
        { day: new Date("2026-10-21T00:00:00.000Z"), count: 5 },
      ],
      start,
    );

    expect(series).toHaveLength(14);
    expect(series[0]).toEqual({ date: "2026-10-19", count: 2 });
    expect(series[1]).toEqual({ date: "2026-10-20", count: 0 });
    expect(series[2]).toEqual({ date: "2026-10-21", count: 5 });
    expect(series.at(-1)).toEqual({ date: "2026-11-01", count: 0 });
  });

  it("provides readable activity labels with a safe fallback", () => {
    expect(dashboardActivityLabel("badge.issued")).toBe("Badge issued");
    expect(dashboardActivityLabel("custom.event_name")).toBe("Custom Event Name");
  });
});
