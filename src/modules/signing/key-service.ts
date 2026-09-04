import "server-only";

import * as Ed25519Multikey from "@digitalbazaar/ed25519-multikey";
import { Prisma, SigningKeyStatus } from "@prisma/client";
import { z } from "zod";

import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

const publicUrlSchema = z.url().max(2048);
const signingKeyInputSchema = z
  .object({
    verificationMethodUrl: publicUrlSchema,
    controllerUrl: publicUrlSchema,
    algorithm: z.literal("Ed25519"),
    cryptosuite: z.literal("eddsa-rdfc-2022"),
    publicMultikey: z.string().trim().min(1).max(16_384),
    fingerprint: z.string().trim().min(1).max(255),
  })
  .strict();

type CurrentAdministrator = {
  id: string;
  role: "ADMIN" | "FACULTY";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  deletedAt: Date | null;
};

type LockedSigningKey = {
  id: string;
  status: SigningKeyStatus;
  compromisedAt: Date | null;
};

export type SigningKeyRegistrationInput = z.input<typeof signingKeyInputSchema>;
export type SigningKeyView = {
  id: string;
  verificationMethodUrl: string;
  controllerUrl: string;
  algorithm: string;
  cryptosuite: string;
  publicMultikey: string;
  fingerprint: string;
  status: SigningKeyStatus;
  activatedAt: Date | null;
  retiredAt: Date | null;
  compromisedAt: Date | null;
};

export class SigningKeyUnavailableError extends AuthorizationError {
  constructor() {
    super("Signing key is unavailable");
    this.name = "SigningKeyUnavailableError";
  }
}

function toView(key: {
  id: string;
  verificationMethodUrl: string;
  controllerUrl: string;
  algorithm: string;
  cryptosuite: string;
  publicMultikey: string;
  fingerprint: string;
  status: SigningKeyStatus;
  activatedAt: Date | null;
  retiredAt: Date | null;
  compromisedAt: Date | null;
}): SigningKeyView {
  return key;
}

function requireCurrentAdministrator(user: CurrentAdministrator | null): void {
  if (user?.role !== "ADMIN" || user.status !== "ACTIVE" || user.deletedAt !== null) {
    throw new AuthorizationError("Administrator account is no longer active");
  }
}

async function lockCurrentAdministrator(actor: Actor, tx: Prisma.TransactionClient): Promise<void> {
  const [user] = await tx.$queryRaw<CurrentAdministrator[]>(Prisma.sql`
    SELECT id, role, status, deleted_at AS deletedAt
    FROM users
    WHERE id = ${actor.id}
    FOR UPDATE
  `);
  requireCurrentAdministrator(user ?? null);
}

async function lockSigningKey(
  keyId: string,
  tx: Prisma.TransactionClient,
): Promise<LockedSigningKey> {
  const [key] = await tx.$queryRaw<LockedSigningKey[]>(Prisma.sql`
    SELECT id, status, compromised_at AS compromisedAt
    FROM signing_keys
    WHERE id = ${keyId}
    FOR UPDATE
  `);
  if (!key) throw new SigningKeyUnavailableError();
  return key;
}

async function assertPublicEd25519Multikey(publicMultikey: string): Promise<void> {
  try {
    const key = await Ed25519Multikey.from({
      type: "Multikey",
      publicKeyMultibase: publicMultikey,
    });
    const exported = await key.export({ publicKey: true });
    if (exported.publicKeyMultibase !== publicMultikey) throw new Error("Non-public multikey");
  } catch {
    throw new Error("Public Ed25519 multikey is invalid");
  }
}

async function recordAudit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  keyId: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: actor.id,
      action,
      entityType: "SigningKey",
      entityId: keyId,
      contextJson: { keyId },
    },
  });
}

export async function registerPublicSigningKey(
  rawInput: SigningKeyRegistrationInput,
  actor: Actor | null | undefined,
): Promise<SigningKeyView> {
  const administrator = requireRole(actor, "ADMIN");
  const input = signingKeyInputSchema.parse(rawInput);
  await assertPublicEd25519Multikey(input.publicMultikey);
  return prisma.$transaction(async (tx) => {
    await lockCurrentAdministrator(administrator, tx);
    const key = await tx.signingKey.create({ data: input });
    await recordAudit(tx, administrator, "signing-key.registered", key.id);
    return toView(key);
  });
}

export async function activateSigningKey(
  keyId: string,
  actor: Actor | null | undefined,
): Promise<SigningKeyView> {
  const administrator = requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    await lockCurrentAdministrator(administrator, tx);

    // This locking read serializes the active-key set (including an empty set via InnoDB gap locks).
    await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM signing_keys WHERE status = 'ACTIVE' ORDER BY id FOR UPDATE
    `);
    const key = await lockSigningKey(keyId, tx);
    if (key.status === "COMPROMISED" || key.compromisedAt !== null) {
      throw new SigningKeyUnavailableError();
    }

    const now = new Date();
    await tx.signingKey.updateMany({
      where: { status: "ACTIVE", id: { not: key.id } },
      data: { status: "RETIRED", retiredAt: now },
    });
    const activated = await tx.signingKey.update({
      where: { id: key.id },
      data: { status: "ACTIVE", activatedAt: now, retiredAt: null },
    });
    await recordAudit(tx, administrator, "signing-key.activated", key.id);
    return toView(activated);
  });
}

export async function retireSigningKey(
  keyId: string,
  actor: Actor | null | undefined,
): Promise<SigningKeyView> {
  const administrator = requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    await lockCurrentAdministrator(administrator, tx);
    const key = await lockSigningKey(keyId, tx);
    if (key.status === "COMPROMISED" || key.compromisedAt !== null) {
      throw new SigningKeyUnavailableError();
    }
    const retired = await tx.signingKey.update({
      where: { id: key.id },
      data: { status: "RETIRED", retiredAt: new Date() },
    });
    await recordAudit(tx, administrator, "signing-key.retired", key.id);
    return toView(retired);
  });
}

export async function markSigningKeyCompromised(
  keyId: string,
  actor: Actor | null | undefined,
): Promise<SigningKeyView> {
  const administrator = requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    await lockCurrentAdministrator(administrator, tx);
    const key = await lockSigningKey(keyId, tx);
    const compromised = await tx.signingKey.update({
      where: { id: key.id },
      data: { status: "COMPROMISED", compromisedAt: new Date() },
    });
    await recordAudit(tx, administrator, "signing-key.compromised", key.id);
    return toView(compromised);
  });
}
