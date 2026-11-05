"use client";

import { Ban, KeyRound, Pencil, Trash2, UserCheck, UserX, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { DepartmentSelect } from "./department-select";

type FacultyStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
type AccessStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type FacultyAction = (formData: FormData) => void | Promise<void>;

type DepartmentOption = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
};

export type FacultyRowActionsProps = {
  faculty: {
    id: string;
    name: string;
    email: string;
    employeeId: string | null;
    departmentId: string | null;
    title: string | null;
    bio: string | null;
    status: FacultyStatus;
  };
  departments: DepartmentOption[];
  query: Record<string, string>;
  editOpen?: boolean;
  actions: {
    edit: FacultyAction;
    status: FacultyAction;
    reset: FacultyAction;
    delete: FacultyAction;
  };
};

const accessCopy: Record<AccessStatus, { label: string; description: string; danger: boolean }> = {
  ACTIVE: {
    label: "Activate account",
    description: "The faculty member will be able to sign in again immediately.",
    danger: false,
  },
  INACTIVE: {
    label: "Deactivate account",
    description:
      "The faculty member will lose access immediately. Classes, badges, and issued credentials are preserved.",
    danger: true,
  },
  SUSPENDED: {
    label: "Suspend account",
    description:
      "The faculty member will be signed out and blocked from access until reactivated. Historical records are preserved.",
    danger: true,
  },
};

function QueryFields({ query }: { query: Record<string, string> }) {
  return (
    <>
      {Object.entries(query).map(([key, value]) =>
        value ? <input key={key} name={key} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

export function FacultyRowActions({
  faculty,
  departments,
  query,
  editOpen = false,
  actions,
}: FacultyRowActionsProps) {
  const editDialog = useRef<HTMLDialogElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const statusDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [statusTarget, setStatusTarget] = useState<AccessStatus | null>(null);

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

  const access = statusTarget ? accessCopy[statusTarget] : null;

  return (
    <div className="faculty-actions">
      <button
        aria-label={`Edit ${faculty.name}`}
        className="icon-button"
        onClick={() => editDialog.current?.showModal()}
        title="Edit faculty details"
        type="button"
      >
        <Pencil aria-hidden="true" size={16} />
      </button>

      {faculty.status !== "ACTIVE" ? (
        <button
          aria-label={`Activate ${faculty.name}`}
          className="icon-button"
          onClick={() => setStatusTarget("ACTIVE")}
          title="Activate account"
          type="button"
        >
          <UserCheck aria-hidden="true" size={16} />
        </button>
      ) : null}
      {faculty.status !== "INACTIVE" ? (
        <button
          aria-label={`Deactivate ${faculty.name}`}
          className="icon-button"
          onClick={() => setStatusTarget("INACTIVE")}
          title="Deactivate account"
          type="button"
        >
          <UserX aria-hidden="true" size={16} />
        </button>
      ) : null}
      {faculty.status !== "SUSPENDED" ? (
        <button
          aria-label={`Suspend ${faculty.name}`}
          className="icon-button danger"
          onClick={() => setStatusTarget("SUSPENDED")}
          title="Suspend account"
          type="button"
        >
          <Ban aria-hidden="true" size={16} />
        </button>
      ) : null}
      <button
        aria-label={`Reset access for ${faculty.name}`}
        className="icon-button"
        onClick={() => resetDialog.current?.showModal()}
        title="Reset access"
        type="button"
      >
        <KeyRound aria-hidden="true" size={16} />
      </button>

      <button
        aria-label={`Delete ${faculty.name}`}
        className="icon-button danger"
        onClick={() => deleteDialog.current?.showModal()}
        title="Delete faculty account"
        type="button"
      >
        <Trash2 aria-hidden="true" size={16} />
      </button>

      <dialog
        aria-labelledby={`edit-faculty-${faculty.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => editDialog.current?.close())}
        ref={editDialog}
      >
        <form action={actions.edit} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Faculty Account</span>
              <h2 id={`edit-faculty-${faculty.id}`}>Edit {faculty.name}</h2>
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
          <input name="userId" type="hidden" value={faculty.id} />
          <QueryFields query={query} />
          <div className="form-grid">
            <label className="field">
              Full Name
              <input
                autoFocus
                defaultValue={faculty.name}
                maxLength={191}
                minLength={2}
                name="name"
                required
              />
            </label>
            <label className="field">
              Email
              <input defaultValue={faculty.email} name="email" required type="email" />
            </label>
            <label className="field">
              Employee ID
              <input defaultValue={faculty.employeeId ?? ""} maxLength={100} name="employeeId" />
            </label>
            <label className="field">
              Department
              <DepartmentSelect
                currentDepartmentId={faculty.departmentId}
                departments={departments}
              />
            </label>
            <label className="field">
              Title
              <input defaultValue={faculty.title ?? ""} maxLength={191} name="title" />
            </label>
            <label className="field full">
              Bio
              <input defaultValue={faculty.bio ?? ""} maxLength={2000} name="bio" />
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
        aria-labelledby={`reset-faculty-${faculty.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => resetDialog.current?.close())}
        ref={resetDialog}
      >
        <form action={actions.reset} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Account Security</span>
              <h2 id={`reset-faculty-${faculty.id}`}>Reset access for {faculty.name}</h2>
            </div>
            <button
              aria-label="Close reset dialog"
              className="icon-button"
              onClick={() => resetDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <input name="userId" type="hidden" value={faculty.id} />
          <QueryFields query={query} />
          <label className="field">
            New Temporary Password
            <input
              autoComplete="new-password"
              maxLength={200}
              minLength={14}
              name="temporaryPassword"
              required
              type="password"
            />
          </label>
          <p className="muted">
            The faculty member will be signed out of all devices. Share the temporary password
            through a secure channel.
          </p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => resetDialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button className="primary-button">Reset Access</button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby={`status-faculty-${faculty.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, closeStatus)}
        onClose={() => setStatusTarget(null)}
        ref={statusDialog}
      >
        <form action={actions.status} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Account Access</span>
              <h2 id={`status-faculty-${faculty.id}`}>
                {access?.label ?? "Update account"} for {faculty.name}
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
          <input name="userId" type="hidden" value={faculty.id} />
          <input name="status" type="hidden" value={statusTarget ?? ""} />
          <QueryFields query={query} />
          <p className="muted">{access?.description}</p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={closeStatus} type="button">
              Cancel
            </button>
            <button className={access?.danger ? "danger-button" : "primary-button"}>
              {access?.label ?? "Confirm"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby={`delete-faculty-${faculty.id}`}
        className="faculty-dialog"
        onClick={(event) => closeOnBackdrop(event, () => deleteDialog.current?.close())}
        ref={deleteDialog}
      >
        <form action={actions.delete} className="faculty-dialog-form">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Permanent Account Removal</span>
              <h2 id={`delete-faculty-${faculty.id}`}>Delete {faculty.name}?</h2>
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
          <input name="userId" type="hidden" value={faculty.id} />
          <QueryFields query={query} />
          <p className="muted">
            Access ends immediately. The account is soft-deleted so classes, badges, issued
            credentials, and audit history remain preserved.
          </p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => deleteDialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button className="danger-button">Confirm Delete Faculty</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
