import { describe, expect, it } from "vitest";

import { buildLocalConformanceReport, renderLocalConformanceMarkdown } from "./conformance-report";

const passingInput = {
  generatedAt: "2026-09-10T00:00:00.000Z",
  certified: false as const,
  libraries: {
    "@digitalbazaar/data-integrity": "2.5.0",
    "@digitalbazaar/eddsa-rdfc-2022-cryptosuite": "1.3.0",
  },
  fixtures: [
    { name: "vc-v2.json", sha256: "b".repeat(64) },
    { name: "open-badges-3.0.3.json", sha256: "a".repeat(64) },
  ],
  gates: [
    { name: "status", category: "status" as const, passed: true },
    { name: "proof", category: "proof" as const, passed: true },
    { name: "schema", category: "schema" as const, passed: true },
    { name: "docker", category: "docker" as const, passed: true },
  ],
};

describe("local Open Badges conformance report", () => {
  it("builds deterministic, sorted local-readiness evidence with exact document revisions", () => {
    const first = buildLocalConformanceReport(passingInput);
    const second = buildLocalConformanceReport({
      ...passingInput,
      fixtures: [...passingInput.fixtures].reverse(),
      gates: [...passingInput.gates].reverse(),
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      certified: false,
      readiness: "ready",
      documents: {
        openBadgesSpecification: "3.0 Final",
        certificationGuide: "3.0 Final, revision 2026-06-15",
        implementationGuide: "3.0 Final, revision 2026-06-15",
        errata: "Open Badges 3.0 errata reviewed 2026-08-25",
      },
    });
  });

  it.each(["proof", "schema", "status", "docker"] as const)(
    "fails overall readiness when the %s gate fails",
    (category) => {
      const report = buildLocalConformanceReport({
        ...passingInput,
        gates: passingInput.gates.map((gate) =>
          gate.category === category ? { ...gate, passed: false } : gate,
        ),
      });
      expect(report.readiness).toBe("not-ready");
    },
  );

  it("refuses certification claims", () => {
    expect(() =>
      buildLocalConformanceReport({ ...passingInput, certified: true } as never),
    ).toThrow("Certification cannot be claimed by local evidence");
  });

  it.each([
    ["recipientEmail", "student@example.test"],
    ["privateKey", "secret"],
    ["smtpPassword", "secret"],
    ["signerToken", "secret"],
    ["databaseUrl", "mysql://secret"],
  ])("rejects sensitive report input %s", (field, value) => {
    expect(() =>
      buildLocalConformanceReport({ ...passingInput, metadata: { [field]: value } } as never),
    ).toThrow("Sensitive data is not permitted in conformance evidence");
  });

  it("renders the mandatory non-certification statement without recipient or secret data", () => {
    const markdown = renderLocalConformanceMarkdown(buildLocalConformanceReport(passingInput));
    expect(markdown).toContain(
      "Local readiness evidence only. This product is not 1EdTech certified.",
    );
    expect(markdown).not.toMatch(/recipient|private.?key|smtp|bearer|database.?url/i);
  });
});
