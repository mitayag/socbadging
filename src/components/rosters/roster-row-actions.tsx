"use client";

import { Pencil, UserMinus, UserPlus, X } from "lucide-react";

import { StudentPasswordResetDialog } from "@/components/student/student-password-reset-dialog";
import { useRef, useState, type MouseEvent } from "react";

type RosterAction = (formData: FormData) => void | Promise<void>;

export function RosterRowActions({
  classId,
  student,
  enrollmentStatus,
  canManage,
  canResetPassword,
  query,
  actions,
}: {
  classId: string;
  student: {
    id: string;
    studentNumber: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  enrollmentStatus: "ACTIVE" | "REMOVED";
  canManage: boolean;
  canResetPassword: boolean;
  query: Record<string, string>;
  actions: {
    edit: RosterAction;
    status: RosterAction;
    resetPassword: RosterAction;
    sendResetLink: RosterAction;
  };
}) {
  const editDialog = useRef<HTMLDialogElement>(null);
  const statusDialog = useRef<HTMLDialogElement>(null);
  const [nextStatus, setNextStatus] = useState<"ACTIVE" | "REMOVED" | null>(null);
  const removing = nextStatus === "REMOVED";
  const currentRemoving = enrollmentStatus === "ACTIVE";
  const actionLabel = currentRemoving ? "Remove" : "Restore";
  const name = `${student.firstName} ${student.lastName}`;
  const title = `${student.studentNumber} · ${name}`;

  function closeStatus() {
    statusDialog.current?.close();
    setNextStatus(null);
  }

  function openStatus() {
    setNextStatus(enrollmentStatus === "ACTIVE" ? "REMOVED" : "ACTIVE");
    statusDialog.current?.showModal();
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>, close: () => void) {
    if (event.target === event.currentTarget) close();
  }

  if (!canManage) {
    return <span className="muted">Read-only</span>;
  }

  return (
    <div className="faculty-actions">
      <button
        aria-label={`Edit ${title}`}
        className="icon-button"
        onClick={() => editDialog.current?.showModal()}
        title="Edit roster student"
        type="button"
      >
        <Pencil aria-hidden="true" size={16} />
      </button>
      <button
        aria-label={`${actionLabel} ${title}`}
        className={`icon-button ${currentRemoving ? "danger" : ""}`}
        onClick={openStatus}
        title={currentRemoving ? "Remove from class" : "Restore enrollment"}
        type="button"
      >
        {currentRemoving ? (
          <UserMinus aria-hidden="true" size={16} />
        ) : (
          <UserPlus aria-hidden="true" size={16} />
        )}
      </button>

      <StudentPasswordResetDialog
        actions={{ direct: actions.resetPassword, email: actions.sendResetLink }}
        canReset={canResetPassword}
        classId={classId}
        email={student.email}
        query={query}
        studentId={student.id}
        studentName={name}
      />

      <dialog
        aria-labelledby={`edit-roster-${student.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => editDialog.current?.close())}
        ref={editDialog}
      >
        <form action={actions.edit} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Roster Student</span>
              <h2 id={`edit-roster-${student.id}`}>Edit {title}</h2>
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
          <input name="classId" type="hidden" value={classId} />
          <input name="studentId" type="hidden" value={student.id} />
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
        aria-labelledby={`status-roster-${student.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, closeStatus)}
        onClose={() => setNextStatus(null)}
        ref={statusDialog}
      >
        <form action={actions.status} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Enrollment Status</span>
              <h2 id={`status-roster-${student.id}`}>
                {removing ? "Remove" : "Restore"} {title}?
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
          <input name="classId" type="hidden" value={classId} />
          <input name="studentId" type="hidden" value={student.id} />
          <input name="status" type="hidden" value={nextStatus ?? ""} />
          <p className="muted">
            {removing
              ? "The student remains in the system and their historical credentials are preserved."
              : "Restoring enrollment makes the student active in this class again."}
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={closeStatus} type="button">
              Cancel
            </button>
            <button className={removing ? "danger-button" : "primary-button"}>
              {removing ? "Remove from Class" : "Restore Enrollment"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
