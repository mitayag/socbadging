import "server-only";

import { Prisma } from "@prisma/client";

type LockedIssuance = { id: string };
type AvailableStatusList = { id: string; publicUrl: string; nextIndex: number };
type AdvisoryLockResult = { acquired: number | bigint };
export type StatusAllocationReservation = { listId: string; index: number; statusUrl: string };

const minimumSignedStatusListCapacity = 131_072;

export class StatusAllocationUnavailableError extends Error {
  constructor(message = "Credential status allocation is unavailable") {
    super(message);
    this.name = "StatusAllocationUnavailableError";
  }
}

async function withStatusAllocationLock<T>(
  tx: Prisma.TransactionClient,
  callback: () => Promise<T>,
): Promise<T> {
  const [lock] = await tx.$queryRaw<AdvisoryLockResult[]>(Prisma.sql`
    SELECT GET_LOCK('hau-soc:credential-status-allocation', 10) AS acquired
  `);
  if (!lock || Number(lock.acquired) !== 1) {
    throw new StatusAllocationUnavailableError("Credential status allocation lock is unavailable");
  }

  try {
    return await callback();
  } finally {
    await tx.$queryRaw(Prisma.sql`SELECT RELEASE_LOCK('hau-soc:credential-status-allocation')`);
  }
}

/**
 * Reserves a status-list cursor slot without creating a recipient-linked allocation row. A failed
 * signing attempt may leave a harmless gap; only the later issuance commit makes the slot visible.
 */
export async function reserveUnassignedStatusAllocation(
  tx: Prisma.TransactionClient,
): Promise<StatusAllocationReservation> {
  return withStatusAllocationLock(tx, async () => {
    const [list] = await tx.$queryRaw<AvailableStatusList[]>(Prisma.sql`
      SELECT id, public_url AS publicUrl, next_index AS nextIndex
      FROM credential_status_lists
      WHERE purpose = 'revocation'
        AND capacity >= ${minimumSignedStatusListCapacity}
        AND next_index < capacity
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE
    `);
    if (!list) throw new StatusAllocationUnavailableError("No credential status list has capacity");

    const allocated = await tx.$executeRaw(Prisma.sql`
      UPDATE credential_status_lists
      SET next_index = next_index + 1
      WHERE id = ${list.id} AND next_index = ${list.nextIndex} AND next_index < capacity
    `);
    if (allocated !== 1) {
      throw new StatusAllocationUnavailableError(
        "Credential status list capacity changed during allocation",
      );
    }
    return { listId: list.id, index: list.nextIndex, statusUrl: list.publicUrl };
  });
}

export async function reserveStatusAllocation(
  tx: Prisma.TransactionClient,
  issuancePublicId: string,
): Promise<StatusAllocationReservation> {
  const [issuance] = await tx.$queryRaw<LockedIssuance[]>(Prisma.sql`
    SELECT id
    FROM badge_issuances
    WHERE public_id = ${issuancePublicId}
    FOR UPDATE
  `);
  if (!issuance) throw new StatusAllocationUnavailableError("Credential issuance is unavailable");

  // Preserve the legacy allocation contract for existing issuance rows, including small test/dev
  // lists. New signed issuance uses reserveUnassignedStatusAllocation and requires publishable size.
  return withStatusAllocationLock(tx, async () => {
    const existing = await tx.credentialStatusAllocation.findUnique({
      where: { issuanceId: issuance.id },
      include: { statusList: { select: { publicUrl: true } } },
    });
    if (existing) {
      return {
        listId: existing.statusListId,
        index: existing.index,
        statusUrl: existing.statusList.publicUrl,
      };
    }
    const [list] = await tx.$queryRaw<AvailableStatusList[]>(Prisma.sql`
      SELECT id, public_url AS publicUrl, next_index AS nextIndex
      FROM credential_status_lists
      WHERE purpose = 'revocation' AND next_index < capacity
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE
    `);
    if (!list) throw new StatusAllocationUnavailableError("No credential status list has capacity");
    const allocated = await tx.$executeRaw(Prisma.sql`
      UPDATE credential_status_lists
      SET next_index = next_index + 1
      WHERE id = ${list.id} AND next_index = ${list.nextIndex} AND next_index < capacity
    `);
    if (allocated !== 1) {
      throw new StatusAllocationUnavailableError(
        "Credential status list capacity changed during allocation",
      );
    }
    await tx.credentialStatusAllocation.create({
      data: { issuanceId: issuance.id, statusListId: list.id, index: list.nextIndex },
    });
    return { listId: list.id, index: list.nextIndex, statusUrl: list.publicUrl };
  });
}
