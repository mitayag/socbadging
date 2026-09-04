import type { Role } from "@/modules/identity/types";
import type { BatchCommitActionState } from "@/modules/issuance/batch-types";

import { BatchIssuanceWizard } from "./batch-issuance-wizard";

export function BatchIssuanceSection({
  role,
  classId,
  badgeOptions,
  commitAction,
}: {
  role: Role;
  classId: string;
  badgeOptions: Array<{ id: string; name: string }>;
  commitAction: (
    previousState: BatchCommitActionState,
    formData: FormData,
  ) => Promise<BatchCommitActionState>;
}) {
  if (role !== "FACULTY") return null;
  return (
    <BatchIssuanceWizard
      badgeOptions={badgeOptions}
      classId={classId}
      commitAction={commitAction}
    />
  );
}
