import type { Role } from "@/modules/identity/types";
import type { IssueOptions } from "@/modules/issuance/services/issuance-query-service";
import type { IssueBadgeActionState } from "@/modules/issuance/types";

import { IssueBadgeForm } from "./issue-badge-form";

export function IssueBadgeSection({
  classId,
  issueAction,
  options,
  role,
}: {
  classId: string;
  issueAction: (
    previousState: IssueBadgeActionState,
    formData: FormData,
  ) => Promise<IssueBadgeActionState>;
  options: IssueOptions | null;
  role: Role;
}) {
  if (role !== "FACULTY" || !options) return null;

  return <IssueBadgeForm {...options} classId={classId} issueAction={issueAction} />;
}
