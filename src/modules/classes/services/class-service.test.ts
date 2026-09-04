import { describe, expect, it } from "vitest";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { createClass } from "./class-service";

describe("class service authorization", () => {
  it("prevents an administrator from creating a faculty-owned class", async () => {
    await expect(
      createClass({ id: "a1", name: "Admin", email: "admin@example.edu", role: "ADMIN" }, {}),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
