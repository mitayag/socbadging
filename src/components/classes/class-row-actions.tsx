"use client";

import { Archive, Pencil, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";

type ClassAction = (formData: FormData) => void | Promise<void>;

export type ClassRowActionsProps = {
  classItem: {
    id: string;
    courseCode: string;
    title: string;
    section: string;
    term: string;
    academicYear: string;
    description: string | null;
    status: "ACTIVE" | "ARCHIVED";
  };
  canManage: boolean;
  actions: {
    edit: ClassAction;
    status: ClassAction;
  };
};

export function ClassRowActions({ classItem, canManage, actions }: ClassRowActionsProps) {
  const editDialog = useRef<HTMLDialogElement>(null);
  const statusDialog = useRef<HTMLDialogElement>(null);
  const [nextStatus, setNextStatus] = useState<"ACTIVE" | "ARCHIVED" | null>(null);
  const archiving = nextStatus === "ARCHIVED";
  const currentArchiving = classItem.status === "ACTIVE";
  const actionLabel = currentArchiving ? "Archive" : "Reopen";
  const title = `${classItem.courseCode} · ${classItem.title}`;

  function closeStatus() {
    statusDialog.current?.close();
    setNextStatus(null);
  }

  function openStatus() {
    setNextStatus(classItem.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE");
    statusDialog.current?.showModal();
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>, close: () => void) {
    if (event.target === event.currentTarget) close();
  }

  return (
    <div className="faculty-actions">
      <Link
        aria-label={`Open roster for ${title}`}
        className="text-button"
        href={`/classes/${encodeURIComponent(classItem.id)}/students`}
      >
        Roster
      </Link>
      <Link
        aria-label={`Open badge templates for ${title}`}
        className="text-button"
        href={`/classes/${encodeURIComponent(classItem.id)}/badges`}
      >
        Badges
      </Link>
      {canManage ? (
        <>
          <button
            aria-label={`Edit ${title}`}
            className="icon-button"
            onClick={() => editDialog.current?.showModal()}
            title="Edit class"
            type="button"
          >
            <Pencil aria-hidden="true" size={16} />
          </button>
          <button
            aria-label={`${actionLabel} ${title}`}
            className={`icon-button ${currentArchiving ? "danger" : ""}`}
            onClick={openStatus}
            title={currentArchiving ? "Archive class" : "Reopen class"}
            type="button"
          >
            {currentArchiving ? (
              <Archive aria-hidden="true" size={16} />
            ) : (
              <RotateCcw aria-hidden="true" size={16} />
            )}
          </button>
        </>
      ) : (
        <span className="muted">Read-only</span>
      )}

      <dialog
        aria-labelledby={`edit-class-${classItem.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => editDialog.current?.close())}
        ref={editDialog}
      >
        <form action={actions.edit} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Class Workspace</span>
              <h2 id={`edit-class-${classItem.id}`}>Edit {title}</h2>
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
          <input name="classId" type="hidden" value={classItem.id} />
          <div className="form-grid">
            <label className="field">
              Course Code
              <input
                autoFocus
                defaultValue={classItem.courseCode}
                maxLength={100}
                name="courseCode"
                required
              />
            </label>
            <label className="field">
              Class Title
              <input defaultValue={classItem.title} maxLength={191} name="title" required />
            </label>
            <label className="field">
              Section
              <input defaultValue={classItem.section} maxLength={100} name="section" required />
            </label>
            <label className="field">
              Term
              <input defaultValue={classItem.term} maxLength={100} name="term" required />
            </label>
            <label className="field">
              Academic Year
              <input
                defaultValue={classItem.academicYear}
                name="academicYear"
                pattern="\\d{4}-\\d{4}"
                required
              />
            </label>
            <label className="field full">
              Description
              <input
                defaultValue={classItem.description ?? ""}
                maxLength={4000}
                name="description"
              />
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
        aria-labelledby={`status-class-${classItem.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, closeStatus)}
        onClose={() => setNextStatus(null)}
        ref={statusDialog}
      >
        <form action={actions.status} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Class Status</span>
              <h2 id={`status-class-${classItem.id}`}>
                {archiving ? "Archive" : "Reopen"} {title}?
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
          <input name="classId" type="hidden" value={classItem.id} />
          <input name="status" type="hidden" value={nextStatus ?? ""} />
          <p className="muted">
            {archiving
              ? "Archived classes remain available for historical records but are closed for new work."
              : "Reopening restores the class workspace for current use."}
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={closeStatus} type="button">
              Cancel
            </button>
            <button className={archiving ? "danger-button" : "primary-button"}>
              {archiving ? "Archive Class" : "Reopen Class"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
