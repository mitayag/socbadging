import { describe, expect, it } from "vitest";

import type { Actor } from "@/modules/identity/types";

import { registerPublicSigningKey, type SigningKeyRegistrationInput } from "./key-service";

const faculty: Actor = {
  id: "faculty-id",
  name: "Faculty",
  email: "faculty@example.test",
  role: "FACULTY",
};

const keyInput: SigningKeyRegistrationInput = {
  verificationMethodUrl: "https://badges.example.test/issuers/hau-soc/keys/key-1",
  controllerUrl: "https://badges.example.test/issuers/hau-soc",
  algorithm: "Ed25519",
  cryptosuite: "eddsa-rdfc-2022",
  publicMultikey: "z6MkhYkT9Jv2YqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYq",
  fingerprint: "z6MkhYkT9Jv2YqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYqYq",
};

describe("registerPublicSigningKey", () => {
  it("rejects a non-Administrator before a database mutation", async () => {
    await expect(registerPublicSigningKey(keyInput, faculty)).rejects.toThrow(
      "Administrator access required",
    );
  });
});
