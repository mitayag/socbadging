"use client";

import { useActionState, useState } from "react";

import type { IssueOptions } from "@/modules/issuance/services/issuance-query-service";
import type { IssueBadgeActionState } from "@/modules/issuance/types";

type IssueBadgeFormProps = IssueOptions & {
  classId: string;
  issueAction: (
    previousState: IssueBadgeActionState,
    formData: FormData,
  ) => Promise<IssueBadgeActionState>;
};

function SubmitButton({ disabled, pending }: { disabled: boolean; pending: boolean }) {
  return (
    <button className="primary-button form-submit" disabled={disabled || pending} type="submit">
      {pending ? "Issuing Badge…" : "Issue Badge"}
    </button>
  );
}

const initialState: IssueBadgeActionState = { status: "idle", message: "" };

export function IssueBadgeForm({
  badgeOptions,
  classId,
  issueAction,
  studentOptions,
}: IssueBadgeFormProps) {
  const [state, formAction, pending] = useActionState(issueAction, initialState);
  const [badgeTemplateId, setBadgeTemplateId] = useState("");
  const [studentId, setStudentId] = useState("");
  const selectedBadge = badgeOptions.find((badge) => badge.id === badgeTemplateId);
  const selectedStudent = studentOptions.find((student) => student.id === studentId);
  const cannotIssue = badgeOptions.length === 0 || studentOptions.length === 0;

  return (
    <section aria-labelledby="issue-badge-heading" className="panel issue-badge-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Individual Issuance</span>
          <h2 id="issue-badge-heading">Issue a Badge</h2>
        </div>
        <p>Only active badges and active class enrollments are available.</p>
      </div>
      {badgeOptions.length === 0 ? (
        <p className="empty-guidance">
          Create an active badge template before issuing a credential.
        </p>
      ) : null}
      {studentOptions.length === 0 ? (
        <p className="empty-guidance">
          Add an active student to this class before issuing a credential.
        </p>
      ) : null}
      <form action={formAction} className="form-grid">
        <input name="classId" type="hidden" value={classId} />
        <label className="field">
          Badge Template
          <select
            aria-label="Badge Template"
            disabled={badgeOptions.length === 0}
            name="badgeTemplateId"
            onChange={(event) => setBadgeTemplateId(event.target.value)}
            value={badgeTemplateId}
          >
            <option value="">Select a badge</option>
            {badgeOptions.map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Student
          <select
            aria-label="Student"
            disabled={studentOptions.length === 0}
            name="studentId"
            onChange={(event) => setStudentId(event.target.value)}
            value={studentId}
          >
            <option value="">Select a student</option>
            {studentOptions.map((student) => (
              <option key={student.id} value={student.id}>
                {student.studentNumber} · {student.displayName}
              </option>
            ))}
          </select>
        </label>
        <div aria-live="polite" className="issuance-confirmation field full">
          <strong>Confirmation</strong>
          <p>
            {selectedBadge && selectedStudent
              ? `${selectedBadge.name} will be issued to ${selectedStudent.displayName} (${selectedStudent.studentNumber}).`
              : "Select a badge and student to review the issuance."}
          </p>
        </div>
        {state.status !== "idle" ? (
          <p aria-live="polite" className="form-error field full" role="status">
            {state.message}
          </p>
        ) : null}
        <SubmitButton
          disabled={cannotIssue || !selectedBadge || !selectedStudent}
          pending={pending}
        />
      </form>
    </section>
  );
}
