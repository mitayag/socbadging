import "server-only";

import type { Actor, Role } from "../types";

export class AuthorizationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requireAuthenticated(actor: Actor | null | undefined): Actor {
  if (!actor) throw new AuthorizationError();
  return actor;
}

export function requireRole(actor: Actor | null | undefined, allowed: Role | Role[]): Actor {
  const authenticated = requireAuthenticated(actor);
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  if (!roles.includes(authenticated.role)) {
    const label = roles.length === 1 && roles[0] === "ADMIN" ? "Administrator" : "Authorized role";
    throw new AuthorizationError(`${label} access required`);
  }
  return authenticated;
}

export function requireClassOwner(actor: Actor | null | undefined, ownerUserId: string): Actor {
  const authenticated = requireRole(actor, "FACULTY");
  if (authenticated.id !== ownerUserId) {
    throw new AuthorizationError("Class owner access required");
  }
  return authenticated;
}
