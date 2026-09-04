import { gzipSync } from "node:zlib";

import type { StatusAllocationReservation } from "@/modules/issuance/services/status-allocation-service";

import {
  BitstringStatusListEntrySchema,
  CanonicalResourceUrlSchema,
  decodeStatusListBytes,
  MAX_BITSTRING_STATUS_LIST_BYTES,
  MIN_BITSTRING_STATUS_LIST_BYTES,
  type BitstringStatusListEntry,
} from "./credential-schema";

export const MIN_BITSTRING_STATUS_LIST_CAPACITY = MIN_BITSTRING_STATUS_LIST_BYTES * 8;

function assertIndex(index: number, capacity: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= capacity) {
    throw new RangeError(`Status-list index must be between 0 and ${capacity - 1}`);
  }
}

function assertCapacity(capacity: number): void {
  if (
    !Number.isSafeInteger(capacity) ||
    capacity <= 0 ||
    capacity % 8 !== 0 ||
    capacity / 8 > MAX_BITSTRING_STATUS_LIST_BYTES
  ) {
    throw new RangeError("Status-list capacity must be a positive byte-aligned safe integer");
  }
}

export function buildStatusListEntry(
  allocation: StatusAllocationReservation,
): BitstringStatusListEntry {
  const statusUrl = CanonicalResourceUrlSchema.parse(allocation.statusUrl);
  if (!Number.isSafeInteger(allocation.index) || allocation.index < 0) {
    throw new RangeError("Status-list index must be a non-negative safe integer");
  }
  const statusListIndex = String(allocation.index);
  return BitstringStatusListEntrySchema.parse({
    id: `${statusUrl}#${statusListIndex}`,
    type: "BitstringStatusListEntry",
    statusPurpose: "revocation",
    statusListIndex,
    statusListCredential: statusUrl,
  });
}

export function encodeRevocationList(indices: number[], capacity: number): string {
  assertCapacity(capacity);
  const bytes = Buffer.alloc(capacity / 8);
  for (const index of indices) {
    assertIndex(index, capacity);
    const byteIndex = Math.floor(index / 8);
    bytes[byteIndex] = (bytes[byteIndex] ?? 0) | (1 << (7 - (index % 8)));
  }
  const compressed = gzipSync(bytes, { level: 6 });
  // RFC 1952 header fields do not affect expansion. Normalize XFL and OS to the
  // values emitted by the pinned status-list implementation so serialization
  // remains stable across Node/zlib releases.
  compressed[8] = 0;
  compressed[9] = 3;
  return `u${compressed.toString("base64url")}`;
}

export function readRevocationStatus(encodedList: string, index: number): boolean {
  const bytes = decodeStatusListBytes(encodedList);
  const capacity = bytes.length * 8;
  assertIndex(index, capacity);
  const byte = bytes[Math.floor(index / 8)] ?? 0;
  return (byte & (1 << (7 - (index % 8)))) !== 0;
}
