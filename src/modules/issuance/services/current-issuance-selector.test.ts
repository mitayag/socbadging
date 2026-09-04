import { describe, expect, it } from "vitest";

import { selectCurrentIssuance, type LifecycleAwareIssuance } from "./current-issuance-selector";

const incompleteFragmentWithTerminalStates: LifecycleAwareIssuance[] = [
  {
    id: "fragment-root",
    publicId: "public-fragment-root",
    status: "ACTIVE",
    supersedesId: "missing-root",
    supersededById: "fragment-terminal",
  },
  {
    id: "fragment-terminal",
    publicId: "public-fragment-terminal",
    status: "ACTIVE",
    supersedesId: "fragment-root",
    supersededById: null,
  },
  {
    id: "expired-terminal",
    publicId: "public-expired-terminal",
    status: "EXPIRED",
    supersedesId: null,
    supersededById: null,
  },
  {
    id: "revoked-terminal",
    publicId: "public-revoked-terminal",
    status: "REVOKED",
    supersedesId: null,
    supersededById: null,
  },
];

const cycleWithIncompleteTail: LifecycleAwareIssuance[] = [
  {
    id: "cycle-a",
    publicId: "public-cycle-a",
    status: "REVOKED",
    supersedesId: "cycle-b",
    supersededById: "cycle-b",
  },
  {
    id: "cycle-b",
    publicId: "public-cycle-b",
    status: "ACTIVE",
    supersedesId: "cycle-a",
    supersededById: "cycle-a",
  },
  {
    id: "incomplete-tail",
    publicId: "public-incomplete-tail",
    status: "EXPIRED",
    supersedesId: "missing-tail-root",
    supersededById: null,
  },
];

describe("selectCurrentIssuance", () => {
  it.each([
    ["forward", incompleteFragmentWithTerminalStates],
    ["reverse", [...incompleteFragmentWithTerminalStates].reverse()],
  ])(
    "ignores an incomplete deeper fragment and selects the revoked complete terminal for %s input",
    (_label, records) => {
      expect(selectCurrentIssuance(records)).toMatchObject({
        id: "revoked-terminal",
        publicId: "public-revoked-terminal",
      });
    },
  );

  it.each([
    ["forward", cycleWithIncompleteTail],
    ["reverse", [...cycleWithIncompleteTail].reverse()],
  ])(
    "uses the global fail-closed fallback when a cycle and its tail contain no complete chain for %s input",
    (_label, records) => {
      expect(selectCurrentIssuance(records)).toMatchObject({
        id: "cycle-a",
        publicId: "public-cycle-a",
      });
    },
  );

  it("prefers a complete replacement chain over a malformed revoked record", () => {
    const records: LifecycleAwareIssuance[] = [
      {
        id: "valid-root",
        publicId: "public-valid-root",
        status: "ACTIVE",
        supersedesId: null,
        supersededById: "valid-terminal",
      },
      {
        id: "valid-terminal",
        publicId: "public-valid-terminal",
        status: "ACTIVE",
        supersedesId: "valid-root",
        supersededById: null,
      },
      {
        id: "malformed-revoked",
        publicId: "public-malformed-revoked",
        status: "REVOKED",
        supersedesId: "missing-root",
        supersededById: null,
      },
    ];

    expect(selectCurrentIssuance(records)).toMatchObject({
      id: "valid-terminal",
      publicId: "public-valid-terminal",
    });
  });
});
