import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { requireClassOwner, requireRole } from "@/modules/identity/policies/authorization";
import { quoteCsv } from "@/modules/rosters/services/roster-validation";
import { readStoredFile } from "@/platform/storage/local-storage";

import { deriveRateLimitKey } from "./shared-rate-limit";

const administrator = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.edu",
  role: "ADMIN" as const,
};
const faculty = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@example.edu",
  role: "FACULTY" as const,
};

describe("security regression boundaries", () => {
  it("escapes attacker-controlled text when rendered by React", () => {
    const markup = renderToStaticMarkup(createElement("p", null, '<img src=x onerror="alert(1)">'));

    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img");
  });

  it("hashes SQL-like rate-limit key material instead of retaining it", () => {
    const malicious = "user@example.edu' OR 1=1 --";
    const key = deriveRateLimitKey("login", malicious);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain(malicious);
  });

  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "\tformula", "\rformula"])(
    "neutralizes spreadsheet formulas in CSV exports: %s",
    (value) => expect(quoteCsv(value)).toBe(`"'${value}"`),
  );

  it.each(["../secret", "badges/../../secret", "/badges/secret", "private/secret"])(
    "rejects storage traversal or out-of-scope keys: %s",
    async (key) => await expect(readStoredFile(key)).rejects.toThrow("Invalid storage key"),
  );

  it("enforces vertical role authorization", () => {
    expect(() => requireRole(faculty, "ADMIN")).toThrow("Administrator access required");
    expect(requireRole(administrator, "ADMIN")).toBe(administrator);
  });

  it("enforces horizontal class ownership", () => {
    expect(() => requireClassOwner(faculty, "faculty-2")).toThrow("Class owner access required");
    expect(requireClassOwner(faculty, faculty.id)).toBe(faculty);
  });
});
