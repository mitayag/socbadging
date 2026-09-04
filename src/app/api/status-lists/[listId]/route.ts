import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  SignedStatusListCredentialSchema,
  decodeStatusListBytes,
} from "@/modules/open-badges/credential-schema";
import { prisma } from "@/platform/db/prisma";

export const dynamic = "force-dynamic";

const StatusListIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);

const jsonLdHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/ld+json; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function unavailableResponse(): Response {
  return new Response('{"error":"Status list unavailable"}', {
    status: 503,
    headers: jsonLdHeaders,
  });
}

function notFoundResponse(): Response {
  return new Response('{"error":"Not found"}', { status: 404, headers: jsonLdHeaders });
}

function readDecodedStatus(bytes: Uint8Array, index: number): boolean {
  const capacity = bytes.length * 8;
  if (!Number.isSafeInteger(index) || index < 0 || index >= capacity) {
    throw new RangeError("Status-list allocation index is outside the signed list");
  }
  const byte = bytes[Math.floor(index / 8)] ?? 0;
  return (byte & (1 << (7 - (index % 8)))) !== 0;
}

function isCurrentSignedList(
  list: {
    signingKeyId: string | null;
    version: number;
    signingKey: { id: string; verificationMethodUrl: string } | null;
    allocations: Array<{ index: number; isRevoked: boolean; statusListVersion: number }>;
  },
  signed: z.output<typeof SignedStatusListCredentialSchema>,
): boolean {
  if (
    !list.signingKey ||
    list.signingKey.id !== list.signingKeyId ||
    signed.proof.verificationMethod !== list.signingKey.verificationMethodUrl
  ) {
    return false;
  }
  const decoded = decodeStatusListBytes(signed.credentialSubject.encodedList);
  return list.allocations.every((allocation) => {
    const signedRevoked = readDecodedStatus(decoded, allocation.index);
    if (signedRevoked !== allocation.isRevoked) return false;
    // A new active issuance is represented by an implicit zero bit, so it does not need a new
    // list publication. A revoked allocation, however, is current only when this exact list
    // version published its one-bit state.
    return allocation.isRevoked
      ? allocation.statusListVersion === list.version
      : allocation.statusListVersion <= list.version;
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ listId: string }> },
): Promise<Response> {
  try {
    const listId = StatusListIdSchema.safeParse((await params).listId);
    if (!listId.success) return notFoundResponse();

    const list = await prisma.credentialStatusList.findUnique({
      where: { id: listId.data },
      select: {
        publicUrl: true,
        signedCredentialJson: true,
        signingKeyId: true,
        digest: true,
        version: true,
        signingKey: { select: { id: true, verificationMethodUrl: true } },
        allocations: { select: { index: true, isRevoked: true, statusListVersion: true } },
      },
    });
    if (!list) return notFoundResponse();
    if (!list.signedCredentialJson || !list.signingKeyId || !list.digest)
      return unavailableResponse();

    const signed = SignedStatusListCredentialSchema.safeParse(list.signedCredentialJson);
    if (
      !signed.success ||
      signed.data.id !== list.publicUrl ||
      !isCurrentSignedList(list, signed.data)
    ) {
      return unavailableResponse();
    }

    const body = JSON.stringify(signed.data);
    const digest = createHash("sha256").update(body).digest("hex");
    if (digest !== list.digest) return unavailableResponse();

    return new Response(body, {
      headers: { ...jsonLdHeaders, ETag: `"${digest}"` },
    });
  } catch {
    return unavailableResponse();
  }
}
