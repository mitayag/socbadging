import "server-only";

import { hash, verify } from "argon2";

import type { Actor, Role } from "../types";

type AccountStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
type AuthenticationUser = Actor & { passwordHash: string; status: AccountStatus };

export type AuthenticationRepository = {
  findByNormalizedEmail(email: string): Promise<AuthenticationUser | null>;
  recordSuccessfulLogin(userId: string): Promise<void>;
  recordLoginAttempt(email: string, success: boolean): Promise<void>;
};

const DUMMY_HASH = await hash("invalid-password-value-used-only-for-timing-equality");

export async function authenticateWithPassword(
  repository: AuthenticationRepository,
  email: string,
  password: string,
): Promise<Actor | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await repository.findByNormalizedEmail(normalizedEmail);
  const passwordMatches = await verify(user?.passwordHash ?? DUMMY_HASH, password).catch(
    () => false,
  );
  const permitted = Boolean(user && passwordMatches && user.status === "ACTIVE");

  await repository.recordLoginAttempt(normalizedEmail, permitted);
  if (!user || !permitted) return null;

  await repository.recordSuccessfulLogin(user.id);
  const { id, name, role } = user;
  return { id, name, email: user.email, role: role satisfies Role };
}
