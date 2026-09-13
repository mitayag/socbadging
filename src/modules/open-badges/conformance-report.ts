import { z } from "zod";

const REQUIRED_GATE_CATEGORIES = ["proof", "schema", "status", "docker"] as const;
const SENSITIVE_FIELD =
  /(?:recipient|email|student|identity|private|secret|password|smtp|bearer|token|database.?url)/i;

const InputSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    certified: z.literal(false),
    libraries: z.record(z.string().min(1), z.string().min(1)),
    fixtures: z.array(
      z.object({ name: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    ),
    gates: z.array(
      z
        .object({
          name: z.string().min(1),
          category: z.enum(REQUIRED_GATE_CATEGORIES),
          passed: z.boolean(),
          evidence: z.string().min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type LocalConformanceInput = z.input<typeof InputSchema>;

export type LocalConformanceReport = {
  reportVersion: 1;
  generatedAt: string;
  certified: false;
  readiness: "ready" | "not-ready";
  documents: {
    openBadgesSpecification: "3.0 Final";
    certificationGuide: "3.0 Final, revision 2026-06-15";
    implementationGuide: "3.0 Final, revision 2026-06-15";
    errata: "Open Badges 3.0 errata reviewed 2026-08-25";
  };
  libraries: Record<string, string>;
  fixtures: Array<{ name: string; sha256: string }>;
  gates: Array<{
    name: string;
    category: (typeof REQUIRED_GATE_CATEGORIES)[number];
    passed: boolean;
    evidence?: string;
  }>;
};

function containsSensitiveField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  return Object.entries(value).some(
    ([key, nestedValue]) => SENSITIVE_FIELD.test(key) || containsSensitiveField(nestedValue),
  );
}

export function buildLocalConformanceReport(input: LocalConformanceInput): LocalConformanceReport {
  if ((input as { certified?: unknown }).certified === true) {
    throw new Error("Certification cannot be claimed by local evidence");
  }
  if (containsSensitiveField(input)) {
    throw new Error("Sensitive data is not permitted in conformance evidence");
  }
  const parsed = InputSchema.parse(input);
  const fixtures = [...parsed.fixtures].sort((left, right) => left.name.localeCompare(right.name));
  const gates = [...parsed.gates].sort(
    (left, right) =>
      left.category.localeCompare(right.category) || left.name.localeCompare(right.name),
  );
  const libraries = Object.fromEntries(
    Object.entries(parsed.libraries).sort(([left], [right]) => left.localeCompare(right)),
  );
  const readiness = REQUIRED_GATE_CATEGORIES.every((category) =>
    gates.some((gate) => gate.category === category && gate.passed),
  )
    ? "ready"
    : "not-ready";

  return {
    reportVersion: 1,
    generatedAt: parsed.generatedAt,
    certified: false,
    readiness,
    documents: {
      openBadgesSpecification: "3.0 Final",
      certificationGuide: "3.0 Final, revision 2026-06-15",
      implementationGuide: "3.0 Final, revision 2026-06-15",
      errata: "Open Badges 3.0 errata reviewed 2026-08-25",
    },
    libraries,
    fixtures,
    gates,
  };
}

export function renderLocalConformanceMarkdown(report: LocalConformanceReport): string {
  const gateRows = report.gates.map((gate) => [
    gate.category,
    gate.name,
    gate.passed ? "PASS" : "FAIL",
    gate.evidence ?? "Recorded by automated gate",
  ]);
  const headings = ["Category", "Gate", "Result", "Evidence"];
  const widths = headings.map((heading, index) =>
    Math.max(heading.length, ...gateRows.map((row) => row[index]?.length ?? 0), 3),
  );
  const renderRow = (row: string[]) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(" | ")} |`;
  const rows = [
    renderRow(headings),
    renderRow(widths.map((width) => "-".repeat(width))),
    ...gateRows.map(renderRow),
  ].join("\n");
  const libraries = Object.entries(report.libraries)
    .map(([name, version]) => `- \`${name}@${version}\``)
    .join("\n");
  const fixtures = report.fixtures
    .map((fixture) => `- \`${fixture.name}\`: \`${fixture.sha256}\``)
    .join("\n");

  return `# Open Badges 3 Local Readiness Evidence

> Local readiness evidence only. This product is not 1EdTech certified.

- Generated: ${report.generatedAt}
- Readiness: **${report.readiness === "ready" ? "READY" : "NOT READY"}**
- Certified: **false**

## Reviewed Documents

- Open Badges specification: ${report.documents.openBadgesSpecification}
- Certification guide: ${report.documents.certificationGuide}
- Implementation guide: ${report.documents.implementationGuide}
- Errata: ${report.documents.errata}

## Libraries

${libraries}

## Reviewed Fixture Digests

${fixtures}

## Automated Gates

${rows}

## Remaining External Milestones

Activate stable public HTTPS identifiers, run the current official 1EdTech suite, complete the
required submission and review, and wait for written approval before using certification wording
or marks.
`;
}
