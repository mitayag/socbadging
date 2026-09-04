import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("credential status styling", () => {
  it("gives revoked and expired issuance states distinct status treatments", () => {
    expect(stylesheet).toMatch(/\.status\.revoked\s*\{[^}]*color:/s);
    expect(stylesheet).toMatch(/\.status\.expired\s*\{[^}]*color:/s);
    expect(stylesheet).toMatch(/\.status\.revoked\s*\{[^}]*background:/s);
    expect(stylesheet).toMatch(/\.status\.expired\s*\{[^}]*background:/s);
  });
});

describe("public credential responsive styling", () => {
  it("uses single-column public credential defaults with wrapping safeguards before a wide breakpoint", () => {
    expect(stylesheet).toMatch(
      /\.public-credential-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(stylesheet).toMatch(
      /\.public-credential-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(stylesheet).toMatch(/\.public-credential-page[^}]*overflow-wrap:\s*anywhere/s);
    expect(stylesheet).toMatch(/@media\s*\(min-width:\s*760px\)[\s\S]*\.public-credential-grid/s);
  });
});

describe("brand lockup responsive styling", () => {
  it("keeps HAU SOC together while the product name remains its own line", () => {
    expect(stylesheet).toMatch(
      /\.brand-wordmark \[data-brand-line="institution"\]\s*\{[^}]*white-space:\s*nowrap/s,
    );
    expect(stylesheet).toMatch(
      /\.brand-wordmark \[data-brand-line="product"\]\s*\{[^}]*white-space:\s*nowrap/s,
    );
    expect(stylesheet).toMatch(
      /\.brand-wordmark\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
  });
});
