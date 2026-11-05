"use client";

import { Ban, Mail, Pencil, Send, Trash2, UserCheck, X } from "lucide-react";

import { StudentPasswordResetDialog } from "./student-password-reset-dialog";
import { useEffect, useRef, useState, type MouseEvent } from "react";

type StudentStatus = "NOT_ACTIVATED" | "INVITED" | "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
type AccessStatus = "ACTIVE" | "SUSPENDED";
type StudentAction = (formData: FormData) => void | Promise<void>;

export type StudentRowActionsProps = {
  student: {
    studentId: string;
    studentNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    accountStatus: StudentStatus;
  };
  query: Record<string, string>;
  editOpen?: boolean;
  actions: {
    edit: StudentAction;
    status: StudentAction;
    delete: StudentAction;
    invite: StudentAction;
    resend: StudentAction;
    resetPassword: StudentAction;
    sendResetLink: StudentAction;
  };
};

const fullName = (student: { firstName: string; lastName: string }) =>
  `${student.firstName} ${student.lastName}`.trim();

function QueryFields({ query }: { query: Record<string, string> }) {
  return (
    <>
      {Object.entries(query).map(([key, value]) =>
        value ? <input key={key} name={key} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

export function StudentRowActions({
  student,
  query,
  editOpen = false,
  actions,
}: StudentRowActionsProps) {
  const editDialog = useRef<HTMLDialogElement>(null);
  const statusDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [statusTarget, setStatusTarget] = useState<AccessStatus | null>(null);
  const name = fullName(student);
  const hasAccount =
    student.accountStatus !== "NOT_ACTIVATED" && student.accountStatus !== "INVITED";
  const isDeleted = student.accountStatus === "DELETED" || student.accountStatus === "INACTIVE";

  useEffect(() => {
    if (editOpen && !editDialog.current?.open) editDialog.current?.showModal();
  }, [editOpen]);

  useEffect(() => {
    if (statusTarget && !statusDialog.current?.open) statusDialog.current?.showModal();
  }, [statusTarget]);

  function closeStatus() {
    statusDialog.current?.close();
    setStatusTarget(null);
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>, close: () => void) {
    if (event.target === event.currentTarget) close();
  }

  const statusCopy = statusTarget
    ? statusTarget === "ACTIVE"
      ? {
          label: "Activate portal account",
          description: "The student will be able to sign in to the portal again.",
          danger: false,
        }
      : {
          label: "Suspend portal account",
          description:
            "The student will be signed out and blocked from portal access until reactivated. Issued badges remain valid.",
          danger: true,
        }
    : null;

  return (
    <div className="faculty-actions">
      <button
        aria-label={`Edit ${name}`}
        className="icon-button"
        onClick={() => editDialog.current?.showModal()}
        title="Edit student details"
        type="button"
      >
        <Pencil aria-hidden="true" size={16} />
      </button>

      {!hasAccount ? (
        <form action={student.accountStatus === "INVITED" ? actions.resend : actions.invite}>
          <input name="studentId" type="hidden" value={student.studentId} />
          <QueryFields query={query} />
          <button
            aria-label={
              student.accountStatus === "INVITED"
                ? `Resend invitation to ${name}`
                : `Send invitation to ${name}`
            }
            className="icon-button"
            title={student.accountStatus === "INVITED" ? "Resend invitation" : "Send invitation"}
            type="submit"
          >
            {student.accountStatus === "INVITED" ? (
              <Send aria-hidden="true" size={16} />
            ) : (
              <Mail aria-hidden="true" size={16} />
            )}
          </button>
        </form>
      ) : (
        <>
          {student.accountStatus !== "ACTIVE" ? (
            <button
              aria-label={`Activate ${name}`}
              className="icon-button"
              onClick={() => setStatusTarget("ACTIVE")}
              title="Activate portal account"
              type="button"
            >
              <UserCheck aria-hidden="true" size={16} />
            </button>
          ) : null}
          {student.accountStatus !== "SUSPENDED" && !isDeleted ? (
            <button
              aria-label={`Suspend ${name}`}
              className="icon-button danger"
              onClick={() => setStatusTarget("SUSPENDED")}
              title="Suspend portal account"
              type="button"
            >
              <Ban aria-hidden="true" size={16} />
            </button>
          ) : null}
          {!isDeleted ? (
            <button
              aria-label={`Delete ${name}`}
              className="icon-button danger"
              onClick={() => deleteDialog.current?.showModal()}
              title="Delete portal account"
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
            </button>
          ) : null}
        </>
      )}

      {hasAccount ? (
        <StudentPasswordResetDialog
          actions={{ direct: actions.resetPassword, email: actions.sendResetLink }}
          canReset={student.accountStatus === "ACTIVE"}
          email={student.email}
          query={query}
          studentId={student.studentId}
          studentName={name}
        />
      ) : null}

      <dialog
        aria-labelledby={`edit-student-${student.studentId}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => editDialog.current?.close())}
        ref={editDialog}
      >
        <form action={actions.edit} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Student Record</span>
              <h2 id={`edit-student-${student.studentId}`}>Edit {name}</h2>
            </div>
            <button
              aria-label="Close edit dialog"
              className="icon-button"
              onClick={() => editDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <input name="studentId" type="hidden" value={student.studentId} />
          <QueryFields query={query} />
          <div className="form-grid">
            <label className="field">
              Student Number
              <input
                autoFocus
                defaultValue={student.studentNumber}
                maxLength={100}
                name="studentNumber"
                required
              />
            </label>
            <label className="field">
              Email
              <input defaultValue={student.email} name="email" required type="email" />
            </label>
            <label className="field">
              First Name
              <input defaultValue={student.firstName} maxLength={191} name="firstName" required />
            </label>
            <label className="field">
              Last Name
              <input defaultValue={student.lastName} maxLength={191} name="lastName" required />
            </label>
          </div>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => editDialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button className="primary-button">Save Changes</button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby={`status-student-${student.studentId}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, closeStatus)}
        onClose={() => setStatusTarget(null)}
        ref={statusDialog}
      >
        <form action={actions.status} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Portal Access</span>
              <h2 id={`status-student-${student.studentId}`}>
                {statusCopy?.label ?? "Update account"} for {name}
              </h2>
            </div>
            <button
              aria-label="Close status dialog"
              className="icon-button"
              onClick={closeStatus}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <input name="studentId" type="hidden" value={student.studentId} />
          <input name="status" type="hidden" value={statusTarget ?? ""} />
          <QueryFields query={query} />
          <p className="muted">{statusCopy?.description}</p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={closeStatus} type="button">
              Cancel
            </button>
            <button className={statusCopy?.danger ? "danger-button" : "primary-button"}>
              {statusCopy?.label ?? "Confirm"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby={`delete-student-${student.studentId}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => deleteDialog.current?.close())}
        ref={deleteDialog}
      >
        <form action={actions.delete} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Portal Account Removal</span>
              <h2 id={`delete-student-${student.studentId}`}>
                Delete {name}&apos;s portal account?
              </h2>
            </div>
            <button
              aria-label="Close delete dialog"
              className="icon-button"
              onClick={() => deleteDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <input name="studentId" type="hidden" value={student.studentId} />
          <QueryFields query={query} />
          <p className="muted">
            The portal account will be deactivated and signed out. The student record, class
            assignments, and issued badges are preserved for audit and verification.
          </p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => deleteDialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button className="danger-button">Delete Portal Account</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
