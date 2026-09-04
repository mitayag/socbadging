export type IssuanceLifecycleStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export type LifecycleAwareIssuance = {
  id: string;
  publicId: string;
  status: IssuanceLifecycleStatus;
  supersedesId: string | null;
  supersededById: string | null;
};

const failClosedStatusRank: Record<IssuanceLifecycleStatus, number> = {
  REVOKED: 2,
  EXPIRED: 1,
  ACTIVE: 0,
};

function compareIdentifier(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deterministicFallback<T extends LifecycleAwareIssuance>(left: T, right: T): number {
  const statusDifference = failClosedStatusRank[right.status] - failClosedStatusRank[left.status];
  if (statusDifference !== 0) return statusDifference;
  const idDifference = compareIdentifier(left.id, right.id);
  return idDifference !== 0 ? idDifference : compareIdentifier(left.publicId, right.publicId);
}

function evaluateChain<T extends LifecycleAwareIssuance>(
  terminal: T,
  byId: ReadonlyMap<string, T>,
): { complete: boolean; depth: number } {
  const visited = new Set<string>([terminal.id]);
  let depth = 0;
  let current = terminal;
  while (true) {
    if (current.supersedesId === null) return { complete: true, depth };
    const predecessor = byId.get(current.supersedesId);
    if (!predecessor || predecessor.supersededById !== current.id || visited.has(predecessor.id)) {
      return { complete: false, depth };
    }
    visited.add(predecessor.id);
    current = predecessor;
    depth += 1;
  }
}

/**
 * Selects the current credential for one source tuple. Complete reciprocal replacement chains win;
 * malformed/disconnected data falls back deterministically and prefers terminal fail-closed state.
 */
export function selectCurrentIssuance<T extends LifecycleAwareIssuance>(
  issuances: readonly T[],
): T | undefined {
  if (issuances.length === 0) return undefined;

  const ordered = [...issuances].sort(deterministicFallback);
  const byId = new Map(ordered.map((issuance) => [issuance.id, issuance]));
  const completeChains = ordered
    .filter((issuance) => issuance.supersededById === null)
    .map((issuance) => ({ issuance, ...evaluateChain(issuance, byId) }))
    .filter((candidate) => candidate.complete);
  if (completeChains.length === 0) return ordered[0];

  return completeChains.sort(
    (left, right) =>
      right.depth - left.depth || deterministicFallback(left.issuance, right.issuance),
  )[0]?.issuance;
}

export function selectCurrentIssuancesByStudentId<
  T extends LifecycleAwareIssuance & { studentId: string },
>(issuances: readonly T[]): Map<string, T> {
  const grouped = new Map<string, T[]>();
  for (const issuance of issuances) {
    const group = grouped.get(issuance.studentId);
    if (group) group.push(issuance);
    else grouped.set(issuance.studentId, [issuance]);
  }

  const selected = new Map<string, T>();
  for (const [studentId, group] of grouped) {
    const current = selectCurrentIssuance(group);
    if (current) selected.set(studentId, current);
  }
  return selected;
}
