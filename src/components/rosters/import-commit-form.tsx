"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import type { ImportCommitState, ImportPreview } from "./import-types";

const initialCommitState: ImportCommitState = {
  status: "idle",
  message: "",
  importedCount: 0,
};

export function ImportCommitForm({
  commitAction,
  onSuccess,
  preview,
}: {
  commitAction: (
    previousState: ImportCommitState,
    formData: FormData,
  ) => Promise<ImportCommitState>;
  onSuccess: (state: ImportCommitState) => void;
  preview: ImportPreview;
}) {
  const [state, formAction, pending] = useActionState(commitAction, initialCommitState);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (state.status === "success") onSuccess(state);
  }, [onSuccess, state]);

  return (
    <form action={formAction} className="import-commit-panel">
      <div className="import-commit-heading">
        <ShieldCheck aria-hidden size={22} />
        <div>
          <h4>Confirm roster import</h4>
          <p>
            This adds {preview.validCount} {preview.validCount === 1 ? "student" : "students"} to
            the class roster. Existing student records are matched by student number.
          </p>
        </div>
      </div>
      <input name="previewId" type="hidden" value={preview.id} />
      <label className="check-field">
        <input
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        I reviewed these students and want to add them to this class roster.
      </label>
      {state.status === "error" ? (
        <p aria-live="polite" className="auth-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="import-action-row">
        <button className="primary-button import-primary-action" disabled={!confirmed || pending}>
          {pending
            ? "Importing students…"
            : `Import ${preview.validCount} ${preview.validCount === 1 ? "Student" : "Students"}`}
        </button>
        <span className="sr-only" role="status">
          {pending ? "Importing students" : ""}
        </span>
      </div>
    </form>
  );
}
